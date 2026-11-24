import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TEST_PROVIDER_KEY = 'sk-test-secret-openai-99887766554433221100';
const TEST_CLAUDE_KEY = 'sk-ant-api03-secret-claude-77665544332211';
const TEST_LICENSE_KEY = 'CHATAICOMM-9BCE-0E5A-2606-4648';
const TEST_ACTIVATION_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.keygate-secret-token';

function runWorker(action: string, dbPath: string, extraArgs: string[] = []): string {
  const tsxBin = path.resolve(process.cwd(), 'node_modules', '.bin', 'tsx');
  const scriptPath = path.resolve(process.cwd(), 'tests', 'security-license.test.ts');
  const out = execFileSync(tsxBin, [scriptPath, '--worker', action, ...extraArgs], {
    env: {
      ...process.env,
      DB_PATH: dbPath,
      KEYGATE_BASE_URL: 'https://chatai.xface.blog',
    },
    encoding: 'utf-8',
  });
  const lines = out.split('\n');
  const marker = '__WORKER_JSON__:';
  const jsonLine = lines.find((l) => l.startsWith(marker));
  if (!jsonLine) {
    throw new Error(`Worker did not emit JSON output. Raw stdout:\n${out}`);
  }
  return jsonLine.slice(marker.length);
}

async function handleWorker(action: string, extraArgs: string[]) {
  const { dbManager } = await import('../server/db.ts');
  const { licenseService } = await import('../server/keygate.ts');
  await dbManager.init();

  if (action === 'decrypt-check') {
    const provId = extraArgs[0];
    const keyStatus = dbManager.getMasterKeyStatus();
    const decrypted = keyStatus.status === 'ready' ? dbManager.getDecryptedProviderKey(provId) : '';
    const providers = dbManager.listProviders();
    console.log(`__WORKER_JSON__:${JSON.stringify({ keyStatus, decrypted, providers })}`);
    return;
  }

  if (action === 'missing-key-check') {
    const provId = extraArgs[0];
    const keyStatus = dbManager.getMasterKeyStatus();
    let decryptErrorCode = '';
    try {
      dbManager.getDecryptedProviderKey(provId);
    } catch (err: any) {
      decryptErrorCode = err?.code || 'ERR';
    }
    const lic = await licenseService.getEffectiveLicenseState(false);
    console.log(`__WORKER_JSON__:${JSON.stringify({ keyStatus, decryptErrorCode, licStatus: lic.status, licError: lic.lastError })}`);
    return;
  }

  if (action === 'wrong-key-check') {
    const provId = extraArgs[0];
    const keyStatus = dbManager.getMasterKeyStatus();
    let decryptError = '';
    try {
      dbManager.getDecryptedProviderKey(provId);
    } catch (err: any) {
      decryptError = err?.code || err?.message || 'ERR';
    }
    console.log(`__WORKER_JSON__:${JSON.stringify({ keyStatus, decryptError })}`);
    return;
  }

  throw new Error(`Unknown worker action: ${action}`);
}

