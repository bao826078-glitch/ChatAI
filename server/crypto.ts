import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit NIST recommended nonce for GCM
const KEY_LENGTH = 32; // 256-bit AES key
const BACKUP_FORMAT = 'chatai-master-key-backup';

export type MasterKeyHealthStatus = 'ready' | 'missing' | 'corrupted' | 'mismatch' | 'permission_warning';

export interface MasterKeyFileData {
  version: number;
  activeKeyVersion: number;
  keys: Record<string, string>; // keyVersion -> base64(32-byte key)
  createdAt: string;
  updatedAt: string;
}

export interface EncryptedEnvelope {
  version: number;
  key_version: number;
  algorithm: 'aes-256-gcm';
  iv: string;
  auth_tag: string;
  ciphertext: string;
}

export interface MasterKeyDiagnostics {
  status: MasterKeyHealthStatus;
  activeKeyVersion: number;
  availableVersions: number[];
  fingerprint: string;
  keyFilePath: string;
  secretsDir: string;
  filePermissions: string | null;
  permissionsSecure: boolean;
  errorCode?: string;
  errorMessage?: string;
}

let cachedSessionSecret: Buffer | null = null;

function resolveDbDirectory(dbDir?: string): string {
  if (dbDir) return path.resolve(dbDir);
  const rawPath = process.env.DB_PATH || process.env.SQLITE_DB_PATH || 'data/chatai.db';
  const resolvedDbPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
  return path.dirname(resolvedDbPath);
}

export function getSecretsDir(dbDir?: string): string {
  const baseDir = resolveDbDirectory(dbDir);
  const customDir = process.env.CHATAI_SECRETS_DIR?.trim();
  if (customDir) {
    return path.isAbsolute(customDir) ? path.resolve(customDir) : path.resolve(baseDir, customDir);
  }
  return path.resolve(baseDir, 'secrets');
}

export function getMasterKeyFilePath(dbDir?: string): string {
  const secretsDir = getSecretsDir(dbDir);
  const target = path.resolve(secretsDir, 'master.key');
  // Path traversal defense: ensure file remains strictly inside secretsDir
  if (!target.startsWith(secretsDir + path.sep)) {
    throw new Error('Resolved master key path escapes secrets directory.');
  }
  return target;
}

export function computeKeyFingerprint(keyBuffer: Buffer): string {
  return crypto.createHash('sha256').update(keyBuffer).digest('hex').slice(0, 16);
}

function parseKeyBuffer(b64OrHex: string): Buffer | null {
  const clean = (b64OrHex || '').trim();
  if (!clean) return null;
  if (/^[a-f0-9]{64}$/i.test(clean)) {
    return Buffer.from(clean, 'hex');
  }
  try {
    const buf = Buffer.from(clean, 'base64');
    return buf.length === KEY_LENGTH ? buf : null;
  } catch {
    return null;
  }
}

