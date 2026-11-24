import { dbManager, DbLicenseState, LicenseStatusType, PlanTier } from './db.ts';

export interface LicenseEntitlements {
  usageAnalytics: boolean;
  tokenHistory: boolean;
  customModels: boolean;
  dailyChatLimit?: number;
  dailyTokenLimit?: number;
  raw?: Record<string, any>;
}

export interface PublicLicenseInfo {
  plan: PlanTier;
  status: LicenseStatusType;
  maskedKey: string;
  productId: string;
  productName: string;
  planName: string;
  entitlements: LicenseEntitlements;
  activatedAt: string | null;
  expiresAt: string | null;
  lastVerifiedAt: string | null;
  cacheExpiresAt: string | null;
  graceDays: number;
  lastError: string | null;
  keygateConfigured: boolean;
  usingCachedVerification: boolean;
}

interface KeygateApiResult {
  ok: boolean;
  networkError?: boolean;
  statusCode?: number;
  errorCode?: string;
  errorMessage?: string;
  licenseStatus?: LicenseStatusType;
  productId?: string;
  productName?: string;
  planName?: string;
  expiresAt?: string | null;
  graceDays?: number;
  token?: string;
  entitlements?: LicenseEntitlements;
}

const DEFAULT_KEYGATE_BASE_URL = 'https://chatai.xface.blog';
const ALLOWED_KEYGATE_HOSTNAME = 'chatai.xface.blog';

