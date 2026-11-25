import initSqlJs from 'sql.js';
import type { Database, SqlValue } from 'sql.js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  getMasterKeyManager,
  hashIdentifier,
  maskSecret,
  MasterKeyDiagnostics,
} from './crypto.ts';

export type ApiProviderType = 'openai' | 'google' | 'claude' | '9router' | 'other';
export type PlanTier = 'free' | 'community';
export type LicenseStatusType =
  | 'not_activated'
  | 'active'
  | 'expired'
  | 'revoked'
  | 'invalid'
  | 'error';

export interface DbConversation {
  id: string;
  user_id?: string | null;
  title: string;
  model?: string;
  provider?: string;
  system_instruction?: string;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

export interface DbMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'model' | 'assistant';
  sender: 'user' | 'ai';
  content: string;
  created_at: string;
  metadata?: string; // JSON string
}

export interface DbTokenUsage {
  id: string;
  user_id?: string | null;
  conversation_id?: string | null;
  message_id?: string | null;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cached_input_tokens?: number;
  reasoning_tokens?: number;
  usage_source: 'provider' | 'estimated';
  request_id?: string | null;
  status: 'success' | 'error' | 'aborted';
  created_at: string;
}

export interface DbProvider {
  id: string;
  name: string;
  type: ApiProviderType;
  base_url: string;
  api_endpoint: string;
  encrypted_api_key: string;
  key_mask: string;
  is_default: number;
  status: 'unverified' | 'connected' | 'error';
  last_checked_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublicProvider {
  id: string;
  name: string;
  type: ApiProviderType;
  baseUrl: string;
  apiEndpoint: string;
  hasApiKey: boolean;
  keyMask: string;
  isDefault: boolean;
  status: 'unverified' | 'connected' | 'error';
  lastCheckedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DbCustomModel {
  id: string;
  provider_id: string;
  model_id: string;
  display_name: string;
  is_default: number;
  created_at: string;
}

export interface DbLicenseState {
  id: string;
  plan: PlanTier;
  status: LicenseStatusType;
  masked_key: string;
  encrypted_key: string;
  product_id: string;
  product_name: string;
  plan_name: string;
  entitlements_json: string;
  activated_at: string | null;
  expires_at: string | null;
  last_verified_at: string | null;
  cache_expires_at: string | null;
  grace_days: number;
  offline_token: string;
  last_error: string | null;
  updated_at: string;
}

export interface DbUsageCounter {
  date_key: string;
  plan: PlanTier;
  requests_used: number;
  tokens_used: number;
  updated_at: string;
}

class DatabaseManager {
  private db: Database | null = null;
  private dbPath: string;
  private saveTimeout: NodeJS.Timeout | null = null;
  private isInitializing: Promise<void> | null = null;

  constructor() {
    const rawPath = process.env.DB_PATH || process.env.SQLITE_DB_PATH || 'data/chatai.db';
    this.dbPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
  }

  public getDbDir(): string {
    return path.dirname(this.dbPath);
  }

  public getDbPath(): string {
    return this.dbPath;
  }

  public async init(): Promise<void> {
    if (this.db) return;
    if (this.isInitializing) return this.isInitializing;

    this.isInitializing = (async () => {
      try {
        const dir = path.dirname(this.dbPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        const SQL = await initSqlJs();

        if (fs.existsSync(this.dbPath)) {
          const fileBuffer = fs.readFileSync(this.dbPath);
          this.db = new SQL.Database(fileBuffer);
          console.log(`[Database] Loaded existing SQLite database from ${this.dbPath} (${fileBuffer.length} bytes)`);
        } else {
          this.db = new SQL.Database();
          console.log(`[Database] Initialized new SQLite database at ${this.dbPath}`);
        }

        // Enable foreign keys
        this.db.run('PRAGMA foreign_keys = ON;');

        // Run migrations and schema setup
        this.runMigrations();

        // Initialize or validate master encryption key (NEVER auto-regenerates if missing/corrupted)
        this.initializeMasterKey();

        // Save immediately to ensure file exists on disk
        this.persistNow();
      } catch (err: any) {
        console.error('[Database] Failed to initialize SQLite database:', err);
        throw err;
      }
    })();

    await this.isInitializing;
  }

  private initializeMasterKey(): void {
    const keyMgr = getMasterKeyManager(this.getDbDir());
    const provEncryptedCount =
      this.queryOne<{ cnt: number }>("SELECT COUNT(*) as cnt FROM providers WHERE encrypted_api_key != ''")?.cnt || 0;
    const licEncryptedCount =
      this.queryOne<{ cnt: number }>(
        "SELECT COUNT(*) as cnt FROM license_state WHERE encrypted_key != '' OR offline_token != ''"
      )?.cnt || 0;

    const wasInitialized = this.getUserSetting('master_key_initialized') === 'true';
    const expectedFingerprint = this.getUserSetting('master_key_fingerprint') || null;

    const diag = keyMgr.initialize({
      hasExistingEncryptedData: provEncryptedCount + licEncryptedCount > 0,
      wasPreviouslyInitialized: wasInitialized,
      expectedFingerprint,
    });

    if (diag.status === 'ready') {
      const now = new Date().toISOString();
      if (!wasInitialized) {
        this.run('INSERT OR REPLACE INTO user_settings (key, value, updated_at) VALUES (?, ?, ?)', [
          'master_key_initialized',
          'true',
          now,
        ]);
      }
      if (!expectedFingerprint && diag.fingerprint) {
        this.run('INSERT OR REPLACE INTO user_settings (key, value, updated_at) VALUES (?, ?, ?)', [
          'master_key_fingerprint',
          diag.fingerprint,
          now,
        ]);
      }
      this.run('INSERT OR REPLACE INTO user_settings (key, value, updated_at) VALUES (?, ?, ?)', [
        'master_key_version',
        String(diag.activeKeyVersion),
        now,
      ]);

      // Encrypt any legacy plaintext license offline_token at rest
      const licRow = this.queryOne<DbLicenseState>('SELECT * FROM license_state WHERE id = ?', ['primary']);
      if (licRow?.offline_token && !licRow.offline_token.startsWith('{') && !licRow.offline_token.startsWith('v1:')) {
        try {
          const encToken = keyMgr.encrypt(licRow.offline_token);
          this.run("UPDATE license_state SET offline_token = ? WHERE id = 'primary'", [encToken]);
        } catch {
          // ignore
        }
      }
      console.log(`[Security] Master encryption key ready (v${diag.activeKeyVersion}, perms=${diag.filePermissions || 'n/a'})`);
    } else {
      console.error(`[Security] Master encryption key alert (${diag.status}): ${diag.errorMessage}`);
    }
  }

  private runMigrations(): void {
    if (!this.db) return;

    this.db.run(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        title TEXT NOT NULL,
        model TEXT,
        provider TEXT,
        system_instruction TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        sender TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        metadata TEXT,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS token_usage (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        conversation_id TEXT,
        message_id TEXT,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        cached_input_tokens INTEGER DEFAULT 0,
        reasoning_tokens INTEGER DEFAULT 0,
        usage_source TEXT NOT NULL DEFAULT 'provider',
        request_id TEXT,
        status TEXT NOT NULL DEFAULT 'success',
        created_at TEXT NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_token_usage_created ON token_usage(created_at);
      CREATE INDEX IF NOT EXISTS idx_token_usage_conv ON token_usage(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_token_usage_provider_model ON token_usage(provider, model);
      CREATE INDEX IF NOT EXISTS idx_token_usage_request_id ON token_usage(request_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);
    `);

    const appliedRows = this.queryAll<{ version: number }>('SELECT version FROM schema_migrations');
    const applied = new Set(appliedRows.map((r) => r.version));

    if (!applied.has(2)) {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS providers (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          base_url TEXT DEFAULT '',
          api_endpoint TEXT DEFAULT '',
          encrypted_api_key TEXT DEFAULT '',
          key_mask TEXT DEFAULT '',
          is_default INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'unverified',
          last_checked_at TEXT,
          last_error TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS custom_models (
          id TEXT PRIMARY KEY,
          provider_id TEXT NOT NULL,
          model_id TEXT NOT NULL,
          display_name TEXT NOT NULL,
          is_default INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS user_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS license_state (
          id TEXT PRIMARY KEY,
          plan TEXT NOT NULL DEFAULT 'free',
          status TEXT NOT NULL DEFAULT 'not_activated',
          masked_key TEXT DEFAULT '',
          encrypted_key TEXT DEFAULT '',
          product_id TEXT DEFAULT '',
          product_name TEXT DEFAULT '',
          plan_name TEXT DEFAULT 'Free',
          entitlements_json TEXT DEFAULT '{}',
          activated_at TEXT,
          expires_at TEXT,
          last_verified_at TEXT,
          cache_expires_at TEXT,
          grace_days INTEGER DEFAULT 0,
          offline_token TEXT DEFAULT '',
          last_error TEXT,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS usage_counters (
          date_key TEXT PRIMARY KEY,
          plan TEXT NOT NULL DEFAULT 'free',
          requests_used INTEGER NOT NULL DEFAULT 0,
          tokens_used INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          created_at TEXT NOT NULL,
          last_seen_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_custom_models_provider ON custom_models(provider_id);
        CREATE INDEX IF NOT EXISTS idx_providers_default ON providers(is_default);
      `);

      this.run('INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)', [
        2,
        new Date().toISOString(),
      ]);
      console.log('[Database] Applied migration v2 (providers, custom_models, user_settings, license_state, usage_counters, sessions)');
    }

    this.ensureInitialDefaults();
    console.log('[Database] Schema and indices verified successfully');
  }

  private ensureInitialDefaults(): void {
    const now = new Date().toISOString();
    const instanceIdFile = path.join(this.getDbDir(), 'secrets', 'instance.id');
    let persistedInstanceId = '';
    try {
      if (fs.existsSync(instanceIdFile)) {
        persistedInstanceId = fs.readFileSync(instanceIdFile, 'utf-8').trim();
      }
    } catch {
      // ignore
    }

    const defaults: Record<string, string> = {
      language: 'en',
      theme: 'dark',
      welcome_dismissed: 'false',
      temperature: '0.7',
      system_instruction: '',
      active_provider_id: '',
      default_model: '',
      send_on_enter: 'true',
      compact_mode: 'false',
      instance_id: persistedInstanceId || hashIdentifier(crypto.randomUUID()),
    };

    for (const [k, v] of Object.entries(defaults)) {
      const existing = this.queryOne<{ key: string }>('SELECT key FROM user_settings WHERE key = ?', [k]);
      if (!existing) {
        this.run('INSERT INTO user_settings (key, value, updated_at) VALUES (?, ?, ?)', [k, v, now]);
      }
    }

    // Sync instance_id to secrets/instance.id so it survives DB deletion
    try {
      const activeInstanceId = this.queryOne<{ value: string }>(
        "SELECT value FROM user_settings WHERE key = 'instance_id'"
      )?.value;
      if (activeInstanceId && !persistedInstanceId) {
        const secretsDir = path.join(this.getDbDir(), 'secrets');
        if (!fs.existsSync(secretsDir)) {
          fs.mkdirSync(secretsDir, { recursive: true, mode: 0o700 });
        }
        fs.writeFileSync(instanceIdFile, activeInstanceId, { mode: 0o600 });
      }
    } catch {
      // ignore
    }

    const licenseRow = this.queryOne<{ id: string }>('SELECT id FROM license_state WHERE id = ?', ['primary']);
    if (!licenseRow) {
      this.run(
        `INSERT INTO license_state (
          id, plan, status, masked_key, encrypted_key, product_id, product_name, plan_name,
          entitlements_json, activated_at, expires_at, last_verified_at, cache_expires_at,
          grace_days, offline_token, last_error, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['primary', 'free', 'not_activated', '', '', '', '', 'Free', '{}', null, null, null, null, 0, '', null, now]
      );
    }
  }

  public scheduleSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this.persistNow();
    }, 150);
  }

  public persistNow(): void {
    if (!this.db) return;
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      const tempPath = `${this.dbPath}.tmp`;
      fs.writeFileSync(tempPath, buffer);
      fs.renameSync(tempPath, this.dbPath);
    } catch (err: any) {
      console.error('[Database] Failed to write database to disk:', err);
    }
  }

  private queryAll<T = any>(sql: string, params: SqlValue[] = []): T[] {
    if (!this.db) throw new Error('Database not initialized');
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    const results: T[] = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject() as unknown as T);
    }
    stmt.free();
    return results;
  }

  private queryOne<T = any>(sql: string, params: SqlValue[] = []): T | null {
    const list = this.queryAll<T>(sql, params);
    return list.length > 0 ? list[0] : null;
  }

  private run(sql: string, params: SqlValue[] = []): void {
    if (!this.db) throw new Error('Database not initialized');
    const stmt = this.db.prepare(sql);
    stmt.run(params);
    stmt.free();
    this.scheduleSave();
  }

  // ==================== SESSIONS ====================

  public createSession(id: string): void {
    const now = new Date().toISOString();
    this.run('INSERT OR REPLACE INTO sessions (id, created_at, last_seen_at) VALUES (?, ?, ?)', [id, now, now]);
  }

  public getSession(id: string): { id: string; created_at: string; last_seen_at: string } | null {
    return this.queryOne('SELECT * FROM sessions WHERE id = ?', [id]);
  }

  public touchSession(id: string): void {
    this.run('UPDATE sessions SET last_seen_at = ? WHERE id = ?', [new Date().toISOString(), id]);
  }

  // ==================== USER SETTINGS ====================

  public getAllUserSettings(): Record<string, string> {
    const rows = this.queryAll<{ key: string; value: string }>('SELECT key, value FROM user_settings');
    const map: Record<string, string> = {};
    for (const r of rows) {
      map[r.key] = r.value;
    }
    return map;
  }

  public getUserSetting(key: string): string | null {
    const row = this.queryOne<{ value: string }>('SELECT value FROM user_settings WHERE key = ?', [key]);
    return row ? row.value : null;
  }

  public setUserSettings(updates: Record<string, string>): Record<string, string> {
    const now = new Date().toISOString();
    const allowedKeys = new Set([
      'language',
      'theme',
      'welcome_dismissed',
      'temperature',
      'system_instruction',
      'active_provider_id',
      'default_model',
      'send_on_enter',
      'compact_mode',
    ]);

    for (const [k, v] of Object.entries(updates)) {
      if (!allowedKeys.has(k)) continue;
      this.run('INSERT OR REPLACE INTO user_settings (key, value, updated_at) VALUES (?, ?, ?)', [
        k,
        String(v ?? ''),
        now,
      ]);
    }

    return this.getAllUserSettings();
  }

  public getInstanceId(): string {
    const existing = this.getUserSetting('instance_id');
    if (existing) return existing;

    const instanceIdFile = path.join(this.getDbDir(), 'secrets', 'instance.id');
    let persisted = '';
    try {
      if (fs.existsSync(instanceIdFile)) {
        persisted = fs.readFileSync(instanceIdFile, 'utf-8').trim();
      }
    } catch {
      // ignore
    }

    const generated = persisted || hashIdentifier(crypto.randomUUID());
    this.run('INSERT OR REPLACE INTO user_settings (key, value, updated_at) VALUES (?, ?, ?)', [
      'instance_id',
      generated,
      new Date().toISOString(),
    ]);

    if (!persisted) {
      try {
        const secretsDir = path.join(this.getDbDir(), 'secrets');
        if (!fs.existsSync(secretsDir)) {
          fs.mkdirSync(secretsDir, { recursive: true, mode: 0o700 });
        }
        fs.writeFileSync(instanceIdFile, generated, { mode: 0o600 });
      } catch {
        // ignore
      }
    }
    return generated;
  }

  // ==================== MASTER KEY LIFECYCLE & SECURITY ====================

  public getMasterKeyStatus(): MasterKeyDiagnostics & {
    encryptedProvidersCount: number;
    hasEncryptedLicense: boolean;
    lastRotationAt: string | null;
  } {
    const keyMgr = getMasterKeyManager(this.getDbDir());
    const diag = keyMgr.getDiagnostics();
    const provCnt =
      this.queryOne<{ cnt: number }>("SELECT COUNT(*) as cnt FROM providers WHERE encrypted_api_key != ''")?.cnt || 0;
    const licCnt =
      this.queryOne<{ cnt: number }>("SELECT COUNT(*) as cnt FROM license_state WHERE encrypted_key != ''")?.cnt || 0;
    return {
      ...diag,
      encryptedProvidersCount: provCnt,
      hasEncryptedLicense: licCnt > 0,
      lastRotationAt: this.getUserSetting('last_key_rotation_at'),
    };
  }

  public backupMasterKey(passphrase: string): string {
    const keyMgr = getMasterKeyManager(this.getDbDir());
    return keyMgr.exportEncryptedBackup(passphrase);
  }

  public restoreMasterKey(backupContent: string, passphrase?: string) {
    const keyMgr = getMasterKeyManager(this.getDbDir());
    const samples: string[] = [];
    const provRows = this.queryAll<{ encrypted_api_key: string }>(
      "SELECT encrypted_api_key FROM providers WHERE encrypted_api_key != ''"
    );
    for (const r of provRows) samples.push(r.encrypted_api_key);
    const licRow = this.queryOne<{ encrypted_key: string }>(
      "SELECT encrypted_key FROM license_state WHERE id = 'primary'"
    );
    if (licRow?.encrypted_key) samples.push(licRow.encrypted_key);

    const diag = keyMgr.restoreFromBackup({
      backupContent,
      passphrase,
      sampleCiphertexts: samples,
    });

    const now = new Date().toISOString();
    this.run('INSERT OR REPLACE INTO user_settings (key, value, updated_at) VALUES (?, ?, ?)', [
      'master_key_initialized',
      'true',
      now,
    ]);
    this.run('INSERT OR REPLACE INTO user_settings (key, value, updated_at) VALUES (?, ?, ?)', [
      'master_key_fingerprint',
      diag.fingerprint,
      now,
    ]);
    this.run('INSERT OR REPLACE INTO user_settings (key, value, updated_at) VALUES (?, ?, ?)', [
      'master_key_version',
      String(diag.activeKeyVersion),
      now,
    ]);
    this.persistNow();
    return this.getMasterKeyStatus();
  }

  public rotateMasterKey() {
    const keyMgr = getMasterKeyManager(this.getDbDir());
    const cipherItems: Array<{ id: string; value: string }> = [];

    const provRows = this.queryAll<{ id: string; encrypted_api_key: string }>(
      "SELECT id, encrypted_api_key FROM providers WHERE encrypted_api_key != ''"
    );
    for (const p of provRows) {
      cipherItems.push({ id: `provider:${p.id}`, value: p.encrypted_api_key });
    }

    const licRow = this.queryOne<DbLicenseState>("SELECT * FROM license_state WHERE id = 'primary'");
    if (licRow?.encrypted_key) {
      cipherItems.push({ id: 'license:key', value: licRow.encrypted_key });
    }
    if (licRow?.offline_token && (licRow.offline_token.startsWith('{') || licRow.offline_token.startsWith('v1:'))) {
      cipherItems.push({ id: 'license:token', value: licRow.offline_token });
    }

    const result = keyMgr.rotateKeyWithReencryption(cipherItems, (reencrypted, newFingerprint, newVersion) => {
      const now = new Date().toISOString();
      this.db!.run('BEGIN TRANSACTION');
      try {
        for (const item of reencrypted) {
          if (item.id.startsWith('provider:')) {
            const provId = item.id.slice('provider:'.length);
            const stmt = this.db!.prepare('UPDATE providers SET encrypted_api_key = ?, updated_at = ? WHERE id = ?');
            stmt.run([item.value, now, provId]);
            stmt.free();
          } else if (item.id === 'license:key') {
            const stmt = this.db!.prepare("UPDATE license_state SET encrypted_key = ?, updated_at = ? WHERE id = 'primary'");
            stmt.run([item.value, now]);
            stmt.free();
          } else if (item.id === 'license:token') {
            const stmt = this.db!.prepare("UPDATE license_state SET offline_token = ?, updated_at = ? WHERE id = 'primary'");
            stmt.run([item.value, now]);
            stmt.free();
          }
        }
        const metaUpdates: Array<[string, string]> = [
          ['master_key_fingerprint', newFingerprint],
          ['master_key_version', String(newVersion)],
          ['last_key_rotation_at', now],
        ];
        for (const [k, v] of metaUpdates) {
          const stmt = this.db!.prepare('INSERT OR REPLACE INTO user_settings (key, value, updated_at) VALUES (?, ?, ?)');
          stmt.run([k, v, now]);
          stmt.free();
        }
        this.db!.run('COMMIT');
        this.persistNow();
      } catch (err) {
        try {
          this.db!.run('ROLLBACK');
        } catch {
          // ignore
        }
        throw err;
      }
    });

    return {
      ...result,
      keyStatus: this.getMasterKeyStatus(),
    };
  }

  // ==================== PROVIDERS ====================

  private toPublicProvider(row: DbProvider): PublicProvider {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      baseUrl: row.base_url || '',
      apiEndpoint: row.api_endpoint || '',
      hasApiKey: Boolean(row.encrypted_api_key),
      keyMask: row.key_mask || '',
      isDefault: row.is_default === 1,
      status: row.status || 'unverified',
      lastCheckedAt: row.last_checked_at || null,
      lastError: row.last_error || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  public listProviders(): PublicProvider[] {
    const rows = this.queryAll<DbProvider>(
      'SELECT * FROM providers ORDER BY is_default DESC, created_at ASC'
    );
    return rows.map((r) => this.toPublicProvider(r));
  }

  public getProviderRow(id: string): DbProvider | null {
    return this.queryOne<DbProvider>('SELECT * FROM providers WHERE id = ?', [id]);
  }

  public getDefaultProviderRow(): DbProvider | null {
    const activeId = this.getUserSetting('active_provider_id');
    if (activeId) {
      const active = this.getProviderRow(activeId);
      if (active) return active;
    }
    return (
      this.queryOne<DbProvider>('SELECT * FROM providers WHERE is_default = 1 LIMIT 1') ||
      this.queryOne<DbProvider>('SELECT * FROM providers ORDER BY created_at ASC LIMIT 1')
    );
  }

  public getDecryptedProviderKey(id: string): string {
    const row = this.getProviderRow(id);
    if (!row || !row.encrypted_api_key) return '';
    const keyMgr = getMasterKeyManager(this.getDbDir());
    return keyMgr.decrypt(row.encrypted_api_key);
  }

  public createProvider(input: {
    id?: string;
    name: string;
    type: ApiProviderType;
    baseUrl?: string;
    apiEndpoint?: string;
    apiKey?: string;
    isDefault?: boolean;
    status?: 'unverified' | 'connected' | 'error';
  }): PublicProvider {
    const cleanKey = (input.apiKey || '').trim();
    const keyMgr = getMasterKeyManager(this.getDbDir());
    const encryptedKey = cleanKey ? keyMgr.encrypt(cleanKey) : '';
    const keyMask = cleanKey ? maskSecret(cleanKey) : '';

    const now = new Date().toISOString();
    const id = input.id || `prov-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const existingCount = this.queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM providers')?.cnt || 0;
    const shouldBeDefault = input.isDefault || existingCount === 0;

    if (shouldBeDefault) {
      this.run('UPDATE providers SET is_default = 0');
    }

    this.run(
      `INSERT INTO providers (
        id, name, type, base_url, api_endpoint, encrypted_api_key, key_mask,
        is_default, status, last_checked_at, last_error, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.name.trim(),
        input.type,
        (input.baseUrl || '').trim(),
        (input.apiEndpoint || '').trim(),
        encryptedKey,
        keyMask,
        shouldBeDefault ? 1 : 0,
        input.status || 'unverified',
        null,
        null,
        now,
        now,
      ]
    );

    if (shouldBeDefault) {
      this.setUserSettings({ active_provider_id: id });
    }

    const row = this.getProviderRow(id)!;
    return this.toPublicProvider(row);
  }

  public updateProvider(
    id: string,
    updates: {
      name?: string;
      type?: ApiProviderType;
      baseUrl?: string;
      apiEndpoint?: string;
      apiKey?: string;
      clearApiKey?: boolean;
      isDefault?: boolean;
      status?: 'unverified' | 'connected' | 'error';
      lastCheckedAt?: string | null;
      lastError?: string | null;
    }
  ): PublicProvider | null {
    const existing = this.getProviderRow(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    if (updates.isDefault) {
      this.run('UPDATE providers SET is_default = 0');
      this.setUserSettings({ active_provider_id: id });
    }

    let encryptedKey = existing.encrypted_api_key;
    let keyMask = existing.key_mask;
    if (updates.clearApiKey) {
      encryptedKey = '';
      keyMask = '';
    } else if (typeof updates.apiKey === 'string' && updates.apiKey.trim().length > 0) {
      const cleanKey = updates.apiKey.trim();
      encryptedKey = getMasterKeyManager(this.getDbDir()).encrypt(cleanKey);
      keyMask = maskSecret(cleanKey);
    }

    this.run(
      `UPDATE providers
       SET name = ?, type = ?, base_url = ?, api_endpoint = ?, encrypted_api_key = ?, key_mask = ?,
           is_default = ?, status = ?, last_checked_at = ?, last_error = ?, updated_at = ?
       WHERE id = ?`,
      [
        updates.name !== undefined ? updates.name.trim() : existing.name,
        updates.type !== undefined ? updates.type : existing.type,
        updates.baseUrl !== undefined ? updates.baseUrl.trim() : existing.base_url,
        updates.apiEndpoint !== undefined ? updates.apiEndpoint.trim() : existing.api_endpoint,
        encryptedKey,
        keyMask,
        updates.isDefault !== undefined ? (updates.isDefault ? 1 : 0) : existing.is_default,
        updates.status !== undefined ? updates.status : existing.status,
        updates.lastCheckedAt !== undefined ? updates.lastCheckedAt : existing.last_checked_at,
        updates.lastError !== undefined ? updates.lastError : existing.last_error,
        now,
        id,
      ]
    );

    const updated = this.getProviderRow(id)!;
    return this.toPublicProvider(updated);
  }

  public deleteProvider(id: string): boolean {
    const existing = this.getProviderRow(id);
    if (!existing) return false;
    this.run('DELETE FROM providers WHERE id = ?', [id]);

    if (existing.is_default === 1 || this.getUserSetting('active_provider_id') === id) {
      const next = this.queryOne<DbProvider>('SELECT * FROM providers ORDER BY created_at ASC LIMIT 1');
      if (next) {
        this.run('UPDATE providers SET is_default = 1 WHERE id = ?', [next.id]);
        this.setUserSettings({ active_provider_id: next.id });
      } else {
        this.setUserSettings({ active_provider_id: '' });
      }
    }
    return true;
  }

  // ==================== CUSTOM MODELS ====================

  public listCustomModels(providerId?: string): DbCustomModel[] {
    if (providerId) {
      return this.queryAll<DbCustomModel>(
        'SELECT * FROM custom_models WHERE provider_id = ? ORDER BY created_at DESC',
        [providerId]
      );
    }
    return this.queryAll<DbCustomModel>('SELECT * FROM custom_models ORDER BY created_at DESC');
  }

  public createCustomModel(input: {
    providerId: string;
    modelId: string;
    displayName?: string;
    isDefault?: boolean;
  }): DbCustomModel {
    const id = `cmodel-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const now = new Date().toISOString();
    if (input.isDefault) {
      this.run('UPDATE custom_models SET is_default = 0');
      this.setUserSettings({ default_model: input.modelId.trim() });
    }
    this.run(
      `INSERT INTO custom_models (id, provider_id, model_id, display_name, is_default, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.providerId,
        input.modelId.trim(),
        (input.displayName || input.modelId).trim(),
        input.isDefault ? 1 : 0,
        now,
      ]
    );
    return this.queryOne<DbCustomModel>('SELECT * FROM custom_models WHERE id = ?', [id])!;
  }

  public deleteCustomModel(id: string): boolean {
    const existing = this.queryOne<DbCustomModel>('SELECT * FROM custom_models WHERE id = ?', [id]);
    if (!existing) return false;
    this.run('DELETE FROM custom_models WHERE id = ?', [id]);
    return true;
  }

  // ==================== LICENSE STATE ====================

  public getLicenseRow(): DbLicenseState {
    const row = this.queryOne<DbLicenseState>('SELECT * FROM license_state WHERE id = ?', ['primary']);
    if (row) return row;
    this.ensureInitialDefaults();
    return this.queryOne<DbLicenseState>('SELECT * FROM license_state WHERE id = ?', ['primary'])!;
  }

  public getDecryptedLicenseKey(): string {
    const row = this.getLicenseRow();
    if (!row.encrypted_key) return '';
    try {
      return getMasterKeyManager(this.getDbDir()).decrypt(row.encrypted_key);
    } catch {
      return '';
    }
  }

  public saveLicenseState(updates: Partial<{
    plan: PlanTier;
    status: LicenseStatusType;
    rawKey: string;
    maskedKey: string;
    clearKey: boolean;
    productId: string;
    productName: string;
    planName: string;
    entitlements: Record<string, any>;
    activatedAt: string | null;
    expiresAt: string | null;
    lastVerifiedAt: string | null;
    cacheExpiresAt: string | null;
    graceDays: number;
    offlineToken: string;
    lastError: string | null;
  }>): DbLicenseState {
    const existing = this.getLicenseRow();
    const now = new Date().toISOString();
    const keyMgr = getMasterKeyManager(this.getDbDir());

    let encryptedKey = existing.encrypted_key;
    let maskedKey = existing.masked_key;
    if (updates.clearKey) {
      encryptedKey = '';
      maskedKey = '';
    } else if (typeof updates.rawKey === 'string' && updates.rawKey.trim()) {
      const clean = updates.rawKey.trim();
      encryptedKey = keyMgr.encrypt(clean);
      maskedKey = maskSecret(clean);
    } else if (updates.maskedKey !== undefined) {
      maskedKey = updates.maskedKey;
    }

    let encryptedOfflineToken = existing.offline_token;
    if (updates.offlineToken !== undefined) {
      encryptedOfflineToken = updates.offlineToken ? keyMgr.encrypt(updates.offlineToken) : '';
    }

    const entitlementsJson =
      updates.entitlements !== undefined
        ? JSON.stringify(updates.entitlements)
        : existing.entitlements_json;

    this.run(
      `UPDATE license_state
       SET plan = ?, status = ?, masked_key = ?, encrypted_key = ?, product_id = ?, product_name = ?,
           plan_name = ?, entitlements_json = ?, activated_at = ?, expires_at = ?, last_verified_at = ?,
           cache_expires_at = ?, grace_days = ?, offline_token = ?, last_error = ?, updated_at = ?
       WHERE id = 'primary'`,
      [
        updates.plan !== undefined ? updates.plan : existing.plan,
        updates.status !== undefined ? updates.status : existing.status,
        maskedKey,
        encryptedKey,
        updates.productId !== undefined ? updates.productId : existing.product_id,
        updates.productName !== undefined ? updates.productName : existing.product_name,
        updates.planName !== undefined ? updates.planName : existing.plan_name,
        entitlementsJson,
        updates.activatedAt !== undefined ? updates.activatedAt : existing.activated_at,
        updates.expiresAt !== undefined ? updates.expiresAt : existing.expires_at,
        updates.lastVerifiedAt !== undefined ? updates.lastVerifiedAt : existing.last_verified_at,
        updates.cacheExpiresAt !== undefined ? updates.cacheExpiresAt : existing.cache_expires_at,
        updates.graceDays !== undefined ? updates.graceDays : existing.grace_days,
        encryptedOfflineToken,
        updates.lastError !== undefined ? updates.lastError : existing.last_error,
        now,
      ]
    );

    this.persistNow();
    return this.getLicenseRow();
  }

  // ==================== USAGE COUNTERS ====================

  public getUsageCounter(dateKey: string): DbUsageCounter {
    const row = this.queryOne<DbUsageCounter>('SELECT * FROM usage_counters WHERE date_key = ?', [dateKey]);
    if (row) return row;
    const now = new Date().toISOString();
    this.run(
      'INSERT INTO usage_counters (date_key, plan, requests_used, tokens_used, updated_at) VALUES (?, ?, 0, 0, ?)',
      [dateKey, 'free', now]
    );
    return {
      date_key: dateKey,
      plan: 'free',
      requests_used: 0,
      tokens_used: 0,
      updated_at: now,
    };
  }

  public setUsageCounter(dateKey: string, plan: PlanTier, requestsUsed: number, tokensUsed: number): DbUsageCounter {
    const now = new Date().toISOString();
    this.run(
      `INSERT OR REPLACE INTO usage_counters (date_key, plan, requests_used, tokens_used, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [dateKey, plan, Math.max(0, requestsUsed), Math.max(0, tokensUsed), now]
    );
    return {
      date_key: dateKey,
      plan,
      requests_used: Math.max(0, requestsUsed),
      tokens_used: Math.max(0, tokensUsed),
      updated_at: now,
    };
  }

  // ==================== CONVERSATIONS ====================

  public getConversations(userId?: string): DbConversation[] {
    let sql = `
      SELECT 
        c.id, 
        c.user_id, 
        c.title, 
        c.model, 
        c.provider, 
        c.system_instruction, 
        c.created_at, 
        c.updated_at,
        COUNT(m.id) as message_count
      FROM conversations c
      LEFT JOIN messages m ON c.id = m.conversation_id
    `;
    const params: SqlValue[] = [];

    if (userId) {
      sql += ' WHERE c.user_id = ? ';
      params.push(userId);
    }

    sql += ' GROUP BY c.id ORDER BY c.updated_at DESC';

    return this.queryAll<DbConversation>(sql, params);
  }

  public getConversation(id: string): { conversation: DbConversation; messages: DbMessage[] } | null {
    const conv = this.queryOne<DbConversation>(
      'SELECT * FROM conversations WHERE id = ?',
      [id]
    );
    if (!conv) return null;

    const messages = this.queryAll<DbMessage>(
      'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
      [id]
    );

    return { conversation: conv, messages };
  }

  public createConversation(data: {
    id: string;
    user_id?: string;
    title?: string;
    model?: string;
    provider?: string;
    system_instruction?: string;
    created_at?: string;
    updated_at?: string;
  }): DbConversation {
    const now = new Date().toISOString();
    const conv: DbConversation = {
      id: data.id,
      user_id: data.user_id || null,
      title: data.title || 'New chat',
      model: data.model || '',
      provider: data.provider || 'openai',
      system_instruction: data.system_instruction || '',
      created_at: data.created_at || now,
      updated_at: data.updated_at || now,
    };

    this.run(
      `INSERT OR REPLACE INTO conversations (id, user_id, title, model, provider, system_instruction, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        conv.id,
        conv.user_id || null,
        conv.title,
        conv.model || '',
        conv.provider || '',
        conv.system_instruction || '',
        conv.created_at,
        conv.updated_at,
      ]
    );

    return conv;
  }

  public updateConversation(
    id: string,
    updates: Partial<{
      title: string;
      model: string;
      provider: string;
      system_instruction: string;
      updated_at: string;
    }>
  ): DbConversation | null {
    const existing = this.queryOne<DbConversation>('SELECT * FROM conversations WHERE id = ?', [id]);
    if (!existing) return null;

    const updated = {
      ...existing,
      ...updates,
      updated_at: updates.updated_at || new Date().toISOString(),
    };

    this.run(
      `UPDATE conversations 
       SET title = ?, model = ?, provider = ?, system_instruction = ?, updated_at = ?
       WHERE id = ?`,
      [
        updated.title,
        updated.model || '',
        updated.provider || '',
        updated.system_instruction || '',
        updated.updated_at,
        id,
      ]
    );

    return updated;
  }

  public deleteConversation(id: string): boolean {
    const existing = this.queryOne<DbConversation>('SELECT id FROM conversations WHERE id = ?', [id]);
    if (!existing) return false;

    this.run('DELETE FROM conversations WHERE id = ?', [id]);
    return true;
  }

  // ==================== MESSAGES ====================

  public saveMessage(msg: {
    id: string;
    conversation_id: string;
    role: 'user' | 'model' | 'assistant';
    sender: 'user' | 'ai';
    content: string;
    created_at?: string;
    metadata?: any;
  }): DbMessage {
    const now = msg.created_at || new Date().toISOString();
    const metadataStr = typeof msg.metadata === 'string' ? msg.metadata : JSON.stringify(msg.metadata || {});

    const conv = this.queryOne<DbConversation>('SELECT id FROM conversations WHERE id = ?', [msg.conversation_id]);
    if (!conv) {
      this.createConversation({
        id: msg.conversation_id,
        title: msg.sender === 'user' ? (msg.content.slice(0, 30) || 'New chat') : 'New chat',
      });
    }

    this.run(
      `INSERT OR REPLACE INTO messages (id, conversation_id, role, sender, content, created_at, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [msg.id, msg.conversation_id, msg.role, msg.sender, msg.content, now, metadataStr]
    );

    this.run(
      'UPDATE conversations SET updated_at = ? WHERE id = ?',
      [now, msg.conversation_id]
    );

    return {
      id: msg.id,
      conversation_id: msg.conversation_id,
      role: msg.role,
      sender: msg.sender,
      content: msg.content,
      created_at: now,
      metadata: metadataStr,
    };
  }

  // ==================== TOKEN USAGE ====================

  public recordTokenUsage(data: {
    id?: string;
    user_id?: string;
    conversation_id?: string;
    message_id?: string;
    provider: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    cached_input_tokens?: number;
    reasoning_tokens?: number;
    usage_source?: 'provider' | 'estimated';
    request_id?: string;
    status?: 'success' | 'error' | 'aborted';
    created_at?: string;
  }): DbTokenUsage {
    if (data.request_id) {
      const existing = this.queryOne<DbTokenUsage>(
        'SELECT * FROM token_usage WHERE request_id = ?',
        [data.request_id]
      );
      if (existing) {
        return existing;
      }
    }

    const id = data.id || 'usage-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
    const now = data.created_at || new Date().toISOString();

    const record: DbTokenUsage = {
      id,
      user_id: data.user_id || null,
      conversation_id: data.conversation_id || null,
      message_id: data.message_id || null,
      provider: data.provider || 'unknown',
      model: data.model || 'unknown',
      input_tokens: Math.max(0, Number(data.input_tokens) || 0),
      output_tokens: Math.max(0, Number(data.output_tokens) || 0),
      total_tokens: Math.max(
        0,
        Number(data.total_tokens) || ((Number(data.input_tokens) || 0) + (Number(data.output_tokens) || 0))
      ),
      cached_input_tokens: Number(data.cached_input_tokens) || 0,
      reasoning_tokens: Number(data.reasoning_tokens) || 0,
      usage_source: data.usage_source || 'provider',
      request_id: data.request_id || null,
      status: data.status || 'success',
      created_at: now,
    };

    this.run(
      `INSERT INTO token_usage (
        id, user_id, conversation_id, message_id, provider, model,
        input_tokens, output_tokens, total_tokens, cached_input_tokens,
        reasoning_tokens, usage_source, request_id, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id,
        record.user_id || null,
        record.conversation_id || null,
        record.message_id || null,
        record.provider,
        record.model,
        record.input_tokens,
        record.output_tokens,
        record.total_tokens,
        record.cached_input_tokens || 0,
        record.reasoning_tokens || 0,
        record.usage_source,
        record.request_id || null,
        record.status,
        record.created_at,
      ]
    );

    return record;
  }

  public getUsageHistory(options: {
    limit?: number;
    offset?: number;
    provider?: string;
    model?: string;
    month?: string;
  } = {}) {
    const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 200);
    const offset = Math.max(Number(options.offset) || 0, 0);

    const conditions: string[] = [];
    const params: SqlValue[] = [];

    if (options.provider && options.provider !== 'all') {
      conditions.push('t.provider = ?');
      params.push(options.provider);
    }
    if (options.model && options.model !== 'all') {
      conditions.push('t.model = ?');
      params.push(options.model);
    }
    if (options.month) {
      conditions.push('t.created_at LIKE ?');
      params.push(`${options.month}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const totalRow = this.queryOne<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM token_usage t ${whereClause}`,
      params
    );

    const rows = this.queryAll<any>(
      `SELECT t.*, c.title as conversation_title
       FROM token_usage t
       LEFT JOIN conversations c ON t.conversation_id = c.id
       ${whereClause}
       ORDER BY t.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const totals = this.queryOne<{
      totalRequests: number;
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    }>(
      `SELECT 
         COUNT(*) as totalRequests,
         COALESCE(SUM(input_tokens), 0) as promptTokens,
         COALESCE(SUM(output_tokens), 0) as completionTokens,
         COALESCE(SUM(total_tokens), 0) as totalTokens
       FROM token_usage t
       ${whereClause}`,
      params
    );

    return {
      records: rows,
      totalCount: totalRow?.cnt || 0,
      totals: totals || {
        totalRequests: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
      limit,
      offset,
    };
  }

  // ==================== MONTHLY ANALYTICS ====================

  public getMonthlyAnalytics(targetMonthKey?: string) {
    const now = new Date();
    const activeMonthKey = targetMonthKey || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const [yearStr, monthStr] = activeMonthKey.split('-');
    const targetYear = parseInt(yearStr, 10);
    const targetMonthIndex = parseInt(monthStr, 10) - 1;
    const daysInMonth = new Date(targetYear, targetMonthIndex + 1, 0).getDate();

    const usageRows = this.queryAll<DbTokenUsage>(
      `SELECT * FROM token_usage 
       WHERE created_at LIKE ? AND status = 'success'
       ORDER BY created_at ASC`,
      [`${activeMonthKey}%`]
    );

    const activeConvs = this.queryAll<{ count: number }>(
      `SELECT COUNT(DISTINCT conversation_id) as count 
       FROM token_usage 
       WHERE created_at LIKE ? AND conversation_id IS NOT NULL`,
      [`${activeMonthKey}%`]
    );

    const USD_PER_TOKEN = 0.00000025;
    const USD_TO_VND_RATE = 25400;

    const dailyMap = new Map<string, {
      date: string;
      displayDate: string;
      tokens: number;
      inputTokens: number;
      outputTokens: number;
      messages: number;
      costUsd: number;
    }>();

    for (let day = 1; day <= daysInMonth; day++) {
      const dayStr = String(day).padStart(2, '0');
      const dateKey = `${activeMonthKey}-${dayStr}`;
      dailyMap.set(dateKey, {
        date: dateKey,
        displayDate: `${dayStr}/${monthStr}`,
        tokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        messages: 0,
        costUsd: 0,
      });
    }

    let totalTokens = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const totalMessages = usageRows.length;

    const byProvider: Record<string, { tokens: number; inputTokens: number; outputTokens: number; requests: number }> = {};
    const byModel: Record<string, { tokens: number; inputTokens: number; outputTokens: number; requests: number; provider: string }> = {};
    const bySource: Record<string, number> = { provider: 0, estimated: 0 };

    for (const row of usageRows) {
      const dateKey = row.created_at.slice(0, 10);
      totalTokens += row.total_tokens;
      totalInputTokens += row.input_tokens;
      totalOutputTokens += row.output_tokens;

      if (!byProvider[row.provider]) {
        byProvider[row.provider] = { tokens: 0, inputTokens: 0, outputTokens: 0, requests: 0 };
      }
      byProvider[row.provider].tokens += row.total_tokens;
      byProvider[row.provider].inputTokens += row.input_tokens;
      byProvider[row.provider].outputTokens += row.output_tokens;
      byProvider[row.provider].requests += 1;

      if (!byModel[row.model]) {
        byModel[row.model] = { tokens: 0, inputTokens: 0, outputTokens: 0, requests: 0, provider: row.provider };
      }
      byModel[row.model].tokens += row.total_tokens;
      byModel[row.model].inputTokens += row.input_tokens;
      byModel[row.model].outputTokens += row.output_tokens;
      byModel[row.model].requests += 1;

      const src = row.usage_source === 'estimated' ? 'estimated' : 'provider';
      bySource[src] = (bySource[src] || 0) + row.total_tokens;

      if (dailyMap.has(dateKey)) {
        const item = dailyMap.get(dateKey)!;
        item.tokens += row.total_tokens;
        item.inputTokens += row.input_tokens;
        item.outputTokens += row.output_tokens;
        item.messages += 1;
        item.costUsd = Number((item.tokens * USD_PER_TOKEN).toFixed(4));
      }
    }

    const dailyData = Array.from(dailyMap.values());
    const estimatedCostUsd = Number((totalTokens * USD_PER_TOKEN).toFixed(4));
    const estimatedCostVnd = Math.round(estimatedCostUsd * USD_TO_VND_RATE);

    const allMonthsRaw = this.queryAll<{ monthKey: string }>(`
      SELECT DISTINCT SUBSTR(created_at, 1, 7) as monthKey 
      FROM token_usage 
      ORDER BY monthKey DESC
    `);
    const recordedMonths = allMonthsRaw.map((r) => r.monthKey).filter(Boolean);
    if (!recordedMonths.includes(activeMonthKey)) {
      recordedMonths.unshift(activeMonthKey);
    }

    return {
      monthKey: activeMonthKey,
      monthLabel: activeMonthKey,
      totalTokens,
      totalInputTokens,
      totalOutputTokens,
      totalRequests: totalMessages,
      totalConversations: activeConvs[0]?.count || 0,
      totalMessages,
      estimatedCostUsd,
      estimatedCostVnd,
      dailyData,
      byProvider,
      byModel,
      bySource,
      recordedMonths,
    };
  }

  public getRecentMonthsSummary(count: number = 6) {
    const result: any[] = [];
    const now = new Date();

    for (let i = 0; i < count; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const key = `${year}-${month}`;
      const analytics = this.getMonthlyAnalytics(key);

      result.push({
        monthKey: key,
        monthLabel: key,
        tokens: analytics.totalTokens,
        inputTokens: analytics.totalInputTokens,
        outputTokens: analytics.totalOutputTokens,
        conversations: analytics.totalConversations,
        messages: analytics.totalMessages,
        costUsd: analytics.estimatedCostUsd,
        costVnd: analytics.estimatedCostVnd,
      });
    }

    return result;
  }
}

export const dbManager = new DatabaseManager();