function readAndValidateMasterKeyFile(keyFilePath: string): {
  ok: boolean;
  status: MasterKeyHealthStatus;
  data?: MasterKeyFileData;
  fileMode?: string;
  permissionsSecure?: boolean;
  errorCode?: string;
  errorMessage?: string;
} {
  if (!fs.existsSync(keyFilePath)) {
    return {
      ok: false,
      status: 'missing',
      errorCode: 'MASTER_KEY_MISSING',
      errorMessage: 'Master encryption key file is missing. Restore it from a backup; ChatAI will not generate a replacement key automatically.',
    };
  }

  let fileMode: string | undefined;
  let permissionsSecure = true;
  try {
    const stat = fs.statSync(keyFilePath);
    if (!stat.isFile()) {
      return {
        ok: false,
        status: 'corrupted',
        errorCode: 'MASTER_KEY_INVALID_TYPE',
        errorMessage: 'Master key path exists but is not a regular file.',
      };
    }
    const modeOctal = stat.mode & 0o777;
    fileMode = '0' + modeOctal.toString(8);
    // Attempt to enforce 0600 on owner-writable files
    if ((modeOctal & 0o077) !== 0) {
      try {
        fs.chmodSync(keyFilePath, 0o600);
        const refreshed = fs.statSync(keyFilePath).mode & 0o777;
        fileMode = '0' + refreshed.toString(8);
        permissionsSecure = (refreshed & 0o077) === 0;
      } catch {
        permissionsSecure = false;
      }
    }
  } catch (err: any) {
    return {
      ok: false,
      status: 'corrupted',
      errorCode: 'MASTER_KEY_UNREADABLE',
      errorMessage: `Unable to inspect master key file permissions: ${err?.message || 'permission denied'}`,
    };
  }

  let raw = '';
  try {
    raw = fs.readFileSync(keyFilePath, 'utf-8').trim();
  } catch (err: any) {
    return {
      ok: false,
      status: 'corrupted',
      fileMode,
      permissionsSecure,
      errorCode: 'MASTER_KEY_UNREADABLE',
      errorMessage: `Unable to read master key file: ${err?.message || 'permission denied'}`,
    };
  }

  // Legacy raw hex key support (64 hex chars)
  if (/^[a-f0-9]{64}$/i.test(raw)) {
    const buf = Buffer.from(raw, 'hex');
    const now = new Date().toISOString();
    return {
      ok: true,
      status: 'ready',
      fileMode,
      permissionsSecure,
      data: {
        version: 1,
        activeKeyVersion: 1,
        keys: { '1': buf.toString('base64') },
        createdAt: now,
        updatedAt: now,
      },
    };
  }

  try {
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.activeKeyVersion !== 'number' ||
      !parsed.keys ||
      typeof parsed.keys !== 'object'
    ) {
      throw new Error('Malformed master key structure');
    }

    const activeKeyStr = parsed.keys[String(parsed.activeKeyVersion)];
    const activeBuf = parseKeyBuffer(activeKeyStr);
    if (!activeBuf || activeBuf.length !== KEY_LENGTH) {
      throw new Error('Active key missing or not 256-bit');
    }

    for (const [ver, val] of Object.entries(parsed.keys)) {
      if (!/^\d+$/.test(ver) || typeof val !== 'string' || !parseKeyBuffer(val)) {
        throw new Error(`Invalid key entry at version ${ver}`);
      }
    }

    return {
      ok: true,
      status: 'ready',
      fileMode,
      permissionsSecure,
      data: parsed as MasterKeyFileData,
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 'corrupted',
      fileMode,
      permissionsSecure,
      errorCode: 'MASTER_KEY_CORRUPTED',
      errorMessage: `Master key file is corrupted or malformed (${err?.message || 'parse error'}). Restore from backup.`,
    };
  }
}

export function writeMasterKeyFileAtomic(keyFilePath: string, data: MasterKeyFileData): void {
  const secretsDir = path.dirname(keyFilePath);
  if (!fs.existsSync(secretsDir)) {
    fs.mkdirSync(secretsDir, { recursive: true, mode: 0o700 });
  }
  try {
    fs.chmodSync(secretsDir, 0o700);
  } catch {
    // Non-fatal on filesystems without POSIX chmod
  }

  const serialized = JSON.stringify(data, null, 2);
  const tmpPath = `${keyFilePath}.tmp.${crypto.randomBytes(6).toString('hex')}`;
  if (!tmpPath.startsWith(secretsDir + path.sep)) {
    throw new Error('Temp key path escapes secrets directory.');
  }
  fs.writeFileSync(tmpPath, serialized, { mode: 0o600, encoding: 'utf-8' });
  try {
    fs.chmodSync(tmpPath, 0o600);
  } catch {
    // Non-fatal
  }
  fs.renameSync(tmpPath, keyFilePath);
  try {
    fs.chmodSync(keyFilePath, 0o600);
  } catch {
    // Non-fatal
  }
}

export class MasterKeyManager {
  private dbDir: string;
  private keyFilePath: string;
  private secretsDir: string;
  private state: MasterKeyDiagnostics;
  private keyData: MasterKeyFileData | null = null;

  constructor(dbDir?: string) {
    this.dbDir = resolveDbDirectory(dbDir);
    this.secretsDir = getSecretsDir(this.dbDir);
    this.keyFilePath = getMasterKeyFilePath(this.dbDir);
    this.state = {
      status: 'missing',
      activeKeyVersion: 0,
      availableVersions: [],
      fingerprint: '',
      keyFilePath: this.keyFilePath,
      secretsDir: this.secretsDir,
      filePermissions: null,
      permissionsSecure: false,
    };
  }