function parsePositiveInt(val: string | undefined, fallback: number): number {
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export class LicenseService {
  private getBaseUrl(): string {
    const raw = (process.env.KEYGATE_BASE_URL || DEFAULT_KEYGATE_BASE_URL).trim().replace(/\/+$/, '');
    return raw;
  }

  private getProductId(): string {
    return (process.env.KEYGATE_PRODUCT_ID || '').trim();
  }

  private getApiSecret(): string {
    return (process.env.KEYGATE_API_SECRET || '').trim();
  }

  private getValidationIntervalSec(): number {
    return parsePositiveInt(process.env.LICENSE_VALIDATION_INTERVAL, 3600);
  }

  private getCacheTtlSec(): number {
    return parsePositiveInt(process.env.LICENSE_CACHE_TTL, 86400);
  }

  public isKeygateConfigured(): boolean {
    return this.validateKeygateUrl(this.getBaseUrl()).valid;
  }

  public validateKeygateUrl(baseUrl: string): { valid: boolean; reason?: string } {
    if (!baseUrl) {
      return { valid: false, reason: 'KEYGATE_BASE_URL is not configured.' };
    }
    try {
      const parsed = new URL(baseUrl);
      if (parsed.protocol !== 'https:') {
        return { valid: false, reason: 'KEYGATE_BASE_URL must strictly use HTTPS.' };
      }
      if (parsed.username || parsed.password || parsed.port) {
        return { valid: false, reason: 'KEYGATE_BASE_URL must not include credentials or custom ports.' };
      }
      if (parsed.hostname.toLowerCase() !== ALLOWED_KEYGATE_HOSTNAME) {
        return {
          valid: false,
          reason: `KEYGATE_BASE_URL hostname must strictly be ${ALLOWED_KEYGATE_HOSTNAME}.`,
        };
      }
      if (parsed.pathname && parsed.pathname !== '/' && parsed.pathname !== '') {
        return { valid: false, reason: 'KEYGATE_BASE_URL must not contain a sub-path.' };
      }
      return { valid: true };
    } catch {
      return { valid: false, reason: 'KEYGATE_BASE_URL is not a valid URL.' };
    }
  }

  private parseEntitlements(rawPayload: any): LicenseEntitlements {
    const raw =
      rawPayload?.entitlements ||
      rawPayload?.features ||
      rawPayload?.limits ||
      rawPayload?.metadata?.entitlements ||
      {};

    const boolFlag = (keys: string[], defaultVal: boolean): boolean => {
      for (const k of keys) {
        if (raw && typeof raw[k] === 'boolean') return raw[k];
      }
      return defaultVal;
    };

    const numVal = (keys: string[]): number | undefined => {
      for (const k of keys) {
        const v = raw?.[k] ?? rawPayload?.limits?.[k];
        if (typeof v === 'number' && Number.isFinite(v) && v > 0) return Math.floor(v);
      }
      return undefined;
    };

    return {
      usageAnalytics: boolFlag(['usage_analytics', 'usageAnalytics', 'analytics', 'usage_history'], true),
      tokenHistory: boolFlag(['token_history', 'tokenHistory', 'usage_history', 'analytics'], true),
      customModels: boolFlag(['custom_models', 'customModels'], true),
      dailyChatLimit: numVal(['daily_chat_limit', 'dailyChatLimit', 'chat_limit', 'requests_per_day']),
      dailyTokenLimit: numVal(['daily_token_limit', 'dailyTokenLimit', 'token_limit', 'tokens_per_day']),
      raw: typeof raw === 'object' && raw !== null ? raw : {},
    };
  }

  private getFreeEntitlements(): LicenseEntitlements {
    return {
      usageAnalytics: false,
      tokenHistory: false,
      customModels: true,
    };
  }

  private mapRemoteStatus(rawStatus: string | undefined): LicenseStatusType {
    const s = (rawStatus || '').toLowerCase().trim();
    if (s === 'active' || s === 'activated' || s === 'valid') return 'active';
    if (s === 'expired') return 'expired';
    if (s === 'revoked' || s === 'suspended' || s === 'disabled' || s === 'cancelled') return 'revoked';
    if (s === 'invalid' || s === 'not_found') return 'invalid';
    return 'error';
  }

  private async callKeygate(
    endpoint: '/api/v1/license/activate' | '/api/v1/license/verify' | '/api/v1/license/deactivate',
    licenseKey: string
  ): Promise<KeygateApiResult> {
    const baseUrl = this.getBaseUrl();
    const urlCheck = this.validateKeygateUrl(baseUrl);
    if (!urlCheck.valid) {
      return {
        ok: false,
        errorCode: 'KEYGATE_NOT_CONFIGURED',
        errorMessage: urlCheck.reason || 'Keygate server is not configured.',
      };
    }

    const identifier = dbManager.getInstanceId();
    const productId = this.getProductId();
    const apiSecret = this.getApiSecret();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (apiSecret) {
      headers['Authorization'] = `Bearer ${apiSecret}`;
      headers['X-API-Secret'] = apiSecret;
    }

    const body: Record<string, any> = {
      license_key: licenseKey.trim(),
      identifier,
    };
    if (productId) {
      body.product_id = productId;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const targetUrl = new URL(endpoint, `${baseUrl}/`);
      if (targetUrl.protocol !== 'https:' || targetUrl.hostname.toLowerCase() !== ALLOWED_KEYGATE_HOSTNAME) {
        return {
          ok: false,
          errorCode: 'KEYGATE_NOT_CONFIGURED',
          errorMessage: 'Keygate target URL failed strict HTTPS/hostname validation.',
        };
      }

      const response = await fetch(targetUrl.toString(), {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        redirect: 'manual',
        signal: controller.signal,
      });

      // Strictly disallow HTTP redirects to prevent redirection to untrusted hosts
      if (response.status >= 300 && response.status < 400) {
        return {
          ok: false,
          networkError: true,
          statusCode: response.status,
          errorCode: 'KEYGATE_REDIRECT_BLOCKED',
          errorMessage: 'Keygate server attempted a redirect, which is disallowed for security.',
        };
      }

      const rawText = await response.text();
      let json: any = {};
      try {
        json = rawText ? JSON.parse(rawText) : {};
      } catch {
        json = {};
      }

      const data = json?.data && typeof json.data === 'object' ? json.data : json;

      if (!response.ok || json?.success === false) {
        const msg =
          json?.error?.message ||
          json?.message ||
          json?.error ||
          data?.message ||
          `Keygate verification failed (HTTP ${response.status})`;
        const mappedStatus = this.mapRemoteStatus(data?.status || json?.status || (response.status === 404 ? 'invalid' : ''));
        const statusLower = String(msg).toLowerCase();
        const finalStatus: LicenseStatusType =
          mappedStatus !== 'error'
            ? mappedStatus
            : statusLower.includes('expir')
            ? 'expired'
            : statusLower.includes('revok') || statusLower.includes('suspend')
            ? 'revoked'
            : response.status === 400 || response.status === 401 || response.status === 403 || response.status === 404
            ? 'invalid'
            : 'error';

        return {
          ok: false,
          statusCode: response.status,
          licenseStatus: finalStatus,
          errorCode:
            finalStatus === 'expired'
              ? 'LICENSE_EXPIRED'
              : finalStatus === 'revoked'
              ? 'LICENSE_REVOKED'
              : finalStatus === 'invalid'
              ? 'LICENSE_INVALID'
              : 'KEYGATE_ERROR',
          errorMessage: typeof msg === 'string' ? msg : 'License verification failed.',
        };
      }

      const licenseStatus = this.mapRemoteStatus(data?.status || (data?.valid === true ? 'active' : 'active'));
      const remoteProductId = String(data?.product_id || json?.product_id || productId || '');
      if (productId && remoteProductId && remoteProductId !== productId) {
        return {
          ok: false,
          licenseStatus: 'invalid',
          errorCode: 'LICENSE_PRODUCT_MISMATCH',
          errorMessage: 'License key does not belong to this product.',
        };
      }

      const expiresAt = data?.expires_at || json?.expires_at || null;
      if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
        return {
          ok: false,
          licenseStatus: 'expired',
          errorCode: 'LICENSE_EXPIRED',
          errorMessage: 'License key has expired.',
          expiresAt,
        };
      }

      return {
        ok: licenseStatus === 'active',
        licenseStatus,
        productId: remoteProductId,
        productName: String(data?.product_name || json?.product_name || 'ChatAI'),
        planName: String(data?.plan_name || json?.plan_name || 'Community'),
        expiresAt,
        graceDays: Number(data?.grace_days || 0),
        token: String(data?.token || ''),
        entitlements: this.parseEntitlements(data),
        errorCode:
          licenseStatus === 'expired'
            ? 'LICENSE_EXPIRED'
            : licenseStatus === 'revoked'
            ? 'LICENSE_REVOKED'
            : licenseStatus === 'active'
            ? undefined
            : 'LICENSE_INVALID',
        errorMessage:
          licenseStatus === 'active'
            ? undefined
            : `License status is ${licenseStatus}.`,
      };
    } catch (err: any) {
      return {
        ok: false,
        networkError: true,
        errorCode: 'KEYGATE_UNREACHABLE',
        errorMessage: err?.name === 'AbortError'
          ? 'Connection to Keygate license server timed out.'
          : (err?.message || 'Unable to reach Keygate license server.'),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private rowToPublic(row: DbLicenseState, effectivePlan: PlanTier, usingCached: boolean): PublicLicenseInfo {
    let parsedEntitlements: LicenseEntitlements = this.getFreeEntitlements();
    if (effectivePlan === 'community') {
      try {
        const raw = JSON.parse(row.entitlements_json || '{}');
        parsedEntitlements = {
          usageAnalytics: typeof raw.usageAnalytics === 'boolean' ? raw.usageAnalytics : true,
          tokenHistory: typeof raw.tokenHistory === 'boolean' ? raw.tokenHistory : true,
          customModels: typeof raw.customModels === 'boolean' ? raw.customModels : true,
          dailyChatLimit: raw.dailyChatLimit,
          dailyTokenLimit: raw.dailyTokenLimit,
          raw: raw.raw,
        };
      } catch {
        parsedEntitlements = { usageAnalytics: true, tokenHistory: true, customModels: true };
      }
    }

    return {
      plan: effectivePlan,
      status: effectivePlan === 'community' ? 'active' : row.status,
      maskedKey: row.masked_key || '',
      productId: row.product_id || this.getProductId(),
      productName: row.product_name || (effectivePlan === 'community' ? 'ChatAI Community' : 'ChatAI Free'),
      planName: effectivePlan === 'community' ? 'Community' : 'Free',
      entitlements: parsedEntitlements,
      activatedAt: row.activated_at || null,
      expiresAt: row.expires_at || null,
      lastVerifiedAt: row.last_verified_at || null,
      cacheExpiresAt: row.cache_expires_at || null,
      graceDays: row.grace_days || 0,
      lastError: row.last_error || null,
      keygateConfigured: this.isKeygateConfigured(),
      usingCachedVerification: usingCached,
    };
  }

  /**
   * Determines the authoritative license state on the server.
   * Revalidates against Keygate when validation interval has elapsed.
   * Never grants Community when unverified, expired, revoked, or cache TTL has expired.
   */
  public async getEffectiveLicenseState(forceRevalidate: boolean = false): Promise<PublicLicenseInfo> {
    const row = dbManager.getLicenseRow();

    if (row.plan !== 'community' || row.status !== 'active' || !row.encrypted_key) {
      return this.rowToPublic(row, 'free', false);
    }

    const nowMs = Date.now();
    // Check explicit expiration timestamp
    if (row.expires_at && new Date(row.expires_at).getTime() <= nowMs) {
      const updated = dbManager.saveLicenseState({
        plan: 'free',
        status: 'expired',
        planName: 'Free',
        entitlements: this.getFreeEntitlements(),
        lastError: 'License has expired.',
      });
      return this.rowToPublic(updated, 'free', false);
    }

    const cacheExpiresMs = row.cache_expires_at ? new Date(row.cache_expires_at).getTime() : 0;
    const lastVerifiedMs = row.last_verified_at ? new Date(row.last_verified_at).getTime() : 0;
    const validationIntervalMs = this.getValidationIntervalSec() * 1000;

    const cacheStillValid = cacheExpiresMs > nowMs;
    const needsRevalidation = forceRevalidate || !lastVerifiedMs || (nowMs - lastVerifiedMs >= validationIntervalMs);

    if (!needsRevalidation && cacheStillValid) {
      return this.rowToPublic(row, 'community', true);
    }

    // Check master key availability before attempting decryption; do NOT clear encrypted_key if key is missing
    const keyDiag = dbManager.getMasterKeyStatus();
    if (keyDiag.status !== 'ready') {
      return {
        ...this.rowToPublic(row, 'free', false),
        status: 'error',
        lastError: keyDiag.errorMessage || 'Master encryption key is unavailable.',
      };
    }

    // Attempt online revalidation with Keygate
    const rawKey = dbManager.getDecryptedLicenseKey();
    if (!rawKey) {
      const updated = dbManager.saveLicenseState({
        plan: 'free',
        status: 'error',
        planName: 'Free',
        entitlements: this.getFreeEntitlements(),
        lastError: 'Unable to decrypt stored license key.',
      });
      return this.rowToPublic(updated, 'free', false);
    }

    const verifyResult = await this.callKeygate('/api/v1/license/verify', rawKey);
    if (verifyResult.ok) {
      const ttlMs = this.getCacheTtlSec() * 1000;
      const nowIso = new Date().toISOString();
      const nextCacheExp = new Date(Date.now() + ttlMs).toISOString();
      const updated = dbManager.saveLicenseState({
        plan: 'community',
        status: 'active',
        productId: verifyResult.productId || row.product_id,
        productName: verifyResult.productName || row.product_name,
        planName: 'Community',
        entitlements: verifyResult.entitlements || { usageAnalytics: true, tokenHistory: true, customModels: true },
        expiresAt: verifyResult.expiresAt ?? row.expires_at,
        lastVerifiedAt: nowIso,
        cacheExpiresAt: nextCacheExp,
        graceDays: verifyResult.graceDays ?? row.grace_days,
        offlineToken: verifyResult.token || row.offline_token,
        lastError: null,
      });
      return this.rowToPublic(updated, 'community', false);
    }

    // Network/Keygate error: only allow Community within safe cache TTL
    if (verifyResult.networkError && cacheStillValid) {
      const updated = dbManager.saveLicenseState({
        lastError: verifyResult.errorMessage || 'Keygate temporarily unreachable; using cached verification.',
      });
      return this.rowToPublic(updated, 'community', true);
    }

    // Expired, revoked, invalid, or cache expired while Keygate is offline -> downgrade to Free safely
    const nextStatus: LicenseStatusType =
      verifyResult.licenseStatus === 'expired' ||
      verifyResult.licenseStatus === 'revoked' ||
      verifyResult.licenseStatus === 'invalid'
        ? verifyResult.licenseStatus
        : 'error';

    const downgraded = dbManager.saveLicenseState({
      plan: 'free',
      status: nextStatus,
      planName: 'Free',
      entitlements: this.getFreeEntitlements(),
      lastError: verifyResult.errorMessage || 'License verification failed or cache expired.',
    });
    return this.rowToPublic(downgraded, 'free', false);
  }

  public async activateLicense(licenseKey: string): Promise<{
    ok: boolean;
    license: PublicLicenseInfo;
    errorCode?: string;
    errorMessage?: string;
  }> {
    const cleanKey = (licenseKey || '').trim();
    if (!cleanKey) {
      const current = await this.getEffectiveLicenseState(false);
      return {
        ok: false,
        license: current,
        errorCode: 'MISSING_LICENSE_KEY',
        errorMessage: 'Please enter a license key.',
      };
    }

    const result = await this.callKeygate('/api/v1/license/activate', cleanKey);
    if (!result.ok) {
      // Do NOT grant Community on failed activation or missing Keygate config.
      const existing = dbManager.getLicenseRow();
      const nextStatus: LicenseStatusType =
        result.licenseStatus || (existing.status === 'active' ? 'active' : 'invalid');
      if (existing.plan !== 'community' || nextStatus === 'expired' || nextStatus === 'revoked') {
        dbManager.saveLicenseState({
          plan: 'free',
          status: nextStatus,
          planName: 'Free',
          entitlements: this.getFreeEntitlements(),
          lastError: result.errorMessage || 'Activation failed.',
        });
      }
      const current = await this.getEffectiveLicenseState(false);
      return {
        ok: false,
        license: current,
        errorCode: result.errorCode || 'LICENSE_INVALID',
        errorMessage: result.errorMessage || 'License activation failed.',
      };
    }

    const nowIso = new Date().toISOString();
    const cacheExp = new Date(Date.now() + this.getCacheTtlSec() * 1000).toISOString();

    const saved = dbManager.saveLicenseState({
      plan: 'community',
      status: 'active',
      rawKey: cleanKey,
      productId: result.productId || this.getProductId(),
      productName: result.productName || 'ChatAI Community',
      planName: 'Community',
      entitlements: result.entitlements || { usageAnalytics: true, tokenHistory: true, customModels: true },
      activatedAt: nowIso,
      expiresAt: result.expiresAt || null,
      lastVerifiedAt: nowIso,
      cacheExpiresAt: cacheExp,
      graceDays: result.graceDays || 0,
      offlineToken: result.token || '',
      lastError: null,
    });

    dbManager.setUserSettings({ welcome_dismissed: 'true' });

    return {
      ok: true,
      license: this.rowToPublic(saved, 'community', false),
    };
  }

  public async verifyLicense(licenseKey?: string): Promise<{
    ok: boolean;
    license: PublicLicenseInfo;
    errorCode?: string;
    errorMessage?: string;
  }> {
    const cleanKey = (licenseKey || '').trim() || dbManager.getDecryptedLicenseKey();
    if (!cleanKey) {
      const current = await this.getEffectiveLicenseState(false);
      return {
        ok: false,
        license: current,
        errorCode: 'MISSING_LICENSE_KEY',
        errorMessage: 'No license key provided to verify.',
      };
    }

    const result = await this.callKeygate('/api/v1/license/verify', cleanKey);
    if (!result.ok) {
      const nextStatus: LicenseStatusType = result.licenseStatus || 'invalid';
      if (nextStatus === 'expired' || nextStatus === 'revoked' || nextStatus === 'invalid') {
        dbManager.saveLicenseState({
          plan: 'free',
          status: nextStatus,
          planName: 'Free',
          entitlements: this.getFreeEntitlements(),
          lastError: result.errorMessage || 'License verification failed.',
        });
      }
      const current = await this.getEffectiveLicenseState(false);
      return {
        ok: false,
        license: current,
        errorCode: result.errorCode || 'LICENSE_INVALID',
        errorMessage: result.errorMessage || 'License verification failed.',
      };
    }

    // Only mark Community active if verified key matches stored key or user just verified a valid key
    const existing = dbManager.getLicenseRow();
    const nowIso = new Date().toISOString();
    const cacheExp = new Date(Date.now() + this.getCacheTtlSec() * 1000).toISOString();

    const saved = dbManager.saveLicenseState({
      plan: 'community',
      status: 'active',
      rawKey: cleanKey,
      productId: result.productId || existing.product_id || this.getProductId(),
      productName: result.productName || existing.product_name || 'ChatAI Community',
      planName: 'Community',
      entitlements: result.entitlements || { usageAnalytics: true, tokenHistory: true, customModels: true },
      activatedAt: existing.activated_at || nowIso,
      expiresAt: result.expiresAt ?? existing.expires_at,
      lastVerifiedAt: nowIso,
      cacheExpiresAt: cacheExp,
      graceDays: result.graceDays ?? existing.grace_days,
      offlineToken: result.token || existing.offline_token,
      lastError: null,
    });

    return {
      ok: true,
      license: this.rowToPublic(saved, 'community', false),
    };
  }

  public async deactivateLicense(): Promise<{
    ok: boolean;
    license: PublicLicenseInfo;
    warning?: string;
  }> {
    const rawKey = dbManager.getDecryptedLicenseKey();
    let warning: string | undefined;

    if (rawKey && this.isKeygateConfigured()) {
      const res = await this.callKeygate('/api/v1/license/deactivate', rawKey);
      if (!res.ok) {
        warning = res.errorMessage || 'Could not reach Keygate during deactivation; cleared local license state.';
      }
    }

    // Downgrade cleanly to Free without touching chats or provider configs
    const saved = dbManager.saveLicenseState({
      plan: 'free',
      status: 'not_activated',
      clearKey: true,
      productId: '',
      productName: '',
      planName: 'Free',
      entitlements: this.getFreeEntitlements(),
      activatedAt: null,
      expiresAt: null,
      lastVerifiedAt: null,
      cacheExpiresAt: null,
      graceDays: 0,
      offlineToken: '',
      lastError: null,
    });

    return {
      ok: true,
      license: this.rowToPublic(saved, 'free', false),
      warning,
    };
  }
}

export const licenseService = new LicenseService();