async function runAllTests() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'chatai-sec-test-'));
  const dataDir = path.join(tmpRoot, 'data');
  const dbPath = path.join(dataDir, 'chatai.db');
  const secretsDir = path.join(dataDir, 'secrets');
  const masterKeyPath = path.join(secretsDir, 'master.key');

  process.env.DB_PATH = dbPath;
  process.env.KEYGATE_BASE_URL = 'https://chatai.xface.blog';

  try {
    const { dbManager } = await import('../server/db.ts');
    const { getMasterKeyManager, MasterKeyManager } = await import('../server/crypto.ts');
    const { licenseService } = await import('../server/keygate.ts');

    await dbManager.init();

    // Verify master.key auto-created on true first launch with 0600 permissions
    assert.equal(fs.existsSync(masterKeyPath), true, 'master.key should be auto-generated on first run');
    const stat = fs.statSync(masterKeyPath);
    assert.equal((stat.mode & 0o777).toString(8), '600', 'master.key permissions must be 0600');
    const initStatus = dbManager.getMasterKeyStatus();
    assert.equal(initStatus.status, 'ready');
    assert.equal(initStatus.activeKeyVersion, 1);

    // ------------------------------------------------------------------
    // TEST 1: New API key is encrypted before saving (AES-256-GCM + unique CSPRNG IV)
    // ------------------------------------------------------------------
    const p1 = dbManager.createProvider({
      name: 'OpenAI Primary',
      type: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: TEST_PROVIDER_KEY,
      isDefault: true,
    });
    const p2 = dbManager.createProvider({
      name: 'Claude Secondary',
      type: 'claude',
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: TEST_CLAUDE_KEY,
      isDefault: false,
    });
    dbManager.persistNow();

    const row1 = dbManager.getProviderRow(p1.id)!;
    const row2 = dbManager.getProviderRow(p2.id)!;
    const env1 = JSON.parse(row1.encrypted_api_key);
    const env2 = JSON.parse(row2.encrypted_api_key);

    assert.equal(env1.version, 2);
    assert.equal(env1.key_version, 1);
    assert.equal(env1.algorithm, 'aes-256-gcm');
    assert.ok(env1.iv && Buffer.from(env1.iv, 'base64').length === 12);
    assert.ok(env1.auth_tag && Buffer.from(env1.auth_tag, 'base64').length === 16);
    assert.ok(env1.ciphertext);
    assert.notEqual(env1.iv, env2.iv, 'Each encryption must use a unique CSPRNG nonce/IV');
    console.log('PASS [1/12] New API key encrypted with AES-256-GCM + unique CSPRNG IV before saving');

    // ------------------------------------------------------------------
    // TEST 2: Database contains zero plaintext API keys (scan raw SQLite bytes & rows)
    // ------------------------------------------------------------------
    const dbBytes = fs.readFileSync(dbPath);
    assert.equal(dbBytes.includes(Buffer.from(TEST_PROVIDER_KEY, 'utf-8')), false, 'Raw DB file must not contain plaintext OpenAI key');
    assert.equal(dbBytes.includes(Buffer.from(TEST_CLAUDE_KEY, 'utf-8')), false, 'Raw DB file must not contain plaintext Claude key');
    assert.equal(row1.encrypted_api_key.includes(TEST_PROVIDER_KEY), false);
    assert.equal(row1.key_mask.includes('99887766554433221100'), false);
    console.log('PASS [2/12] SQLite database file and rows contain zero plaintext API keys');

    // ------------------------------------------------------------------
    // TEST 3 & TEST 12: Backend decrypts and calls provider + Keygate Activate/Verify
    // ------------------------------------------------------------------
    const origFetch = globalThis.fetch;
    let capturedProviderAuthHeader = '';
    let keygateActivateCalledUrl = '';
    let keygateVerifyCalledUrl = '';
    let keygateRedirectMode = '';

    globalThis.fetch = (async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url === 'https://api.openai.com/v1/models') {
        capturedProviderAuthHeader = init?.headers?.Authorization || '';
        return new Response(JSON.stringify({ data: [{ id: 'gpt-4o-mini' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url === 'https://chatai.xface.blog/api/v1/license/activate') {
        keygateActivateCalledUrl = url;
        keygateRedirectMode = init?.redirect || '';
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              status: 'activated',
              license_id: '9bce0e5a-2606-4648-894d-3cef3298952d',
              token: TEST_ACTIVATION_TOKEN,
              meta: {
                server: 'Keygate',
                url: 'https://keygate.app', // Must be IGNORED by ChatAI
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url === 'https://chatai.xface.blog/api/v1/license/verify') {
        keygateVerifyCalledUrl = url;
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              status: 'active',
              plan_name: 'Community',
              product_name: 'ChatAI',
              token: TEST_ACTIVATION_TOKEN,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      throw new Error(`Unexpected outbound fetch URL in test: ${url}`);
    }) as typeof fetch;

    try {
      // Simulate backend decrypting and calling OpenAI provider
      const decryptedForCall = dbManager.getDecryptedProviderKey(p1.id);
      assert.equal(decryptedForCall, TEST_PROVIDER_KEY);
      const provRes = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${decryptedForCall}` },
        redirect: 'manual',
      });
      assert.equal(provRes.ok, true);
      assert.equal(capturedProviderAuthHeader, `Bearer ${TEST_PROVIDER_KEY}`);
      console.log('PASS [3/12] Backend decrypts API key from SQLite and calls AI provider successfully');

      // Test 12a: Keygate URL validation & redirect rejection
      assert.equal(licenseService.validateKeygateUrl('https://chatai.xface.blog').valid, true);
      assert.equal(licenseService.validateKeygateUrl('http://chatai.xface.blog').valid, false, 'HTTP must be rejected');
      assert.equal(licenseService.validateKeygateUrl('https://evil.example.com').valid, false, 'Other hostnames must be rejected');

      // Test 12b: Activate with real Keygate contract ("status": "activated", meta.url ignored)
      const actRes = await licenseService.activateLicense(TEST_LICENSE_KEY);
      assert.equal(actRes.ok, true);
      assert.equal(actRes.license.plan, 'community');
      assert.equal(actRes.license.status, 'active');
      assert.equal(keygateActivateCalledUrl, 'https://chatai.xface.blog/api/v1/license/activate');
      assert.equal(keygateRedirectMode, 'manual');

      // Ensure raw license key and activation token are encrypted in SQLite (no plaintext)
      const dbBytesAfterLic = fs.readFileSync(dbPath);
      assert.equal(dbBytesAfterLic.includes(Buffer.from(TEST_LICENSE_KEY, 'utf-8')), false, 'DB must not contain plaintext license key');
      assert.equal(dbBytesAfterLic.includes(Buffer.from(TEST_ACTIVATION_TOKEN, 'utf-8')), false, 'DB must not contain plaintext activation token');
      assert.equal(JSON.stringify(actRes.license).includes(TEST_ACTIVATION_TOKEN), false, 'Frontend license payload must not expose activation token');
      assert.equal(JSON.stringify(actRes.license).includes('https://keygate.app'), false, 'meta.url must be ignored');

      // Test 12c: Verify license
      const verRes = await licenseService.verifyLicense();
      assert.equal(verRes.ok, true);
      assert.equal(verRes.license.plan, 'community');
      assert.equal(keygateVerifyCalledUrl, 'https://chatai.xface.blog/api/v1/license/verify');
      console.log('PASS [12/12] Keygate Activate ("status":"activated", ignores meta.url) & Verify pass strict HTTPS/hostname checks');
    } finally {
      globalThis.fetch = origFetch;
    }

    // Test redirect blocking on Keygate
    globalThis.fetch = (async () =>
      new Response(null, { status: 302, headers: { Location: 'https://evil.example.com' } })) as typeof fetch;
    try {
      const redirRes = await licenseService.verifyLicense(TEST_LICENSE_KEY);
      assert.equal(redirRes.ok, false);
      assert.equal(redirRes.errorCode, 'KEYGATE_REDIRECT_BLOCKED');
    } finally {
      globalThis.fetch = origFetch;
    }

    // ------------------------------------------------------------------
    // TEST 4: Frontend never receives full API key
    // ------------------------------------------------------------------
    const publicProvidersJson = JSON.stringify(dbManager.listProviders());
    assert.equal(publicProvidersJson.includes(TEST_PROVIDER_KEY), false);
    assert.equal(publicProvidersJson.includes(TEST_CLAUDE_KEY), false);
    assert.equal(p1.hasApiKey, true);
    assert.equal(p1.keyMask, 'sk-te••••1100');
    console.log('PASS [4/12] Frontend public provider payloads never contain full API key');

    // ------------------------------------------------------------------
    // TEST 5: App restart still decrypts saved API keys (new child process)
    // ------------------------------------------------------------------
    const restartOut = JSON.parse(runWorker('decrypt-check', dbPath, [p1.id]));
    assert.equal(restartOut.keyStatus.status, 'ready');
    assert.equal(restartOut.decrypted, TEST_PROVIDER_KEY);
    console.log('PASS [5/12] App restart (fresh Node process) decrypts saved API keys cleanly');

    // ------------------------------------------------------------------
    // TEST 6: Recreated Docker container (simulated by fresh process + fresh DB/secrets mount)
    // ------------------------------------------------------------------
    const containerSimDir = path.join(tmpRoot, 'container-remount');
    const containerDbDir = path.join(containerSimDir, 'data');
    fs.mkdirSync(path.join(containerDbDir, 'secrets'), { recursive: true, mode: 0o700 });
    const containerDbPath = path.join(containerDbDir, 'chatai.db');
    fs.copyFileSync(dbPath, containerDbPath);
    fs.copyFileSync(masterKeyPath, path.join(containerDbDir, 'secrets', 'master.key'));
    fs.chmodSync(path.join(containerDbDir, 'secrets', 'master.key'), 0o600);

    const containerOut = JSON.parse(runWorker('decrypt-check', containerDbPath, [p1.id]));
    assert.equal(containerOut.keyStatus.status, 'ready');
    assert.equal(containerOut.decrypted, TEST_PROVIDER_KEY);
    console.log('PASS [6/12] Recreated Docker container using persistent /data volume decrypts API keys');

    // ------------------------------------------------------------------
    // TEST 7: Tampered ciphertext fails decryption
    // ------------------------------------------------------------------
    const keyMgr = getMasterKeyManager(dataDir);
    const originalCipherJson = dbManager.getProviderRow(p1.id)!.encrypted_api_key;
    const tamperedObj = JSON.parse(originalCipherJson);
    const bufCipher = Buffer.from(tamperedObj.ciphertext, 'base64');
    bufCipher[0] = bufCipher[0] ^ 0xff;
    tamperedObj.ciphertext = bufCipher.toString('base64');
    assert.throws(() => keyMgr.decrypt(JSON.stringify(tamperedObj)), /unable to authenticate|unsupported state/i);

    const tamperedTagObj = JSON.parse(originalCipherJson);
    const bufTag = Buffer.from(tamperedTagObj.auth_tag, 'base64');
    bufTag[0] = bufTag[0] ^ 0xff;
    tamperedTagObj.auth_tag = bufTag.toString('base64');
    assert.throws(() => keyMgr.decrypt(JSON.stringify(tamperedTagObj)), /unable to authenticate|unsupported state/i);
    console.log('PASS [7/12] Tampered ciphertext and tampered auth_tag fail AES-256-GCM verification');

    // ------------------------------------------------------------------
    // TEST 10 (Part A): Export encrypted backup BEFORE testing missing/wrong key
    // ------------------------------------------------------------------
    const backupPass = 'UltraStrongPassphrase!2026';
    const backupJson = dbManager.backupMasterKey(backupPass);
    const parsedBackup = JSON.parse(backupJson);
    assert.equal(parsedBackup.format, 'chatai-master-key-backup');
    assert.equal(parsedBackup.kdf, 'scrypt');
    assert.equal(parsedBackup.algorithm, 'aes-256-gcm');

    // ------------------------------------------------------------------
    // TEST 8: Missing master.key produces clear error & NEVER auto-generates new key
    // ------------------------------------------------------------------
    const missingTestDir = path.join(tmpRoot, 'missing-key-test');
    fs.mkdirSync(path.join(missingTestDir, 'secrets'), { recursive: true });
    const missingDbPath = path.join(missingTestDir, 'chatai.db');
    fs.copyFileSync(dbPath, missingDbPath);
    // Deliberately do NOT copy master.key!

    const missingOut = JSON.parse(runWorker('missing-key-check', missingDbPath, [p1.id]));
    assert.equal(missingOut.keyStatus.status, 'missing');
    assert.equal(missingOut.keyStatus.errorCode, 'MASTER_KEY_MISSING');
    assert.equal(missingOut.decryptErrorCode, 'MASTER_KEY_MISSING');
    assert.equal(fs.existsSync(path.join(missingTestDir, 'secrets', 'master.key')), false, 'MUST NOT auto-generate master.key when missing');
    console.log('PASS [8/12] Missing master.key reports clear error and NEVER auto-generates replacement');

    // ------------------------------------------------------------------
    // TEST 9: Wrong key cannot decrypt
    // ------------------------------------------------------------------
    const wrongTestDir = path.join(tmpRoot, 'wrong-key-test');
    fs.mkdirSync(path.join(wrongTestDir, 'secrets'), { recursive: true, mode: 0o700 });
    const wrongDbPath = path.join(wrongTestDir, 'chatai.db');
    fs.copyFileSync(dbPath, wrongDbPath);
    const wrongKeyFile = {
      version: 1,
      activeKeyVersion: 1,
      keys: { '1': crypto.randomBytes(32).toString('base64') },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(wrongTestDir, 'secrets', 'master.key'), JSON.stringify(wrongKeyFile), { mode: 0o600 });

    const wrongOut = JSON.parse(runWorker('wrong-key-check', wrongDbPath, [p1.id]));
    assert.equal(wrongOut.keyStatus.status, 'mismatch');
    assert.equal(wrongOut.keyStatus.errorCode, 'MASTER_KEY_MISMATCH');
    assert.equal(wrongOut.decryptError, 'MASTER_KEY_MISMATCH');

    // Also verify MasterKeyManager with wrong key fails GCM auth tag directly
    const wrongMgr = new MasterKeyManager(wrongTestDir);
    wrongMgr.initialize({ hasExistingEncryptedData: true, wasPreviouslyInitialized: true });
    assert.throws(() => wrongMgr.decrypt(originalCipherJson), /unable to authenticate|unsupported state/i);
    console.log('PASS [9/12] Wrong master key cannot decrypt saved ciphertexts');

    // ------------------------------------------------------------------
    // TEST 10 (Part B): Restore from encrypted backup works end-to-end
    // ------------------------------------------------------------------
    // Wrong passphrase must fail
    const restoreMgr = new MasterKeyManager(missingTestDir);
    restoreMgr.initialize({ hasExistingEncryptedData: true, wasPreviouslyInitialized: true });
    assert.throws(
      () => restoreMgr.restoreFromBackup({ backupContent: backupJson, passphrase: 'wrong-password', sampleCiphertexts: [originalCipherJson] }),
      /Invalid backup passphrase/i
    );
    // Correct passphrase must verify against sampleCiphertexts and restore master.key
    const restoredDiag = restoreMgr.restoreFromBackup({
      backupContent: backupJson,
      passphrase: backupPass,
      sampleCiphertexts: [originalCipherJson],
    });
    assert.equal(restoredDiag.status, 'ready');
    assert.equal(restoreMgr.decrypt(originalCipherJson), TEST_PROVIDER_KEY);
    const afterRestoreWorker = JSON.parse(runWorker('decrypt-check', missingDbPath, [p1.id]));
    assert.equal(afterRestoreWorker.keyStatus.status, 'ready');
    assert.equal(afterRestoreWorker.decrypted, TEST_PROVIDER_KEY);
    console.log('PASS [10/12] Encrypted backup and passphrase-verified restore work end-to-end');

    // ------------------------------------------------------------------
    // TEST 11: Key rotation re-encrypts without losing data + atomic rollback check
    // ------------------------------------------------------------------
    const beforeRotateP1 = dbManager.getProviderRow(p1.id)!.encrypted_api_key;
    const beforeRotateLic = dbManager.getLicenseRow().encrypted_key;
    const rotateRes = dbManager.rotateMasterKey();

    assert.equal(rotateRes.oldVersion, 1);
    assert.equal(rotateRes.newVersion, 2);
    assert.ok(rotateRes.reencryptedCount >= 3, 'Should re-encrypt both providers and license secrets');
    assert.equal(rotateRes.keyStatus.activeKeyVersion, 2);

    const afterRotateP1 = dbManager.getProviderRow(p1.id)!.encrypted_api_key;
    const afterRotateLic = dbManager.getLicenseRow().encrypted_key;
    assert.notEqual(afterRotateP1, beforeRotateP1);
    assert.notEqual(afterRotateLic, beforeRotateLic);
    assert.equal(JSON.parse(afterRotateP1).key_version, 2);
    assert.equal(JSON.parse(afterRotateLic).key_version, 2);

    // Decrypt after rotation & after process restart
    assert.equal(dbManager.getDecryptedProviderKey(p1.id), TEST_PROVIDER_KEY);
    assert.equal(dbManager.getDecryptedProviderKey(p2.id), TEST_CLAUDE_KEY);
    assert.equal(dbManager.getDecryptedLicenseKey(), TEST_LICENSE_KEY);
    const postRotateWorker = JSON.parse(runWorker('decrypt-check', dbPath, [p1.id]));
    assert.equal(postRotateWorker.keyStatus.activeKeyVersion, 2);
    assert.equal(postRotateWorker.decrypted, TEST_PROVIDER_KEY);

    // Atomic rollback if DB commit throws during rotation
    assert.throws(() => {
      keyMgr.rotateKeyWithReencryption([{ id: 'p1', value: afterRotateP1 }], () => {
        throw new Error('Simulated DB commit failure');
      });
    }, /Simulated DB commit failure/);
    assert.equal(keyMgr.getDiagnostics().activeKeyVersion, 2, 'Key version must roll back cleanly on failure');
    assert.equal(keyMgr.decrypt(afterRotateP1), TEST_PROVIDER_KEY);
    console.log('PASS [11/12] Key rotation re-encrypts all secrets atomically with rollback protection');

    console.log('\nALL 12 SECURITY & LICENSE VERIFICATION TESTS PASSED!');
  } finally {
    await new Promise((r) => setTimeout(r, 200));
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

const args = process.argv.slice(2);
if (args[0] === '--worker') {
  handleWorker(args[1], args.slice(2)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  runAllTests().catch((err) => {
    console.error('TEST FAILURE:', err);
    process.exit(1);
  });
}