  /**
   * Initializes or validates the master key at startup.
   * - If key does NOT exist AND hasNeverInitialized is true: generates a new 256-bit CSPRNG key safely (0600).
   * - If key is missing/corrupted when previously initialized or encrypted data exists:
   *   NEVER generates a new key, NEVER overwrites, and transitions to missing/corrupted error state.
   */
  public initialize(options: {
    hasExistingEncryptedData: boolean;
    wasPreviouslyInitialized: boolean;
    expectedFingerprint?: string | null;
  }): MasterKeyDiagnostics {
    const fileExists = fs.existsSync(this.keyFilePath);

    if (!fileExists) {
      if (!options.hasExistingEncryptedData && !options.wasPreviouslyInitialized) {
        // Safe first-time initialization
        const keyBytes = crypto.randomBytes(KEY_LENGTH);
        const now = new Date().toISOString();
        const initialData: MasterKeyFileData = {
          version: 1,
          activeKeyVersion: 1,
          keys: { '1': keyBytes.toString('base64') },
          createdAt: now,
          updatedAt: now,
        };
        writeMasterKeyFileAtomic(this.keyFilePath, initialData);
        this.keyData = initialData;
        const fp = computeKeyFingerprint(keyBytes);
        this.state = {
          status: 'ready',
          activeKeyVersion: 1,
          availableVersions: [1],
          fingerprint: fp,
          keyFilePath: this.keyFilePath,
          secretsDir: this.secretsDir,
          filePermissions: '0600',
          permissionsSecure: true,
        };
        return this.state;
      }

      // Key was deleted/lost while encrypted data or initialization state already exists -> FAIL CLOSED
      this.keyData = null;
      this.state = {
        status: 'missing',
        activeKeyVersion: 0,
        availableVersions: [],
        fingerprint: '',
        keyFilePath: this.keyFilePath,
        secretsDir: this.secretsDir,
        filePermissions: null,
        permissionsSecure: false,
        errorCode: 'MASTER_KEY_MISSING',
        errorMessage:
          'Master encryption key file is missing while encrypted data exists. ChatAI will NOT generate a new key automatically. Restore master.key from backup.',
      };
      return this.state;
    }

    const readRes = readAndValidateMasterKeyFile(this.keyFilePath);
    if (!readRes.ok || !readRes.data) {
      this.keyData = null;
      this.state = {
        status: readRes.status,
        activeKeyVersion: 0,
        availableVersions: [],
        fingerprint: '',
        keyFilePath: this.keyFilePath,
        secretsDir: this.secretsDir,
        filePermissions: readRes.fileMode || null,
        permissionsSecure: Boolean(readRes.permissionsSecure),
        errorCode: readRes.errorCode,
        errorMessage: readRes.errorMessage,
      };
      return this.state;
    }

    const activeKeyBuf = parseKeyBuffer(readRes.data.keys[String(readRes.data.activeKeyVersion)])!;
    const fp = computeKeyFingerprint(activeKeyBuf);

    if (options.expectedFingerprint && options.expectedFingerprint !== fp) {
      this.keyData = readRes.data;
      this.state = {
        status: 'mismatch',
        activeKeyVersion: readRes.data.activeKeyVersion,
        availableVersions: Object.keys(readRes.data.keys).map(Number).sort((a, b) => a - b),
        fingerprint: fp,
        keyFilePath: this.keyFilePath,
        secretsDir: this.secretsDir,
        filePermissions: readRes.fileMode || null,
        permissionsSecure: Boolean(readRes.permissionsSecure),
        errorCode: 'MASTER_KEY_MISMATCH',
        errorMessage:
          'Loaded master key fingerprint does not match the database encryption key fingerprint. Restore the matching master key backup.',
      };
      return this.state;
    }

    this.keyData = readRes.data;
    this.state = {
      status: 'ready',
      activeKeyVersion: readRes.data.activeKeyVersion,
      availableVersions: Object.keys(readRes.data.keys).map(Number).sort((a, b) => a - b),
      fingerprint: fp,
      keyFilePath: this.keyFilePath,
      secretsDir: this.secretsDir,
      filePermissions: readRes.fileMode || null,
      permissionsSecure: Boolean(readRes.permissionsSecure),
    };
    return this.state;
  }

  public getDiagnostics(): MasterKeyDiagnostics {
    // Re-check file presence so runtime deletion of master.key is immediately detected
    if (!fs.existsSync(this.keyFilePath) && this.state.status === 'ready') {
      this.keyData = null;
      this.state = {
        ...this.state,
        status: 'missing',
        errorCode: 'MASTER_KEY_MISSING',
        errorMessage: 'Master encryption key file is missing. Restore from backup to resume decrypting API keys.',
      };
    }
    return { ...this.state };
  }

  public isReady(): boolean {
    const diag = this.getDiagnostics();
    return diag.status === 'ready' && this.keyData !== null;
  }

  private getKeyBufferForVersion(keyVersion?: number): { version: number; key: Buffer } {
    if (!this.isReady() || !this.keyData) {
      const err: any = new Error(this.state.errorMessage || 'Master encryption key is unavailable.');
      err.code = this.state.errorCode || 'MASTER_KEY_UNAVAILABLE';
      throw err;
    }

    // Re-read from disk if file was changed externally? Use validated in-memory keyData while checking disk existence.
    const ver = keyVersion ?? this.keyData.activeKeyVersion;
    const raw = this.keyData.keys[String(ver)];
    const buf = parseKeyBuffer(raw);
    if (!buf) {
      const err: any = new Error(`Encryption key version ${ver} is not present in master.key.`);
      err.code = 'KEY_VERSION_NOT_FOUND';
      throw err;
    }
    return { version: ver, key: buf };
  }

  public encrypt(plaintext: string): string {
    if (!plaintext) return '';
    const { version, key } = this.getKeyBufferForVersion();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const envelope: EncryptedEnvelope = {
      version: 2,
      key_version: version,
      algorithm: ALGORITHM,
      iv: iv.toString('base64'),
      auth_tag: authTag.toString('base64'),
      ciphertext: encrypted.toString('base64'),
    };
    return JSON.stringify(envelope);
  }

  public decrypt(storedPayload: string): string {
    if (!storedPayload) return '';

    // Support structured AES-256-GCM JSON envelope (v2)
    if (storedPayload.startsWith('{')) {
      let parsed: EncryptedEnvelope;
      try {
        parsed = JSON.parse(storedPayload);
      } catch {
        throw new Error('Corrupted encrypted payload JSON.');
      }
      if (parsed.algorithm !== ALGORITHM || !parsed.iv || !parsed.auth_tag || !parsed.ciphertext) {
        throw new Error('Invalid encrypted envelope fields.');
      }

      const { key } = this.getKeyBufferForVersion(parsed.key_version || 1);
      const iv = Buffer.from(parsed.iv, 'base64');
      const authTag = Buffer.from(parsed.auth_tag, 'base64');
      const data = Buffer.from(parsed.ciphertext, 'base64');

      if (iv.length !== IV_LENGTH || authTag.length !== 16) {
        throw new Error('Invalid IV or authentication tag length.');
      }

      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
      return decrypted.toString('utf8');
    }

    // Legacy v1 string format (`v1:iv:tag:ciphertext`)
    if (storedPayload.startsWith('v1:')) {
      const parts = storedPayload.split(':');
      if (parts.length !== 4) {
        throw new Error('Invalid legacy v1 ciphertext format.');
      }
      const [, ivB64, tagB64, dataB64] = parts;
      const { key } = this.getKeyBufferForVersion(1);
      const iv = Buffer.from(ivB64, 'base64');
      const authTag = Buffer.from(tagB64, 'base64');
      const data = Buffer.from(dataB64, 'base64');
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
      return decrypted.toString('utf8');
    }

    throw new Error('Unrecognized encrypted secret format.');
  }

  /**
   * Exports an authenticated, passphrase-encrypted backup bundle of master.key.
   */
  public exportEncryptedBackup(passphrase: string): string {
    if (!this.isReady() || !this.keyData) {
      throw new Error(this.state.errorMessage || 'Master key is not ready for backup.');
    }
    const cleanPass = (passphrase || '').trim();
    if (cleanPass.length < 8) {
      throw new Error('Backup passphrase must be at least 8 characters long.');
    }

    const salt = crypto.randomBytes(16);
    const derivedKey = crypto.scryptSync(cleanPass, salt, KEY_LENGTH, { N: 16384, r: 8, p: 1 });
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, iv);
    const plaintext = JSON.stringify(this.keyData);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return JSON.stringify(
      {
        format: BACKUP_FORMAT,
        version: 1,
        kdf: 'scrypt',
        algorithm: ALGORITHM,
        salt: salt.toString('base64'),
        iv: iv.toString('base64'),
        auth_tag: authTag.toString('base64'),
        ciphertext: encrypted.toString('base64'),
        key_version: this.keyData.activeKeyVersion,
        fingerprint: this.state.fingerprint,
        exported_at: new Date().toISOString(),
      },
      null,
      2
    );
  }

  /**
   * Parses and validates a backup bundle (either passphrase-protected backup or raw master.key JSON),
   * verifies decryption against any sample ciphertexts, and writes master.key atomically.
   */
  public restoreFromBackup(options: {
    backupContent: string;
    passphrase?: string;
    sampleCiphertexts?: string[];
  }): MasterKeyDiagnostics {
    const trimmed = (options.backupContent || '').trim();
    if (!trimmed) {
      throw new Error('Backup content is empty.');
    }

    let restoredData: MasterKeyFileData | null = null;

    if (/^[a-f0-9]{64}$/i.test(trimmed)) {
      const now = new Date().toISOString();
      restoredData = {
        version: 1,
        activeKeyVersion: 1,
        keys: { '1': Buffer.from(trimmed, 'hex').toString('base64') },
        createdAt: now,
        updatedAt: now,
      };
    } else {
      let parsed: any;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        throw new Error('Invalid backup file format (expected JSON).');
      }

      if (parsed?.format === BACKUP_FORMAT) {
        const cleanPass = (options.passphrase || '').trim();
        if (!cleanPass) {
          throw new Error('Passphrase is required to decrypt this backup file.');
        }
        try {
          const salt = Buffer.from(parsed.salt, 'base64');
          const iv = Buffer.from(parsed.iv, 'base64');
          const authTag = Buffer.from(parsed.auth_tag, 'base64');
          const ciphertext = Buffer.from(parsed.ciphertext, 'base64');
          const derivedKey = crypto.scryptSync(cleanPass, salt, KEY_LENGTH, { N: 16384, r: 8, p: 1 });
          const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, iv);
          decipher.setAuthTag(authTag);
          const decryptedJson = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
          restoredData = JSON.parse(decryptedJson);
        } catch {
          throw new Error('Invalid backup passphrase or corrupted backup file.');
        }
      } else if (parsed && typeof parsed.activeKeyVersion === 'number' && parsed.keys) {
        restoredData = parsed as MasterKeyFileData;
      } else {
        throw new Error('Unrecognized backup file structure.');
      }
    }

    if (!restoredData || !restoredData.keys || !parseKeyBuffer(restoredData.keys[String(restoredData.activeKeyVersion)])) {
      throw new Error('Backup does not contain a valid 256-bit active master key.');
    }

    // Verify restored key against sample ciphertexts before writing to disk
    if (options.sampleCiphertexts && options.sampleCiphertexts.length > 0) {
      for (const sample of options.sampleCiphertexts) {
        if (!sample) continue;
        this.verifyCiphertextWithKeyData(sample, restoredData);
      }
    }

    // Keep safety backup if an existing file is present
    if (fs.existsSync(this.keyFilePath)) {
      const preRestoreBak = path.resolve(this.secretsDir, `master.key.pre-restore.${Date.now()}.bak`);
      if (preRestoreBak.startsWith(this.secretsDir + path.sep)) {
        try {
          fs.copyFileSync(this.keyFilePath, preRestoreBak);
          fs.chmodSync(preRestoreBak, 0o600);
        } catch {
          // ignore
        }
      }
    }

    restoredData.updatedAt = new Date().toISOString();
    writeMasterKeyFileAtomic(this.keyFilePath, restoredData);
    this.keyData = restoredData;

    const activeBuf = parseKeyBuffer(restoredData.keys[String(restoredData.activeKeyVersion)])!;
    const fp = computeKeyFingerprint(activeBuf);
    this.state = {
      status: 'ready',
      activeKeyVersion: restoredData.activeKeyVersion,
      availableVersions: Object.keys(restoredData.keys).map(Number).sort((a, b) => a - b),
      fingerprint: fp,
      keyFilePath: this.keyFilePath,
      secretsDir: this.secretsDir,
      filePermissions: '0600',
      permissionsSecure: true,
    };
    return this.getDiagnostics();
  }

  private verifyCiphertextWithKeyData(storedPayload: string, keyData: MasterKeyFileData): string {
    if (storedPayload.startsWith('{')) {
      const parsed = JSON.parse(storedPayload) as EncryptedEnvelope;
      const buf = parseKeyBuffer(keyData.keys[String(parsed.key_version || 1)]);
      if (!buf) throw new Error(`Key version ${parsed.key_version} missing in backup.`);
      const decipher = crypto.createDecipheriv(ALGORITHM, buf, Buffer.from(parsed.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(parsed.auth_tag, 'base64'));
      return Buffer.concat([decipher.update(Buffer.from(parsed.ciphertext, 'base64')), decipher.final()]).toString('utf8');
    }
    if (storedPayload.startsWith('v1:')) {
      const [, ivB64, tagB64, dataB64] = storedPayload.split(':');
      const buf = parseKeyBuffer(keyData.keys['1']);
      if (!buf) throw new Error('Key version 1 missing in backup.');
      const decipher = crypto.createDecipheriv(ALGORITHM, buf, Buffer.from(ivB64, 'base64'));
      decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
      return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
    }
    throw new Error('Unsupported ciphertext format.');
  }

  /**
   * Safe transactional Key Rotation:
   * 1. Decrypts all supplied ciphertexts using the active key.
   * 2. Snapshots current master.key before making changes.
   * 3. Generates a new 256-bit key version (activeKeyVersion + 1).
   * 4. Re-encrypts all records with the new key version and fresh CSPRNG IVs.
   * 5. Passes re-encrypted records to commitDatabase() BEFORE finalizing key removal.
   * 6. Rolls back master.key on any failure.
   */
  public rotateKeyWithReencryption(
    ciphertexts: Array<{ id: string; value: string }>,
    commitDatabase: (reencrypted: Array<{ id: string; value: string }>, newFingerprint: string, newVersion: number) => void
  ): {
    oldVersion: number;
    newVersion: number;
    reencryptedCount: number;
    diagnostics: MasterKeyDiagnostics;
  } {
    if (!this.isReady() || !this.keyData) {
      throw new Error(this.state.errorMessage || 'Cannot rotate master key while key is missing or corrupted.');
    }

    const oldData = JSON.parse(JSON.stringify(this.keyData)) as MasterKeyFileData;
    const oldVersion = oldData.activeKeyVersion;
    const newVersion = oldVersion + 1;

    // 1. Decrypt every existing ciphertext first; abort cleanly if any fails
    const plaintexts: Array<{ id: string; plain: string }> = [];
    for (const item of ciphertexts) {
      if (!item.value) continue;
      const plain = this.decrypt(item.value);
      plaintexts.push({ id: item.id, plain });
    }

    // 2. Snapshot old master.key prior to rotation
    const preRotationSnapshotPath = path.resolve(this.secretsDir, `master.key.pre-rotate-v${oldVersion}.${Date.now()}.bak`);
    if (!preRotationSnapshotPath.startsWith(this.secretsDir + path.sep)) {
      throw new Error('Backup snapshot path escapes secrets directory.');
    }
    writeMasterKeyFileAtomic(preRotationSnapshotPath, oldData);

    // 3. Generate new 256-bit CSPRNG key
    const newKeyBuf = crypto.randomBytes(KEY_LENGTH);
    const newFingerprint = computeKeyFingerprint(newKeyBuf);
    const now = new Date().toISOString();

    // Temporarily retain both old and new keys while re-encrypting & committing DB
    const stagedData: MasterKeyFileData = {
      version: 1,
      activeKeyVersion: newVersion,
      keys: {
        ...oldData.keys,
        [String(newVersion)]: newKeyBuf.toString('base64'),
      },
      createdAt: oldData.createdAt,
      updatedAt: now,
    };

    try {
      // 4. Re-encrypt every secret with newVersion and fresh CSPRNG IV
      const reencrypted: Array<{ id: string; value: string }> = plaintexts.map((entry) => {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, newKeyBuf, iv);
        const enc = Buffer.concat([cipher.update(entry.plain, 'utf8'), cipher.final()]);
        const tag = cipher.getAuthTag();
        const envelope: EncryptedEnvelope = {
          version: 2,
          key_version: newVersion,
          algorithm: ALGORITHM,
          iv: iv.toString('base64'),
          auth_tag: tag.toString('base64'),
          ciphertext: enc.toString('base64'),
        };
        return { id: entry.id, value: JSON.stringify(envelope) };
      });

      // Stage new key alongside old key on disk first
      writeMasterKeyFileAtomic(this.keyFilePath, stagedData);

      // 5. Commit re-encrypted records to SQLite & persist to disk
      commitDatabase(reencrypted, newFingerprint, newVersion);

      // 6. Once DB persistence succeeded, retire previous key from active ring (snapshot file remains in secrets/)
      const finalizedData: MasterKeyFileData = {
        version: 1,
        activeKeyVersion: newVersion,
        keys: {
          [String(newVersion)]: newKeyBuf.toString('base64'),
        },
        createdAt: oldData.createdAt,
        updatedAt: new Date().toISOString(),
      };
      writeMasterKeyFileAtomic(this.keyFilePath, finalizedData);

      this.keyData = finalizedData;
      this.state = {
        status: 'ready',
        activeKeyVersion: newVersion,
        availableVersions: [newVersion],
        fingerprint: newFingerprint,
        keyFilePath: this.keyFilePath,
        secretsDir: this.secretsDir,
        filePermissions: '0600',
        permissionsSecure: true,
      };

      return {
        oldVersion,
        newVersion,
        reencryptedCount: reencrypted.length,
        diagnostics: this.getDiagnostics(),
      };
    } catch (err) {
      // Rollback master.key to pre-rotation keyData
      try {
        writeMasterKeyFileAtomic(this.keyFilePath, oldData);
        this.keyData = oldData;
      } catch {
        // ignore rollback write failure
      }
      throw err;
    }
  }
}

// ==================== CONVENIENCE & SESSION HELPERS ====================

const managersByDir = new Map<string, MasterKeyManager>();

export function getMasterKeyManager(dbDir?: string): MasterKeyManager {
  const dir = resolveDbDirectory(dbDir);
  let mgr = managersByDir.get(dir);
  if (!mgr) {
    mgr = new MasterKeyManager(dir);
    managersByDir.set(dir, mgr);
  }
  return mgr;
}

export function getSessionSecret(): Buffer {
  if (cachedSessionSecret) return cachedSessionSecret;
  const envSecret = process.env.SESSION_SECRET?.trim() || process.env.CHATAI_ENCRYPTION_SECRET?.trim();
  if (envSecret && envSecret.length >= 16) {
    cachedSessionSecret = crypto.scryptSync(envSecret, 'chatai-session-salt-v1', 32);
    return cachedSessionSecret;
  }
  cachedSessionSecret = crypto.randomBytes(32);
  return cachedSessionSecret;
}

export function maskSecret(value: string): string {
  const trimmed = (value || '').trim();
  if (!trimmed) return '';
  if (trimmed.length <= 8) {
    return trimmed.slice(0, 2) + '••••' + trimmed.slice(-2);
  }
  return `${trimmed.slice(0, 5)}••••${trimmed.slice(-4)}`;
}

export function signSessionToken(sessionId: string): string {
  const payload = Buffer.from(JSON.stringify({ sid: sessionId, iat: Date.now() })).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string): { sid: string; iat: number } | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(payload)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!parsed?.sid || typeof parsed.sid !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function hashIdentifier(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}
