import express, { NextFunction, Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { dbManager, ApiProviderType } from './server/db.ts';
import { signSessionToken, verifySessionToken } from './server/crypto.ts';
import { licenseService } from './server/keygate.ts';
import { quotaService } from './server/quota.ts';

dotenv.config();

// Initialize SQLite database on startup
await dbManager.init();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

function resolvePort(): number {
  const args = process.argv;
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--port' || args[i] === '-p') && args[i + 1]) {
      const p = Number(args[i + 1]);
      if (!isNaN(p) && p > 0) return p;
    }
    if (args[i].startsWith('--port=')) {
      const p = Number(args[i].split('=')[1]);
      if (!isNaN(p) && p > 0) return p;
    }
  }

  if (process.env.PORT) {
    const p = Number(process.env.PORT);
    if (!isNaN(p) && p > 0) return p;
  }

  return 8088;
}

const PRIMARY_PORT = resolvePort();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1';
const DEFAULT_9ROUTER_BASE_URL = process.env.NINEROUTER_BASE_URL || 'http://localhost/v1';

// ==================== SECURITY: RATE LIMITER ====================

interface RateLimitBucket {
  timestamps: number[];
}

const rateBuckets = new Map<string, RateLimitBucket>();

function createRateLimiter(bucketPrefix: string, maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${bucketPrefix}:${clientIp}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key) || { timestamps: [] };
    bucket.timestamps = bucket.timestamps.filter((ts) => now - ts < windowMs);

    if (bucket.timestamps.length >= maxRequests) {
      return res.status(429).json({
        ok: false,
        errorCode: 'RATE_LIMITED',
        error: 'Too many requests. Please wait a moment before trying again.',
      });
    }

    bucket.timestamps.push(now);
    rateBuckets.set(key, bucket);
    next();
  };
}

const licenseRateLimit = createRateLimiter('license', 20, 60_000);
const verifyRateLimit = createRateLimiter('verify', 40, 60_000);
const chatRateLimit = createRateLimiter('chat', 60, 60_000);
const securityRateLimit = createRateLimiter('security', 15, 60_000);

// ==================== SECURITY: URL & PATH VALIDATION ====================

function validateExternalProviderUrl(rawUrl: string): { valid: boolean; normalized: string; error?: string } {
  const trimmed = (rawUrl || '').replace(/\s+/g, '');
  if (!trimmed) return { valid: true, normalized: '' };

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, normalized: '', error: 'URL must use http:// or https:// protocol.' };
    }
    if (parsed.username || parsed.password) {
      return { valid: false, normalized: '', error: 'Credentials are not allowed in provider URLs.' };
    }
    const host = parsed.hostname.toLowerCase();
    // Block unspecified and cloud instance metadata endpoints (SSRF protection)
    if (
      host === '0.0.0.0' ||
      host === '169.254.169.254' ||
      host.startsWith('169.254.') ||
      host === 'metadata.google.internal' ||
      host === 'metadata.goog' ||
      host === 'fd00:ec2::254' ||
      host === '[fd00:ec2::254]'
    ) {
      return { valid: false, normalized: '', error: 'Metadata and unspecified host addresses are not allowed.' };
    }
    return { valid: true, normalized: trimmed.replace(/\/+$/, '') };
  } catch {
    return { valid: false, normalized: '', error: 'Invalid URL format.' };
  }
}

function sanitizeApiKey(raw?: string): string {
  if (!raw || typeof raw !== 'string') return '';
  let cleaned = raw
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\r\n\t]+/g, '')
    .trim();
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"') && cleaned.length >= 2) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'") && cleaned.length >= 2)
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  if (/^bearer\s+/i.test(cleaned)) {
    cleaned = cleaned.replace(/^bearer\s+/i, '').trim();
  }
  return cleaned;
}

function validateCustomEndpointPath(rawEndpoint: string): { valid: boolean; normalized: string; error?: string } {
  const compact = (rawEndpoint || '').replace(/[\u200B-\u200D\uFEFF\s]+/g, '');
  if (!compact) return { valid: true, normalized: '' };
  if (compact.includes('://') || compact.includes('@') || compact.includes('\\') || compact.includes('..')) {
    return { valid: false, normalized: '', error: 'Invalid API endpoint path.' };
  }
  const collapsed = compact.replace(/\/{2,}/g, '/').replace(/\/+$/, '');
  if (!collapsed) return { valid: true, normalized: '' };
  const normalized = collapsed.startsWith('/') ? collapsed : `/${collapsed}`;
  return { valid: true, normalized };
}

function isBaseVersionPrefix(segmentPath: string): boolean {
  return /^(\/api)?(\/openai)?(\/v\d+(?:alpha|beta)?|\/api)$/i.test(segmentPath);
}

function resolveProviderUrlAndEndpoint(
  provider: ApiProviderType,
  rawBaseUrl: string,
  rawEndpointPath: string,
  defaultEndpointPath: string
): { modelsBase: string; chatUrl: string; endpointPath: string } {
  let cleanBase =
    getTargetBaseUrl(provider, rawBaseUrl) ||
    (provider === '9router'
      ? DEFAULT_9ROUTER_BASE_URL
      : provider === 'claude'
      ? DEFAULT_ANTHROPIC_BASE_URL
      : DEFAULT_OPENAI_BASE_URL);

  cleanBase = cleanBase.replace(/\/+$/, '');

  // Extract leaf endpoint if user pasted full chat path inside Base URL
  let baseLeafEndpoint = '';
  for (const leaf of ['/chat/completions', '/messages', '/responses']) {
    if (cleanBase.toLowerCase().endsWith(leaf)) {
      baseLeafEndpoint = cleanBase.slice(cleanBase.length - leaf.length);
      cleanBase = cleanBase.slice(0, cleanBase.length - leaf.length);
      break;
    }
  }

  let endpointPath = (rawEndpointPath || '')
    .replace(/[\u200B-\u200D\uFEFF\s]+/g, '')
    .replace(/\/{2,}/g, '/')
    .replace(/\/+$/, '');

  if (!endpointPath) {
    const finalLeaf = baseLeafEndpoint || defaultEndpointPath;
    return {
      modelsBase: cleanBase,
      chatUrl: `${cleanBase}${finalLeaf}`,
      endpointPath: finalLeaf,
    };
  }

  endpointPath = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;

  // Avoid duplicate version prefix when Base URL already ends with the same prefix (e.g. .../v1 + /v1 or /v1/chat/completions)
  for (const prefix of ['/openai/v1', '/api/v1', '/v1beta', '/v1', '/v2', '/api']) {
    if (cleanBase.toLowerCase().endsWith(prefix)) {
      if (endpointPath.toLowerCase() === prefix) {
        endpointPath = '';
        break;
      }
      if (endpointPath.toLowerCase().startsWith(`${prefix}/`)) {
        endpointPath = endpointPath.slice(prefix.length);
        break;
      }
    }
  }

  // If user put a version/API prefix (e.g. "/v1") into Endpoint Path, append default leaf path (e.g. "/chat/completions")
  if (!endpointPath || isBaseVersionPrefix(endpointPath)) {
    const modelsBase = endpointPath ? `${cleanBase}${endpointPath}` : cleanBase;
    const finalLeaf = baseLeafEndpoint || defaultEndpointPath;
    return {
      modelsBase,
      chatUrl: `${modelsBase}${finalLeaf}`,
      endpointPath: `${endpointPath}${finalLeaf}`,
    };
  }

  const chatUrl = `${cleanBase}${endpointPath}`;
  let modelsBase = cleanBase;
  for (const leaf of ['/chat/completions', '/messages', '/responses', '/chat']) {
    if (endpointPath.toLowerCase().endsWith(leaf)) {
      const prefixBeforeLeaf = endpointPath.slice(0, endpointPath.length - leaf.length);
      modelsBase = prefixBeforeLeaf ? `${cleanBase}${prefixBeforeLeaf}` : cleanBase;
      break;
    }
  }

  return {
    modelsBase,
    chatUrl,
    endpointPath,
  };
}

function safeUrlForLog(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    return `${u.origin}${u.pathname}`;
  } catch {
    return '[invalid-url]';
  }
}

function resolveGoogleBaseUrl(rawBaseUrl?: string): string {
  const clean = (rawBaseUrl || '').trim().replace(/\/+$/, '');
  if (!clean) return 'https://generativelanguage.googleapis.com';
  return clean.replace(/\/v1beta$/i, '').replace(/\/v1$/i, '');
}

function classifyMasterKeyError(error: any): {
  isMasterKeyError: boolean;
  statusCode: number;
  errorCode: string;
  message: string;
} {
  const code = String(error?.code || '');
  const msg = String(error?.message || '');
  if (
    code === 'MASTER_KEY_MISSING' ||
    code === 'MASTER_KEY_CORRUPTED' ||
    code === 'MASTER_KEY_MISMATCH' ||
    code === 'MASTER_KEY_UNAVAILABLE' ||
    code === 'MASTER_KEY_UNREADABLE' ||
    code === 'MASTER_KEY_INVALID_TYPE' ||
    code === 'KEY_VERSION_NOT_FOUND'
  ) {
    return {
      isMasterKeyError: true,
      statusCode: 503,
      errorCode: code === 'MASTER_KEY_UNAVAILABLE' ? 'MASTER_KEY_MISSING' : code,
      message: msg || 'Master encryption key is unavailable. Restore master.key from backup.',
    };
  }
  if (
    msg.toLowerCase().includes('unable to authenticate data') ||
    msg.toLowerCase().includes('unsupported state') ||
    msg.toLowerCase().includes('corrupted encrypted payload')
  ) {
    return {
      isMasterKeyError: true,
      statusCode: 503,
      errorCode: 'API_KEY_DECRYPTION_FAILED',
      message: 'Failed to decrypt stored API key (cipher tampered or key mismatch).',
    };
  }
  return {
    isMasterKeyError: false,
    statusCode: 500,
    errorCode: 'INTERNAL_ERROR',
    message: msg || 'Internal server error.',
  };
}

// ==================== SECURITY: SESSION AUTH ====================

interface AuthenticatedRequest extends Request {
  sessionId?: string;
}

function requireSession(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const verified = verifySessionToken(token);

  if (!verified) {
    return res.status(401).json({
      ok: false,
      errorCode: 'UNAUTHORIZED_SESSION',
      error: 'Valid session token is required.',
    });
  }

  const sessionRow = dbManager.getSession(verified.sid);
  if (!sessionRow) {
    return res.status(401).json({
      ok: false,
      errorCode: 'SESSION_EXPIRED',
      error: 'Session not found or expired. Please refresh the session.',
    });
  }

  dbManager.touchSession(verified.sid);
  req.sessionId = verified.sid;
  next();
}

async function requireCommunityAnalytics(req: Request, res: Response, next: NextFunction) {
  try {
    const license = await licenseService.getEffectiveLicenseState(false);
    if (
      license.plan !== 'community' ||
      !license.entitlements.usageAnalytics ||
      !license.entitlements.tokenHistory
    ) {
      return res.status(403).json({
        ok: false,
        errorCode: 'FEATURE_LOCKED_FREE',
        plan: license.plan,
        error: 'Token Usage History & Analytics are only available on an active Community license.',
      });
    }
    next();
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'License check failed.' });
  }
}

// ==================== AI CLIENT HELPERS ====================

function getGoogleAIClient(customApiKey?: string, customBaseUrl?: string): GoogleGenAI {
  const apiKey = customApiKey ? sanitizeApiKey(customApiKey) : sanitizeApiKey(process.env.GEMINI_API_KEY);

  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    const err: any = new Error('No API Key provided. Please enter a valid API Key to proceed.');
    err.code = 'MISSING_API_KEY';
    throw err;
  }

  const httpOptions: any = {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  };
  if (customBaseUrl && customBaseUrl.trim()) {
    httpOptions.baseUrl = resolveGoogleBaseUrl(customBaseUrl);
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions,
  });
}

function isExplicitApiKeyErrorMessage(rawMsg: string): boolean {
  return (
    rawMsg.includes('api_key_invalid') ||
    rawMsg.includes('api key not valid') ||
    rawMsg.includes('api key expired') ||
    rawMsg.includes('invalid_api_key') ||
    rawMsg.includes('invalid x-api-key') ||
    rawMsg.includes('key has expired') ||
    rawMsg.includes('invalid api key') ||
    rawMsg.includes('incorrect api key') ||
    rawMsg.includes('authentication_error') ||
    rawMsg.includes('unauthenticated') ||
    rawMsg.includes('unauthorized') ||
    rawMsg.includes('invalid token') ||
    rawMsg.includes('api key is required') ||
    rawMsg.includes('missing bearer')
  );
}

function classifyError(error: any): { isApiKeyError: boolean; errorCode: string; friendlyMessage: string } {
  const rawMessageText = String(error?.message || '').trim();
  const rawMsg = rawMessageText.toLowerCase();
  const status = error?.status || error?.statusCode;

  if (
    isExplicitApiKeyErrorMessage(rawMsg) ||
    status === 401 ||
    (status === 403 && !rawMsg.includes('quota') && !rawMsg.includes('region') && !rawMsg.includes('country') && !rawMsg.includes('model'))
  ) {
    return {
      isApiKeyError: true,
      errorCode: 'API_KEY_INVALID',
      friendlyMessage: 'Invalid or expired API key. Please check your provider settings.',
    };
  }

  if (rawMsg.includes('resource_exhausted') || rawMsg.includes('quota') || rawMsg.includes('rate limit') || status === 429) {
    return {
      isApiKeyError: false,
      errorCode: 'PROVIDER_QUOTA_EXHAUSTED',
      friendlyMessage: rawMessageText || 'Provider API key rate limit or quota exceeded.',
    };
  }

  if (
    status === 404 ||
    (rawMsg.includes('not_found') && rawMsg.includes('model')) ||
    rawMsg.includes('model not found') ||
    rawMsg.includes('does not exist') ||
    rawMsg.includes('no longer available')
  ) {
    return {
      isApiKeyError: false,
      errorCode: 'MODEL_NOT_FOUND',
      friendlyMessage: rawMessageText || 'Selected AI model is unavailable or not found.',
    };
  }

  if (status === 400 || status === 422) {
    return {
      isApiKeyError: false,
      errorCode: 'PROVIDER_REQUEST_ERROR',
      friendlyMessage: rawMessageText || 'Provider rejected request parameters or selected model.',
    };
  }

  return {
    isApiKeyError: false,
    errorCode: 'PROVIDER_CONNECTION_ERROR',
    friendlyMessage: rawMessageText || 'Failed to connect to AI provider.',
  };
}

function getTargetBaseUrl(provider: string, baseUrl?: string): string {
  if (baseUrl && baseUrl.trim().length > 0) {
    return baseUrl.trim().replace(/\/+$/, '');
  }
  if (provider === 'openai') return DEFAULT_OPENAI_BASE_URL;
  if (provider === 'claude') return DEFAULT_ANTHROPIC_BASE_URL;
  if (provider === '9router') return DEFAULT_9ROUTER_BASE_URL;
  return '';
}

function estimateTextTokens(text: string): number {
  if (!text) return 0;
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  const hasCode = trimmed.includes('```') || trimmed.includes('{') || trimmed.includes('function') || trimmed.includes('const ');
  const vietnameseRegex = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
  const isVietnamese = vietnameseRegex.test(trimmed);

  if (hasCode) {
    return Math.max(1, Math.ceil(trimmed.length / 3.2));
  } else if (isVietnamese) {
    const words = trimmed.split(/\s+/).filter(Boolean);
    return Math.max(1, Math.ceil(words.length * 1.35) + Math.ceil(trimmed.length / 10));
  } else {
    const words = trimmed.split(/\s+/).filter(Boolean);
    return Math.max(1, Math.ceil(words.length * 1.3));
  }
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 12000): Promise<globalThis.Response> {
  const controller = new AbortController();
  const externalSignal = init.signal;
  if (externalSignal?.aborted) {
    controller.abort(externalSignal.reason);
  }
  const onExternalAbort = () => controller.abort(externalSignal?.reason);
  externalSignal?.addEventListener('abort', onExternalAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

async function fetchWithSafeRedirects(
  url: string,
  init: RequestInit = {},
  timeoutMs = 15000,
  maxRedirects = 2
): Promise<globalThis.Response> {
  let currentUrl = url;
  let currentInit: RequestInit = { ...init, redirect: 'manual' };

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const res = await fetchWithTimeout(currentUrl, currentInit, timeoutMs);
    if (res.status < 300 || res.status >= 400) {
      return res;
    }

    const location = res.headers.get('location');
    if (!location) {
      return res;
    }

    let nextUrl = '';
    try {
      nextUrl = new URL(location, currentUrl).toString();
    } catch {
      const err: any = new Error('Provider returned an invalid redirect location.');
      err.code = 'REDIRECT_BLOCKED';
      throw err;
    }

    const check = validateExternalProviderUrl(nextUrl);
    if (!check.valid) {
      const err: any = new Error(check.error || 'Redirect target blocked by security policy.');
      err.code = 'REDIRECT_BLOCKED';
      throw err;
    }

    currentUrl = nextUrl;
    if (res.status !== 307 && res.status !== 308 && currentInit.method && currentInit.method !== 'GET' && currentInit.method !== 'HEAD') {
      currentInit = { ...currentInit, method: 'GET', body: undefined };
    }
  }

  const err: any = new Error('Too many HTTP redirects from AI provider.');
  err.code = 'REDIRECT_BLOCKED';
  throw err;
}

function parseProviderErrorBody(rawText: string): string {
  if (!rawText) return '';
  try {
    const parsed = JSON.parse(rawText);
    return String(parsed?.error?.message || parsed?.message || parsed?.detail || rawText);
  } catch {
    return rawText;
  }
}

async function testProviderCredentials(params: {
  provider: ApiProviderType;
  apiKey: string;
  baseUrl?: string;
  apiEndpoint?: string;
  providerId?: string;
}): Promise<{ ok: boolean; count?: number; errorType?: string; error?: string; message?: string }> {
  const keyToTest = sanitizeApiKey(params.apiKey);
  if (!keyToTest) {
    return {
      ok: false,
      errorType: 'INVALID_OR_EXPIRED_KEY',
      error: 'Please enter an API Key to test the connection.',
    };
  }

  const urlValidation = validateExternalProviderUrl(params.baseUrl || '');
  if (!urlValidation.valid) {
    return {
      ok: false,
      errorType: 'INVALID_URL',
      error: urlValidation.error || 'Invalid Base URL.',
    };
  }

  const endpointValidation = validateCustomEndpointPath(params.apiEndpoint || '');
  if (!endpointValidation.valid) {
    return {
      ok: false,
      errorType: 'INVALID_URL',
      error: endpointValidation.error || 'Invalid API endpoint path.',
    };
  }

  try {
    if (params.provider === 'google') {
      const googleBase = resolveGoogleBaseUrl(urlValidation.normalized);
      const googleUrl = `${googleBase}/v1beta/models?key=${encodeURIComponent(keyToTest)}`;
      const response = await fetchWithSafeRedirects(googleUrl);
      if (response.status >= 300 && response.status < 400) {
        return { ok: false, errorType: 'REDIRECT_BLOCKED', error: 'Redirects are disallowed for security.' };
      }
      if (response.ok) {
        const data = await response.json();
        const count = Array.isArray(data?.models) ? data.models.length : 0;
        return {
          ok: true,
          count,
          message: `Connected to Google AI Studio (${count} models available).`,
        };
      }
      const errMsg = parseProviderErrorBody(await response.text());
      const isAuthErr =
        response.status === 401 ||
        response.status === 403 ||
        isExplicitApiKeyErrorMessage(errMsg.toLowerCase());
      return {
        ok: false,
        errorType: isAuthErr ? 'INVALID_OR_EXPIRED_KEY' : 'GENERAL_ERROR',
        error: errMsg ? `${errMsg.slice(0, 140)} (HTTP ${response.status})` : `Google AI connection failed (HTTP ${response.status}).`,
      };
    }

    if (params.provider === 'claude') {
      const { modelsBase, chatUrl } = resolveProviderUrlAndEndpoint(
        'claude',
        urlValidation.normalized,
        endpointValidation.normalized,
        '/messages'
      );
      let response = await fetchWithSafeRedirects(`${modelsBase}/models`, {
        headers: {
          'x-api-key': keyToTest,
          'anthropic-version': '2023-06-01',
        },
      });
      if (response.status === 404 && !modelsBase.endsWith('/v1') && !modelsBase.endsWith('/v1beta')) {
        const v1Res = await fetchWithSafeRedirects(`${modelsBase}/v1/models`, {
          headers: {
            'x-api-key': keyToTest,
            'anthropic-version': '2023-06-01',
          },
        });
        if (v1Res.ok || v1Res.status === 401) {
          response = v1Res;
        }
      }
      if (response.ok) {
        return {
          ok: true,
          message: 'Connected to Anthropic Claude successfully.',
        };
      }
      if (response.status === 400 || response.status === 403 || response.status === 404 || response.status === 405 || response.status === 501) {
        // Fallback probe on chat endpoint for Claude-compatible proxies without /models
        const probeRes = await fetchWithSafeRedirects(chatUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': keyToTest,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'hi' }],
          }),
        });
        const probeRawText = await probeRes.text();
        const probeBody = parseProviderErrorBody(probeRawText);
        if (probeRes.ok) {
          return { ok: true, message: 'Connected to Anthropic Claude endpoint successfully.' };
        }
        const isAuth =
          probeRes.status === 401 ||
          (probeRes.status === 403 && !probeBody.toLowerCase().includes('model')) ||
          isExplicitApiKeyErrorMessage(probeBody.toLowerCase());
        const looksJson = probeRawText.trim().startsWith('{');
        if (!isAuth && looksJson && (probeRes.status === 400 || probeRes.status === 404 || probeRes.status === 422)) {
          return {
            ok: true,
            message: 'API key authenticated with Claude endpoint. Select or add a model ID in AI Models.',
          };
        }
        return {
          ok: false,
          errorType: isAuth ? 'INVALID_OR_EXPIRED_KEY' : 'GENERAL_ERROR',
          error: `Anthropic Claude connection failed (HTTP ${probeRes.status}). ${probeBody.slice(0, 120)}`,
        };
      }
      const errText = parseProviderErrorBody(await response.text());
      const isAuth =
        response.status === 401 ||
        response.status === 403 ||
        isExplicitApiKeyErrorMessage(errText.toLowerCase());
      return {
        ok: false,
        errorType: isAuth ? 'INVALID_OR_EXPIRED_KEY' : 'GENERAL_ERROR',
        error: `Anthropic Claude connection failed (HTTP ${response.status}). ${errText.slice(0, 120)}`,
      };
    }

    const { modelsBase, chatUrl } = resolveProviderUrlAndEndpoint(
      params.provider,
      urlValidation.normalized,
      endpointValidation.normalized,
      '/chat/completions'
    );

    let response = await fetchWithSafeRedirects(`${modelsBase}/models`, {
      headers: {
        Authorization: `Bearer ${keyToTest}`,
      },
    });

    // Fallback to <baseUrl>/v1/models when user omitted /v1
    if ((response.status === 404 || response.status === 405) && !modelsBase.endsWith('/v1') && !modelsBase.endsWith('/v1beta')) {
      const v1Res = await fetchWithSafeRedirects(`${modelsBase}/v1/models`, {
        headers: {
          Authorization: `Bearer ${keyToTest}`,
        },
      });
      if (v1Res.ok || v1Res.status === 401 || v1Res.status === 403) {
        response = v1Res;
      }
    }

    if (response.ok) {
      const data = await response.json();
      const list = Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.models)
        ? data.models
        : Array.isArray(data)
        ? data
        : [];
      return {
        ok: true,
        count: list.length,
        message: `Connection succeeded (${list.length} models discovered).`,
      };
    }

    const modelsErrRaw = await response.text();
    const modelsErrText = parseProviderErrorBody(modelsErrRaw);

    if (response.status === 401 || (response.status === 403 && isExplicitApiKeyErrorMessage(modelsErrText.toLowerCase()))) {
      return {
        ok: false,
        errorType: 'INVALID_OR_EXPIRED_KEY',
        error: `Authentication failed (HTTP ${response.status}). ${modelsErrText.slice(0, 120)}`,
      };
    }

    // Some OpenAI-compatible gateways/proxies do not expose GET /models (return 400/403/404/405/501)
    if (
      response.status === 400 ||
      response.status === 403 ||
      response.status === 404 ||
      response.status === 405 ||
      response.status === 501
    ) {
      const customModels = params.providerId ? dbManager.listCustomModels(params.providerId) : [];
      const probeModel = customModels[0]?.model_id || 'gpt-4o-mini';
      const probeRes = await fetchWithSafeRedirects(chatUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${keyToTest}`,
        },
        body: JSON.stringify({
          model: probeModel,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1,
          stream: false,
        }),
      });

      if (probeRes.ok) {
        return {
          ok: true,
          message: 'Connected to chat completion endpoint successfully.',
        };
      }

      const probeBodyText = await probeRes.text();
      const probeErr = parseProviderErrorBody(probeBodyText);
      const isAuthErr =
        probeRes.status === 401 ||
        (probeRes.status === 403 && !probeErr.toLowerCase().includes('model') && !probeErr.toLowerCase().includes('quota')) ||
        isExplicitApiKeyErrorMessage(probeErr.toLowerCase());

      if (isAuthErr) {
        return {
          ok: false,
          errorType: 'INVALID_OR_EXPIRED_KEY',
          error: `Authentication failed (HTTP ${probeRes.status}). ${probeErr.slice(0, 120)}`,
        };
      }

      // If endpoint returned a structured JSON request/model error (not an HTML 404), key auth succeeded
      const looksJson = probeBodyText.trim().startsWith('{');
      if (looksJson && (probeRes.status === 400 || probeRes.status === 404 || probeRes.status === 422)) {
        return {
          ok: true,
          message: 'API key authenticated with endpoint. Add your model ID in the AI Models tab.',
        };
      }

      return {
        ok: false,
        errorType: 'GENERAL_ERROR',
        error: `Endpoint check failed (HTTP ${probeRes.status}). ${probeErr.slice(0, 120)}`,
      };
    }

    const isAuth = isExplicitApiKeyErrorMessage(modelsErrText.toLowerCase());
    return {
      ok: false,
      errorType: isAuth ? 'INVALID_OR_EXPIRED_KEY' : 'GENERAL_ERROR',
      error: `Provider connection failed (HTTP ${response.status}). ${modelsErrText.slice(0, 120)}`,
    };
  } catch (err: any) {
    if (err?.code === 'REDIRECT_BLOCKED') {
      return { ok: false, errorType: 'REDIRECT_BLOCKED', error: err.message };
    }
    return {
      ok: false,
      errorType: 'GENERAL_ERROR',
      error: err?.name === 'AbortError'
        ? 'Connection to AI provider timed out.'
        : (err?.message || 'Unable to connect to AI provider.'),
    };
  }
}

async function fetchProviderModelsList(params: {
  provider: ApiProviderType;
  apiKey: string;
  baseUrl?: string;
  apiEndpoint?: string;
}) {
  const activeKey = sanitizeApiKey(params.apiKey);
  if (!activeKey) {
    return { ok: true, models: [], count: 0 };
  }

  const urlValidation = validateExternalProviderUrl(params.baseUrl || '');
  if (!urlValidation.valid) {
    return { ok: false, models: [], error: urlValidation.error || 'Invalid Base URL.' };
  }

  const endpointValidation = validateCustomEndpointPath(params.apiEndpoint || '');
  if (!endpointValidation.valid) {
    return { ok: false, models: [], error: endpointValidation.error || 'Invalid API endpoint path.' };
  }

  try {
    if (params.provider === 'google') {
      const googleBase = resolveGoogleBaseUrl(urlValidation.normalized);
      const googleUrl = `${googleBase}/v1beta/models?key=${encodeURIComponent(activeKey)}`;
      const response = await fetchWithSafeRedirects(googleUrl);
      if (!response.ok) {
        const errMsg = parseProviderErrorBody(await response.text());
        return {
          ok: false,
          models: [],
          error: errMsg ? `${errMsg.slice(0, 140)} (HTTP ${response.status})` : `Google AI models fetch failed (HTTP ${response.status}).`,
        };
      }
      const data = await response.json();
      const rawList: any[] = Array.isArray(data?.models) ? data.models : [];
      const retiredModels = ['gemini-1.0-pro', 'gemini-pro', 'gemini-pro-vision'];
      const nonTextKeywords = ['tts', 'imagen', 'veo', 'embedding', 'transcribe', 'robotics', 'aqa', 'bisheng'];
      const supportedModels = rawList.filter((m: any) => {
        const id = (m.name || '').replace(/^models\//, '').toLowerCase();
        const methods: string[] = Array.isArray(m.supportedGenerationMethods) ? m.supportedGenerationMethods : [];
        if (!methods.includes('generateContent')) return false;
        if (retiredModels.includes(id)) return false;
        if (nonTextKeywords.some((kw) => id.includes(kw))) return false;
        return true;
      });

      const priorityOrder = [
        'gemini-2.5-flash',
        'gemini-2.5-pro',
        'gemini-2.5-flash-lite',
        'gemini-flash-latest',
        'gemini-pro-latest',
        'gemini-2.0-flash',
        'gemini-3',
      ];
      supportedModels.sort((a: any, b: any) => {
        const idA = (a.name || '').replace(/^models\//, '').toLowerCase();
        const idB = (b.name || '').replace(/^models\//, '').toLowerCase();
        const idxA = priorityOrder.findIndex((p) => idA.startsWith(p));
        const idxB = priorityOrder.findIndex((p) => idB.startsWith(p));
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return idA.localeCompare(idB);
      });

      const mapped = supportedModels.map((m: any) => {
        const id = (m.name || '').replace(/^models\//, '');
        return {
          id,
          name: m.displayName || id,
          badge: 'Google',
          description: m.description || `Google AI model: ${id}`,
          provider: 'google',
        };
      });

      return { ok: true, models: mapped, count: mapped.length };
    }

    if (params.provider === 'claude') {
      const { modelsBase } = resolveProviderUrlAndEndpoint(
        'claude',
        urlValidation.normalized,
        endpointValidation.normalized,
        '/messages'
      );
      let response = await fetchWithSafeRedirects(`${modelsBase}/models`, {
        headers: {
          'x-api-key': activeKey,
          'anthropic-version': '2023-06-01',
        },
      });
      if (response.status === 404 && !modelsBase.endsWith('/v1') && !modelsBase.endsWith('/v1beta')) {
        const v1Res = await fetchWithSafeRedirects(`${modelsBase}/v1/models`, {
          headers: {
            'x-api-key': activeKey,
            'anthropic-version': '2023-06-01',
          },
        });
        if (v1Res.ok) response = v1Res;
      }
      if (!response.ok) {
        const errMsg = parseProviderErrorBody(await response.text());
        return {
          ok: false,
          models: [],
          error: errMsg ? `${errMsg.slice(0, 140)} (HTTP ${response.status})` : `Unable to fetch Claude models (HTTP ${response.status}).`,
        };
      }
      const data = await response.json();
      const rawList: any[] = Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.models)
        ? data.models
        : [];
      const mapped = rawList.map((m: any) => ({
        id: m.id,
        name: m.display_name || m.id,
        badge: 'Claude',
        description: `Anthropic Claude: ${m.display_name || m.id}`,
        provider: 'claude',
      }));
      return { ok: true, models: mapped, count: mapped.length };
    }

    const { modelsBase } = resolveProviderUrlAndEndpoint(
      params.provider,
      urlValidation.normalized,
      endpointValidation.normalized,
      '/chat/completions'
    );

    let response = await fetchWithSafeRedirects(`${modelsBase}/models`, {
      headers: {
        Authorization: `Bearer ${activeKey}`,
      },
    });

    if ((response.status === 404 || response.status === 405) && !modelsBase.endsWith('/v1') && !modelsBase.endsWith('/v1beta')) {
      const v1Res = await fetchWithSafeRedirects(`${modelsBase}/v1/models`, {
        headers: {
          Authorization: `Bearer ${activeKey}`,
        },
      });
      if (v1Res.ok) {
        response = v1Res;
      }
    }

    if (!response.ok) {
      const errMsg = parseProviderErrorBody(await response.text());
      return {
        ok: false,
        models: [],
        error: errMsg
          ? `Unable to fetch models (HTTP ${response.status}): ${errMsg.slice(0, 120)}`
          : `Unable to fetch models from provider (HTTP ${response.status}).`,
      };
    }

    const data = await response.json();
    const rawList: any[] = Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data?.models)
      ? data.models
      : Array.isArray(data)
      ? data
      : [];
    let filteredList = rawList;

    if (params.provider === 'openai') {
      const nonChatKeywords = ['whisper', 'tts', 'embedding', 'moderation', 'dall-e', 'davinci', 'babbage', 'curie', 'realtime', 'transcribe'];
      filteredList = rawList.filter((m: any) => {
        const id = (typeof m === 'string' ? m : m.id || '').toLowerCase();
        return !nonChatKeywords.some((kw) => id.includes(kw));
      });
      const priorityOrder = ['gpt-4o', 'gpt-4o-mini', 'o3-mini', 'o1', 'o1-mini', 'chatgpt-4o-latest', 'gpt-4.1', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'];
      filteredList.sort((a: any, b: any) => {
        const idA = (typeof a === 'string' ? a : a.id || '').toLowerCase();
        const idB = (typeof b === 'string' ? b : b.id || '').toLowerCase();
        const indexA = priorityOrder.findIndex((p) => idA.startsWith(p));
        const indexB = priorityOrder.findIndex((p) => idB.startsWith(p));
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return idA.localeCompare(idB);
      });
    }

    const badgeLabel = params.provider === 'openai' ? 'OpenAI' : params.provider === '9router' ? '9Router' : 'Custom';
    const mappedModels = filteredList.map((m: any) => {
      const id = typeof m === 'string' ? m : m.id || m.name;
      return {
        id,
        name: m?.displayName || m?.display_name || id,
        badge: badgeLabel,
        description: m?.description || `AI Model: ${id}`,
        provider: params.provider,
      };
    });

    return { ok: true, models: mappedModels, count: mappedModels.length };
  } catch (err: any) {
    return {
      ok: false,
      models: [],
      error: err?.name === 'AbortError'
        ? 'Timed out while fetching models from provider.'
        : (err?.message || 'Error fetching models.'),
    };
  }
}

// ==================== PUBLIC CONFIG & HEALTH ====================

app.get('/api/config', (_req: Request, res: Response) => {
  const hasValidDefault = Boolean(
    process.env.GEMINI_API_KEY &&
      process.env.GEMINI_API_KEY.trim().length > 0 &&
      process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
  );

  res.json({
    ok: true,
    hasDefaultApiKey: hasValidDefault,
    defaultOpenAiUrl: DEFAULT_OPENAI_BASE_URL,
    defaultAnthropicUrl: DEFAULT_ANTHROPIC_BASE_URL,
    default9RouterUrl: DEFAULT_9ROUTER_BASE_URL,
    keygateConfigured: licenseService.isKeygateConfigured(),
    serverTime: new Date().toISOString(),
  });
});

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true, status: 'healthy', serverTime: new Date().toISOString() });
});

// ==================== SESSION BOOTSTRAP ====================

app.post('/api/session', async (req: Request, res: Response) => {
  try {
    const existingAuth = req.headers.authorization || '';
    const existingToken = existingAuth.startsWith('Bearer ') ? existingAuth.slice(7).trim() : '';
    const verified = verifySessionToken(existingToken);

    let sessionId = verified?.sid || '';
    if (!sessionId || !dbManager.getSession(sessionId)) {
      sessionId = `sess-${crypto.randomUUID()}`;
      dbManager.createSession(sessionId);
    } else {
      dbManager.touchSession(sessionId);
    }

    const token = signSessionToken(sessionId);
    const settings = dbManager.getAllUserSettings();
    const license = await licenseService.getEffectiveLicenseState(false);
    const quota = quotaService.getQuotaStatus(license);
    const providers = dbManager.listProviders();
    const customModels = dbManager.listCustomModels();
    const keyStatus = dbManager.getMasterKeyStatus();

    res.json({
      ok: true,
      token,
      settings,
      license,
      quota,
      providers,
      customModels,
      keyStatus,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || 'Failed to initialize session.' });
  }
});

// ==================== USER SETTINGS API ====================

app.get('/api/settings', requireSession, (_req: Request, res: Response) => {
  res.json({ ok: true, settings: dbManager.getAllUserSettings() });
});

app.put('/api/settings', requireSession, (req: Request, res: Response) => {
  try {
    const incoming = req.body?.settings || req.body || {};
    const sanitized: Record<string, string> = {};
    for (const [k, v] of Object.entries(incoming)) {
      if (v !== undefined && v !== null) {
        sanitized[k] = String(v);
      }
    }
    const updated = dbManager.setUserSettings(sanitized);
    res.json({ ok: true, settings: updated });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err?.message || 'Failed to update settings.' });
  }
});

// ==================== PROVIDERS & CUSTOM MODELS API ====================

app.get('/api/providers', requireSession, (_req: Request, res: Response) => {
  res.json({ ok: true, providers: dbManager.listProviders() });
});

app.post('/api/providers', requireSession, (req: Request, res: Response) => {
  try {
    const { name, type = 'openai', baseUrl = '', apiEndpoint = '', apiKey = '', isDefault = false } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ ok: false, error: 'Provider name is required.' });
    }
    const validTypes: ApiProviderType[] = ['openai', 'google', 'claude', '9router', 'other'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ ok: false, error: 'Unsupported provider type.' });
    }
    const urlCheck = validateExternalProviderUrl(baseUrl);
    if (!urlCheck.valid) {
      return res.status(400).json({ ok: false, error: urlCheck.error });
    }
    const endpointCheck = validateCustomEndpointPath(typeof apiEndpoint === 'string' ? apiEndpoint : '');
    if (!endpointCheck.valid) {
      return res.status(400).json({ ok: false, error: endpointCheck.error });
    }

    const cleanKey = sanitizeApiKey(typeof apiKey === 'string' ? apiKey : '');
    const created = dbManager.createProvider({
      name,
      type,
      baseUrl: urlCheck.normalized,
      apiEndpoint: endpointCheck.normalized,
      apiKey: cleanKey,
      isDefault: Boolean(isDefault),
    });

    res.json({ ok: true, provider: created, providers: dbManager.listProviders() });
  } catch (err: any) {
    const keyErr = classifyMasterKeyError(err);
    res.status(keyErr.statusCode).json({
      ok: false,
      errorCode: keyErr.errorCode,
      error: keyErr.isMasterKeyError ? keyErr.message : (err?.message || 'Failed to create provider.'),
    });
  }
});

app.put('/api/providers/:id', requireSession, (req: Request, res: Response) => {
  try {
    const existing = dbManager.getProviderRow(String(req.params.id));
    if (!existing) {
      return res.status(404).json({ ok: false, error: 'Provider not found.' });
    }

    const { name, type, baseUrl, apiEndpoint, apiKey, clearApiKey, isDefault } = req.body;
    let normalizedBaseUrl = baseUrl;
    if (baseUrl !== undefined) {
      const urlCheck = validateExternalProviderUrl(baseUrl);
      if (!urlCheck.valid) {
        return res.status(400).json({ ok: false, error: urlCheck.error });
      }
      normalizedBaseUrl = urlCheck.normalized;
    }

    let normalizedEndpoint = apiEndpoint;
    if (apiEndpoint !== undefined) {
      const endpointCheck = validateCustomEndpointPath(typeof apiEndpoint === 'string' ? apiEndpoint : '');
      if (!endpointCheck.valid) {
        return res.status(400).json({ ok: false, error: endpointCheck.error });
      }
      normalizedEndpoint = endpointCheck.normalized;
    }

    const cleanKey = typeof apiKey === 'string' ? sanitizeApiKey(apiKey) : undefined;
    const shouldResetStatus = Boolean(
      cleanKey ||
        clearApiKey ||
        (normalizedBaseUrl !== undefined && normalizedBaseUrl !== (existing.base_url || '')) ||
        (normalizedEndpoint !== undefined && normalizedEndpoint !== (existing.api_endpoint || '')) ||
        (type !== undefined && type !== existing.type)
    );

    const updated = dbManager.updateProvider(String(req.params.id), {
      name,
      type,
      baseUrl: normalizedBaseUrl,
      apiEndpoint: normalizedEndpoint,
      apiKey: cleanKey || undefined,
      clearApiKey: Boolean(clearApiKey),
      isDefault,
      status: shouldResetStatus ? 'unverified' : undefined,
    });

    if (!updated) {
      return res.status(404).json({ ok: false, error: 'Provider not found.' });
    }

    res.json({ ok: true, provider: updated, providers: dbManager.listProviders() });
  } catch (err: any) {
    const keyErr = classifyMasterKeyError(err);
    res.status(keyErr.statusCode).json({
      ok: false,
      errorCode: keyErr.errorCode,
      error: keyErr.isMasterKeyError ? keyErr.message : (err?.message || 'Failed to update provider.'),
    });
  }
});

app.delete('/api/providers/:id', requireSession, (req: Request, res: Response) => {
  const deleted = dbManager.deleteProvider(String(req.params.id));
  if (!deleted) {
    return res.status(404).json({ ok: false, error: 'Provider not found.' });
  }
  res.json({ ok: true, providers: dbManager.listProviders() });
});

app.post('/api/providers/:id/test', requireSession, verifyRateLimit, async (req: Request, res: Response) => {
  try {
    const row = dbManager.getProviderRow(String(req.params.id));
    if (!row) {
      return res.status(404).json({ ok: false, error: 'Provider not found.' });
    }

    const overrideKey = typeof req.body?.apiKey === 'string' ? sanitizeApiKey(req.body.apiKey) : '';
    const activeKey = overrideKey || sanitizeApiKey(dbManager.getDecryptedProviderKey(row.id));

    const overrideType = req.body?.provider as ApiProviderType | undefined;
    const result = await testProviderCredentials({
      provider: overrideType || row.type,
      apiKey: activeKey,
      baseUrl: req.body?.baseUrl !== undefined ? req.body.baseUrl : row.base_url,
      apiEndpoint: req.body?.apiEndpoint !== undefined ? req.body.apiEndpoint : row.api_endpoint,
      providerId: row.id,
    });

    const updated = dbManager.updateProvider(row.id, {
      status: result.ok ? 'connected' : 'error',
      lastCheckedAt: new Date().toISOString(),
      lastError: result.ok ? null : (result.error || 'Connection failed'),
    });

    res.json({
      ...result,
      provider: updated,
      providers: dbManager.listProviders(),
    });
  } catch (err: any) {
    const keyErr = classifyMasterKeyError(err);
    res.status(keyErr.isMasterKeyError ? 503 : 500).json({
      ok: false,
      errorCode: keyErr.errorCode,
      error: keyErr.isMasterKeyError ? keyErr.message : (err?.message || 'Connection test failed.'),
    });
  }
});

app.post('/api/verify-key', requireSession, verifyRateLimit, async (req: Request, res: Response) => {
  try {
    const { apiKey, provider, baseUrl, apiEndpoint, providerId } = req.body || {};
    let keyToTest = typeof apiKey === 'string' ? sanitizeApiKey(apiKey) : '';
    let provType = (provider || 'openai') as ApiProviderType;
    let provUrl = typeof baseUrl === 'string' ? baseUrl : '';
    let provEndpoint = typeof apiEndpoint === 'string' ? apiEndpoint : '';

    if (providerId) {
      const row = dbManager.getProviderRow(providerId);
      if (row) {
        if (!keyToTest) {
          keyToTest = sanitizeApiKey(dbManager.getDecryptedProviderKey(row.id));
        }
        provType = (provider as ApiProviderType) || row.type;
        provUrl = baseUrl !== undefined ? String(baseUrl) : row.base_url;
        provEndpoint = apiEndpoint !== undefined ? String(apiEndpoint) : row.api_endpoint;
      }
    }

    const result = await testProviderCredentials({
      provider: provType,
      apiKey: keyToTest,
      baseUrl: provUrl,
      apiEndpoint: provEndpoint,
      providerId,
    });
    res.json(result);
  } catch (error: any) {
    const keyErr = classifyMasterKeyError(error);
    if (keyErr.isMasterKeyError) {
      return res.status(503).json({
        ok: false,
        errorCode: keyErr.errorCode,
        errorType: keyErr.errorCode,
        error: keyErr.message,
      });
    }
    const { isApiKeyError, friendlyMessage } = classifyError(error);
    res.json({
      ok: false,
      errorType: isApiKeyError ? 'INVALID_OR_EXPIRED_KEY' : 'GENERAL_ERROR',
      error: friendlyMessage,
    });
  }
});

app.post('/api/models', requireSession, verifyRateLimit, async (req: Request, res: Response) => {
  try {
    const { apiKey, provider = 'openai', baseUrl = '', apiEndpoint = '', providerId } = req.body;
    let activeKey = typeof apiKey === 'string' ? sanitizeApiKey(apiKey) : '';
    let provType = provider as ApiProviderType;
    let provUrl = baseUrl;
    let provEndpoint = apiEndpoint;

    if (providerId) {
      const row = dbManager.getProviderRow(providerId);
      if (row) {
        provType = row.type;
        provUrl = provUrl || row.base_url;
        provEndpoint = provEndpoint || row.api_endpoint;
        if (!activeKey) {
          activeKey = dbManager.getDecryptedProviderKey(row.id);
        }
      }
    } else if (!activeKey) {
      const def = dbManager.getDefaultProviderRow();
      if (def) {
        provType = def.type;
        provUrl = def.base_url;
        provEndpoint = def.api_endpoint;
        activeKey = dbManager.getDecryptedProviderKey(def.id);
      }
    }

    const customModels = dbManager.listCustomModels(providerId);
    const fetched = await fetchProviderModelsList({
      provider: provType,
      apiKey: activeKey,
      baseUrl: provUrl,
      apiEndpoint: provEndpoint,
    });

    const combined: Array<Record<string, any>> = [...(fetched.models || [])];
    for (const cm of customModels) {
      if (!combined.some((m: any) => m.id === cm.model_id)) {
        combined.unshift({
          id: cm.model_id,
          name: cm.display_name || cm.model_id,
          badge: 'Custom',
          description: `Custom model (${cm.model_id})`,
          provider: provType,
          providerId: cm.provider_id,
          isCustom: true,
        });
      }
    }

    res.json({
      ...fetched,
      models: combined,
      count: combined.length,
    });
  } catch (error: any) {
    const keyErr = classifyMasterKeyError(error);
    res.status(keyErr.isMasterKeyError ? 503 : 200).json({
      ok: false,
      models: [],
      errorCode: keyErr.isMasterKeyError ? keyErr.errorCode : undefined,
      error: keyErr.isMasterKeyError ? keyErr.message : (error?.message || 'Error fetching models.'),
    });
  }
});

app.get('/api/custom-models', requireSession, (req: Request, res: Response) => {
  const providerId = typeof req.query.providerId === 'string' ? req.query.providerId : undefined;
  res.json({ ok: true, customModels: dbManager.listCustomModels(providerId) });
});

app.post('/api/custom-models', requireSession, (req: Request, res: Response) => {
  try {
    const { providerId, modelId, displayName, isDefault } = req.body;
    if (!providerId || !modelId || typeof modelId !== 'string' || !modelId.trim()) {
      return res.status(400).json({ ok: false, error: 'Provider and Model ID are required.' });
    }
    const prov = dbManager.getProviderRow(providerId);
    if (!prov) {
      return res.status(404).json({ ok: false, error: 'Provider not found.' });
    }

    const created = dbManager.createCustomModel({
      providerId,
      modelId: modelId.trim(),
      displayName: displayName?.trim(),
      isDefault: Boolean(isDefault),
    });
    res.json({ ok: true, customModel: created, customModels: dbManager.listCustomModels() });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || 'Failed to add custom model.' });
  }
});

app.delete('/api/custom-models/:id', requireSession, (req: Request, res: Response) => {
  const deleted = dbManager.deleteCustomModel(String(req.params.id));
  if (!deleted) {
    return res.status(404).json({ ok: false, error: 'Custom model not found.' });
  }
  res.json({ ok: true, customModels: dbManager.listCustomModels() });
});

// ==================== KEYGATE LICENSE & QUOTA API ====================

app.get('/api/license', requireSession, async (_req: Request, res: Response) => {
  try {
    const license = await licenseService.getEffectiveLicenseState(false);
    const quota = quotaService.getQuotaStatus(license);
    res.json({ ok: true, license, quota });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || 'Failed to retrieve license status.' });
  }
});

app.post('/api/license/activate', requireSession, licenseRateLimit, async (req: Request, res: Response) => {
  try {
    const { licenseKey } = req.body;
    const result = await licenseService.activateLicense(typeof licenseKey === 'string' ? licenseKey : '');
    const quota = quotaService.getQuotaStatus(result.license);
    res.status(result.ok ? 200 : 400).json({
      ...result,
      quota,
    });
  } catch (err: any) {
    res.status(500).json({
      ok: false,
      errorCode: 'LICENSE_ACTIVATION_FAILED',
      errorMessage: err?.message || 'Unexpected error activating license.',
    });
  }
});

app.post('/api/license/verify', requireSession, licenseRateLimit, async (req: Request, res: Response) => {
  try {
    const { licenseKey } = req.body || {};
    const result = await licenseService.verifyLicense(typeof licenseKey === 'string' ? licenseKey : undefined);
    const quota = quotaService.getQuotaStatus(result.license);
    res.status(result.ok ? 200 : 400).json({
      ...result,
      quota,
    });
  } catch (err: any) {
    res.status(500).json({
      ok: false,
      errorCode: 'LICENSE_VERIFICATION_FAILED',
      errorMessage: err?.message || 'Unexpected error verifying license.',
    });
  }
});

app.post('/api/license/deactivate', requireSession, licenseRateLimit, async (_req: Request, res: Response) => {
  try {
    const result = await licenseService.deactivateLicense();
    const quota = quotaService.getQuotaStatus(result.license);
    res.json({
      ...result,
      quota,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || 'Failed to deactivate license.' });
  }
});

app.post('/api/license/skip-welcome', requireSession, async (_req: Request, res: Response) => {
  try {
    const settings = dbManager.setUserSettings({ welcome_dismissed: 'true' });
    const license = await licenseService.getEffectiveLicenseState(false);
    const quota = quotaService.getQuotaStatus(license);
    res.json({ ok: true, settings, license, quota });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || 'Failed to skip welcome screen.' });
  }
});

app.get('/api/quota', requireSession, async (_req: Request, res: Response) => {
  try {
    const license = await licenseService.getEffectiveLicenseState(false);
    const quota = quotaService.getQuotaStatus(license);
    res.json({ ok: true, quota });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || 'Failed to read quota.' });
  }
});

// ==================== MASTER ENCRYPTION KEY MANAGEMENT ====================

app.get('/api/security/key-status', requireSession, (_req: Request, res: Response) => {
  try {
    const keyStatus = dbManager.getMasterKeyStatus();
    res.json({ ok: true, keyStatus });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || 'Failed to read encryption key status.' });
  }
});

app.post('/api/security/key/backup', requireSession, securityRateLimit, (req: Request, res: Response) => {
  try {
    const passphrase = typeof req.body?.passphrase === 'string' ? req.body.passphrase : '';
    const backupContent = dbManager.backupMasterKey(passphrase);
    const keyStatus = dbManager.getMasterKeyStatus();
    const dateStamp = new Date().toISOString().slice(0, 10);
    res.json({
      ok: true,
      backupContent,
      filename: `chatai-master-key-v${keyStatus.activeKeyVersion}-${dateStamp}.backup.json`,
      keyStatus,
    });
  } catch (err: any) {
    res.status(400).json({
      ok: false,
      errorCode: 'KEY_BACKUP_FAILED',
      error: err?.message || 'Failed to export encrypted key backup.',
    });
  }
});

app.post('/api/security/key/restore', requireSession, securityRateLimit, async (req: Request, res: Response) => {
  try {
    const backupContent = typeof req.body?.backupContent === 'string' ? req.body.backupContent : '';
    const passphrase = typeof req.body?.passphrase === 'string' ? req.body.passphrase : undefined;
    const keyStatus = dbManager.restoreMasterKey(backupContent, passphrase);
    const license = await licenseService.getEffectiveLicenseState(false);
    const quota = quotaService.getQuotaStatus(license);
    res.json({
      ok: true,
      keyStatus,
      license,
      quota,
    });
  } catch (err: any) {
    res.status(400).json({
      ok: false,
      errorCode: 'KEY_RESTORE_FAILED',
      error: err?.message || 'Failed to restore master encryption key.',
    });
  }
});

app.post('/api/security/key/rotate', requireSession, securityRateLimit, (_req: Request, res: Response) => {
  try {
    const result = dbManager.rotateMasterKey();
    res.json({
      ok: true,
      oldVersion: result.oldVersion,
      newVersion: result.newVersion,
      reencryptedCount: result.reencryptedCount,
      keyStatus: result.keyStatus,
    });
  } catch (err: any) {
    const keyErr = classifyMasterKeyError(err);
    res.status(keyErr.isMasterKeyError ? 503 : 400).json({
      ok: false,
      errorCode: keyErr.isMasterKeyError ? keyErr.errorCode : 'KEY_ROTATION_FAILED',
      error: err?.message || 'Failed to rotate master encryption key.',
    });
  }
});

// ==================== SQLITE CONVERSATIONS API ====================

app.get('/api/conversations', requireSession, (_req: Request, res: Response) => {
  try {
    const list = dbManager.getConversations();
    res.json({ ok: true, conversations: list });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/conversations', requireSession, (req: Request, res: Response) => {
  try {
    const { id, title, model, provider, system_instruction, user_id } = req.body;
    const convId = id || 'chat-' + Date.now();
    const conv = dbManager.createConversation({
      id: convId,
      title,
      model,
      provider,
      system_instruction,
      user_id,
    });
    res.json({ ok: true, conversation: conv });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/conversations/:id', requireSession, (req: Request, res: Response) => {
  try {
    const result = dbManager.getConversation(String(req.params.id));
    if (!result) {
      return res.status(404).json({ ok: false, error: 'Conversation not found' });
    }
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.put('/api/conversations/:id', requireSession, (req: Request, res: Response) => {
  try {
    const { title, model, provider, system_instruction } = req.body;
    const updated = dbManager.updateConversation(String(req.params.id), {
      title,
      model,
      provider,
      system_instruction,
    });
    if (!updated) {
      return res.status(404).json({ ok: false, error: 'Conversation not found' });
    }
    res.json({ ok: true, conversation: updated });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete('/api/conversations/:id', requireSession, (req: Request, res: Response) => {
  try {
    const success = dbManager.deleteConversation(String(req.params.id));
    res.json({ ok: success });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/conversations/:id/messages', requireSession, (req: Request, res: Response) => {
  try {
    const { id, role, sender, content, metadata } = req.body;
    const saved = dbManager.saveMessage({
      id: id || 'msg-' + Date.now(),
      conversation_id: String(req.params.id),
      role: role || 'user',
      sender: sender || 'user',
      content: content || '',
      metadata,
    });
    res.json({ ok: true, message: saved });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/conversations/bulk-sync', requireSession, (req: Request, res: Response) => {
  try {
    const { conversations = [] } = req.body;
    let syncedConvs = 0;
    let syncedMsgs = 0;

    for (const c of conversations) {
      if (!c.id) continue;
      dbManager.createConversation({
        id: c.id,
        title: c.title,
        model: c.model,
        provider: c.provider,
        system_instruction: c.systemInstruction,
        created_at: c.createdAt ? new Date(c.createdAt).toISOString() : undefined,
        updated_at: c.updatedAt ? new Date(c.updatedAt).toISOString() : undefined,
      });
      syncedConvs++;

      if (Array.isArray(c.messages)) {
        for (const m of c.messages) {
          if (!m.id || !m.content) continue;
          dbManager.saveMessage({
            id: m.id,
            conversation_id: c.id,
            role: m.role || (m.sender === 'ai' ? 'model' : 'user'),
            sender: m.sender || (m.role === 'model' || m.role === 'assistant' ? 'ai' : 'user'),
            content: m.content,
            created_at: m.timestamp ? new Date(m.timestamp).toISOString() : undefined,
            metadata: {
              modelUsed: m.modelUsed,
              estimatedTokens: m.estimatedTokens,
            },
          });
          syncedMsgs++;
        }
      }
    }

    dbManager.persistNow();
    res.json({ ok: true, syncedConvs, syncedMsgs });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==================== SQLITE ANALYTICS & USAGE HISTORY (COMMUNITY ONLY) ====================

app.get('/api/analytics/monthly', requireSession, requireCommunityAnalytics, (req: Request, res: Response) => {
  try {
    const month = typeof req.query.month === 'string' ? req.query.month : undefined;
    const stats = dbManager.getMonthlyAnalytics(month);
    res.json({ ok: true, ...stats });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/analytics/summary', requireSession, requireCommunityAnalytics, (req: Request, res: Response) => {
  try {
    const count = Number(req.query.count) || 6;
    const summary = dbManager.getRecentMonthsSummary(count);
    res.json({ ok: true, summary });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/analytics/history', requireSession, requireCommunityAnalytics, (req: Request, res: Response) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const offset = Number(req.query.offset) || 0;
    const provider = typeof req.query.provider === 'string' ? req.query.provider : undefined;
    const model = typeof req.query.model === 'string' ? req.query.model : undefined;
    const month = typeof req.query.month === 'string' ? req.query.month : undefined;

    const history = dbManager.getUsageHistory({ limit, offset, provider, model, month });
    res.json({ ok: true, ...history });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Reject client-forged token usage records
app.post('/api/analytics/record', requireSession, (_req: Request, res: Response) => {
  res.status(403).json({
    ok: false,
    errorCode: 'SERVER_AUTHORITATIVE_USAGE',
    error: 'Token usage is recorded exclusively by the server from provider responses.',
  });
});

// ==================== CHAT STREAMING WITH QUOTA & LICENSE ENFORCEMENT ====================

app.post('/api/chat/stream', requireSession, chatRateLimit, async (req: Request, res: Response) => {
  const {
    messages = [],
    model = '',
    systemInstruction,
    temperature = 0.7,
    providerId,
    provider: bodyProvider = 'openai',
    baseUrl: bodyBaseUrl,
    conversationId,
    userMessageId,
    aiMessageId,
    requestId,
  } = req.body;

  const reqTag = requestId || `req-${Date.now()}`;

  if (!Array.isArray(messages) || messages.length === 0) {
    console.warn(`[ChatStream] Rejected ${reqTag}: empty messages array`);
    return res.status(400).json({
      ok: false,
      errorCode: 'INVALID_REQUEST',
      error: 'Messages array is required.',
    });
  }

  // 1. Authoritative server-side license & quota verification BEFORE calling AI provider
  const license = await licenseService.getEffectiveLicenseState(false);
  const reservation = quotaService.reserveRequest(license);

  if (!reservation.allowed) {
    console.warn(`[ChatStream] Rejected ${reqTag}: quota exceeded (${reservation.reason}, plan=${license.plan})`);
    return res.status(429).json({
      ok: false,
      errorCode: 'QUOTA_EXCEEDED',
      reason: reservation.reason,
      plan: license.plan,
      quota: reservation.quota,
      error:
        reservation.reason === 'TOKEN_LIMIT_REACHED'
          ? 'Daily token quota exceeded for your current plan.'
          : 'Daily chat request quota exceeded for your current plan.',
    });
  }

  // 2. Resolve provider credentials securely from encrypted SQLite backend
  const providerRow = providerId
    ? dbManager.getProviderRow(providerId)
    : dbManager.getDefaultProviderRow();

  if (providerId && !providerRow) {
    quotaService.refundFailedRequest(reservation.dateKey, license.plan);
    console.warn(`[ChatStream] Rejected ${reqTag}: providerId=${providerId} not found`);
    return res.status(404).json({
      ok: false,
      errorCode: 'PROVIDER_NOT_FOUND',
      error: 'Selected AI provider was not found.',
    });
  }

  const provider: ApiProviderType = providerRow?.type || (bodyProvider as ApiProviderType) || 'openai';
  let activeKey = '';
  try {
    activeKey = providerRow ? sanitizeApiKey(dbManager.getDecryptedProviderKey(providerRow.id)) : '';
  } catch (decryptErr: any) {
    quotaService.refundFailedRequest(reservation.dateKey, license.plan);
    console.error(`[ChatStream] Rejected ${reqTag}: failed decrypting provider key (${decryptErr?.code || 'ERR'})`);
    const keyErr = classifyMasterKeyError(decryptErr);
    return res.status(503).json({
      ok: false,
      errorCode: keyErr.errorCode === 'INTERNAL_ERROR' ? 'API_KEY_DECRYPTION_FAILED' : keyErr.errorCode,
      error: keyErr.message,
    });
  }

  let activeBaseUrl = providerRow?.base_url || bodyBaseUrl || '';
  const customEndpointCheck = validateCustomEndpointPath(providerRow?.api_endpoint || '');
  if (!customEndpointCheck.valid) {
    quotaService.refundFailedRequest(reservation.dateKey, license.plan);
    console.warn(`[ChatStream] Rejected ${reqTag}: invalid custom endpoint path`);
    return res.status(400).json({ ok: false, errorCode: 'INVALID_URL', error: customEndpointCheck.error });
  }
  const customEndpointPath = customEndpointCheck.normalized;

  // Fallback to server environment GEMINI_API_KEY only when using Google and no stored provider key exists
  if (!activeKey && provider === 'google' && process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY') {
    activeKey = sanitizeApiKey(process.env.GEMINI_API_KEY);
  }

  const urlCheck = validateExternalProviderUrl(activeBaseUrl);
  if (!urlCheck.valid) {
    quotaService.refundFailedRequest(reservation.dateKey, license.plan);
    console.warn(`[ChatStream] Rejected ${reqTag}: invalid provider base URL`);
    return res.status(400).json({ ok: false, errorCode: 'INVALID_URL', error: urlCheck.error });
  }
  activeBaseUrl = urlCheck.normalized;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const streamAbortController = new AbortController();
  let clientDisconnected = false;
  res.on('close', () => {
    if (!res.writableFinished) {
      clientDisconnected = true;
      streamAbortController.abort(new Error('Client disconnected'));
    }
  });
  const safeWriteSse = (chunk: string) => {
    if (!clientDisconnected && !res.writableEnded && !res.destroyed) {
      res.write(chunk);
    }
  };
  const safeEndSse = () => {
    if (!res.writableEnded && !res.destroyed) {
      res.end();
    }
  };

  if (!activeKey) {
    quotaService.refundFailedRequest(reservation.dateKey, license.plan);
    console.warn(`[ChatStream] Rejected ${reqTag}: missing API key for provider=${provider}`);
    res.write(
      `data: ${JSON.stringify({
        error: 'No API Key configured. Please add an API Key in Settings -> Providers.',
        errorCode: 'MISSING_API_KEY',
        errorType: 'INVALID_OR_EXPIRED_KEY',
      })}\n\n`
    );
    res.write('data: [DONE]\n\n');
    return res.end();
  }

  const providerCustomModels = providerRow ? dbManager.listCustomModels(providerRow.id) : [];
  const rawModel =
    (typeof model === 'string' && model.trim()) ||
    providerCustomModels[0]?.model_id ||
    dbManager.getUserSetting('default_model') ||
    (provider === 'google' ? 'gemini-2.5-flash' : provider === 'claude' ? 'claude-sonnet-4-20250514' : 'gpt-4o-mini');
  const targetModel = String(rawModel).replace(/^models\//, '').trim();
  const parsedTemp = Number.isFinite(Number(temperature)) ? Number(temperature) : 0.7;

  const activeConvId = conversationId || 'chat-' + Date.now();
  const lastUserMsg = messages.filter((m: any) => m.role === 'user' || m.sender === 'user').slice(-1)[0];
  const userText = lastUserMsg?.content || '';
  const computedTitle = userText ? userText.slice(0, 32) + (userText.length > 32 ? '...' : '') : 'New chat';

  console.log(
    `[ChatStream] Dispatching ${reqTag} provider=${provider} (${providerRow?.name || 'default'}) model=${targetModel} conv=${activeConvId} msgs=${messages.length}`
  );

  try {
    const existingConv = dbManager.getConversation(activeConvId);
    if (!existingConv) {
      dbManager.createConversation({
        id: activeConvId,
        title: computedTitle,
        model: targetModel,
        provider,
        system_instruction: systemInstruction,
      });
    } else if (
      userText &&
      existingConv.messages.length === 0 &&
      (existingConv.conversation.title === 'New chat' || existingConv.conversation.title === 'Đoạn chat mới')
    ) {
      dbManager.updateConversation(activeConvId, {
        title: computedTitle,
        model: targetModel,
        provider,
        system_instruction: systemInstruction,
      });
    }

    if (userText && userMessageId) {
      dbManager.saveMessage({
        id: userMessageId,
        conversation_id: activeConvId,
        role: 'user',
        sender: 'user',
        content: userText,
      });
    }
  } catch (err: any) {
    console.error('[Stream] Error initializing conversation in SQLite:', err);
  }

  const promptText = messages.map((m: any) => m.content || '').join('\n');
  const fallbackInputTokens = estimateTextTokens(promptText);

  let fullAiText = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let cachedTokens = 0;
  let reasoningTokens = 0;
  let usageSource: 'provider' | 'estimated' = 'estimated';

  const finalizeAndSave = (status: 'success' | 'error' | 'aborted' = 'success') => {
    if (status === 'error' && !fullAiText.trim()) {
      quotaService.refundFailedRequest(reservation.dateKey, license.plan);
      console.log(`[ChatStream] Finalized ${reqTag} status=error (refunded quota)`);
      return;
    }

    if (usageSource === 'estimated' || totalTokens === 0) {
      inputTokens = inputTokens || fallbackInputTokens;
      outputTokens = outputTokens || estimateTextTokens(fullAiText);
      totalTokens = inputTokens + outputTokens;
      usageSource = 'estimated';
    }

    const aiMsgId = aiMessageId || 'msg-' + Date.now() + '-ai';
    try {
      if (fullAiText.trim().length > 0) {
        dbManager.saveMessage({
          id: aiMsgId,
          conversation_id: activeConvId,
          role: 'model',
          sender: 'ai',
          content: fullAiText,
          metadata: {
            modelUsed: targetModel,
            provider,
            usageSource,
            inputTokens,
            outputTokens,
            totalTokens,
          },
        });
      }

      dbManager.recordTokenUsage({
        conversation_id: activeConvId,
        message_id: aiMsgId,
        provider: providerRow?.name ? `${provider} (${providerRow.name})` : provider,
        model: targetModel,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
        cached_input_tokens: cachedTokens,
        reasoning_tokens: reasoningTokens,
        usage_source: usageSource,
        request_id: reqTag,
        status,
      });

      quotaService.addTokensUsed(reservation.dateKey, license.plan, totalTokens);
    } catch (saveErr) {
      console.error('[Stream] Error saving to SQLite:', saveErr);
    }

    console.log(
      `[ChatStream] Completed ${reqTag} status=${status} chars=${fullAiText.length} tokens=${totalTokens} source=${usageSource}`
    );

    const updatedQuota = quotaService.getQuotaStatus(license);
    safeWriteSse(
      `data: ${JSON.stringify({
        usage: {
          inputTokens,
          outputTokens,
          totalTokens,
          cachedTokens,
          reasoningTokens,
          usageSource,
          model: targetModel,
          provider,
        },
        quota: updatedQuota,
      })}\n\n`
    );
  };

  // 1. Google AI Studio Provider
  if (provider === 'google') {
    try {
      console.log(`[ChatStream] Upstream Google generateContentStream base=${safeUrlForLog(resolveGoogleBaseUrl(activeBaseUrl))} model=${targetModel}`);
      const ai = getGoogleAIClient(activeKey, activeBaseUrl);
      const formattedContents = messages.map((msg: any) => {
        const isModel = msg.role === 'model' || msg.role === 'assistant' || msg.sender === 'ai';
        return {
          role: isModel ? 'model' : 'user',
          parts: [{ text: msg.content || ' ' }],
        };
      });

      const config: any = {
        temperature: parsedTemp,
      };
      if (systemInstruction && systemInstruction.trim().length > 0) {
        config.systemInstruction = systemInstruction.trim();
      }

      const responseStream = await ai.models.generateContentStream({
        model: targetModel,
        contents: formattedContents,
        config,
      });

      for await (const chunk of responseStream) {
        if (clientDisconnected) break;
        const chunkText = chunk.text;
        if (chunkText) {
          fullAiText += chunkText;
          safeWriteSse(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
        }

        if (chunk.usageMetadata) {
          inputTokens = chunk.usageMetadata.promptTokenCount || inputTokens;
          outputTokens = chunk.usageMetadata.candidatesTokenCount || outputTokens;
          totalTokens = chunk.usageMetadata.totalTokenCount || inputTokens + outputTokens;
          cachedTokens = chunk.usageMetadata.cachedContentTokenCount || cachedTokens;
          usageSource = 'provider';
        }
      }

      if (clientDisconnected) {
        finalizeAndSave(fullAiText.trim() ? 'aborted' : 'error');
        return safeEndSse();
      }

      if (!fullAiText.trim()) {
        const emptyErr: any = new Error('Google AI returned an empty response.');
        emptyErr.code = 'EMPTY_PROVIDER_RESPONSE';
        throw emptyErr;
      }

      finalizeAndSave('success');
      safeWriteSse('data: [DONE]\n\n');
      return safeEndSse();
    } catch (error: any) {
      if (clientDisconnected) {
        finalizeAndSave(fullAiText.trim() ? 'aborted' : 'error');
        return safeEndSse();
      }
      console.error(`[ChatStream] Upstream Google error (${reqTag}): ${error?.message || 'Unknown error'}`);
      finalizeAndSave('error');
      const { isApiKeyError, errorCode, friendlyMessage } = classifyError(error);
      safeWriteSse(
        `data: ${JSON.stringify({
          error: friendlyMessage,
          errorCode: error?.code === 'EMPTY_PROVIDER_RESPONSE' ? 'EMPTY_PROVIDER_RESPONSE' : errorCode,
          errorType: isApiKeyError ? 'INVALID_OR_EXPIRED_KEY' : 'GENERAL_ERROR',
        })}\n\n`
      );
      safeWriteSse('data: [DONE]\n\n');
      return safeEndSse();
    }
  }

  // 2. Anthropic Claude Provider
  if (provider === 'claude') {
    try {
      const { chatUrl } = resolveProviderUrlAndEndpoint('claude', activeBaseUrl, customEndpointPath, '/messages');
      console.log(`[ChatStream] Upstream POST ${safeUrlForLog(chatUrl)} model=${targetModel}`);

      const formattedClaudeMessages = messages.map((msg: any) => {
        const isAI = msg.role === 'model' || msg.role === 'assistant' || msg.sender === 'ai';
        return {
          role: isAI ? 'assistant' : 'user',
          content: msg.content || ' ',
        };
      });

      const response = await fetchWithSafeRedirects(
        chatUrl,
        {
          method: 'POST',
          signal: streamAbortController.signal,
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': activeKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: targetModel,
            max_tokens: 4096,
            system: systemInstruction && systemInstruction.trim().length > 0 ? systemInstruction.trim() : undefined,
            messages: formattedClaudeMessages,
            temperature: parsedTemp,
            stream: true,
          }),
        },
        60000
      );

      console.log(`[ChatStream] Upstream Claude response (${reqTag}): status=${response.status} content-type=${response.headers.get('content-type') || 'unknown'}`);

      if (!response.ok) {
        finalizeAndSave('error');
        const errorText = await response.text();
        const parsedError = parseProviderErrorBody(errorText);
        console.warn(`[ChatStream] Upstream Claude HTTP ${response.status} (${reqTag}): ${parsedError.slice(0, 160)}`);
        const { isApiKeyError, errorCode, friendlyMessage } = classifyError({ message: parsedError, status: response.status });
        safeWriteSse(
          `data: ${JSON.stringify({
            error: friendlyMessage || parsedError,
            errorCode,
            errorType: isApiKeyError ? 'INVALID_OR_EXPIRED_KEY' : 'GENERAL_ERROR',
          })}\n\n`
        );
        safeWriteSse('data: [DONE]\n\n');
        return safeEndSse();
      }

      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      if (contentType.includes('application/json')) {
        const jsonBody = await response.json();
        const text =
          Array.isArray(jsonBody?.content)
            ? jsonBody.content.map((c: any) => c?.text || '').join('')
            : jsonBody?.choices?.[0]?.message?.content || '';
        if (jsonBody?.usage) {
          inputTokens = jsonBody.usage.input_tokens || jsonBody.usage.prompt_tokens || 0;
          outputTokens = jsonBody.usage.output_tokens || jsonBody.usage.completion_tokens || 0;
          totalTokens = inputTokens + outputTokens;
          if (totalTokens > 0) usageSource = 'provider';
        }
        if (!String(text).trim()) {
          const emptyErr: any = new Error('Anthropic Claude returned an empty response.');
          emptyErr.code = 'EMPTY_PROVIDER_RESPONSE';
          throw emptyErr;
        }
        fullAiText = String(text);
        safeWriteSse(`data: ${JSON.stringify({ text: fullAiText })}\n\n`);
        finalizeAndSave('success');
        safeWriteSse('data: [DONE]\n\n');
        return safeEndSse();
      }

      if (!response.body) {
        throw new Error('Anthropic Claude server did not open response stream.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      const processClaudeLine = (rawLine: string): boolean => {
        const trimmed = rawLine.trim();
        if (!trimmed.startsWith('data:')) return false;
        const dataStr = trimmed.slice(5).trim();
        if (dataStr === '[DONE]') return true;
        if (!dataStr) return false;
        const parsed = JSON.parse(dataStr);
        if (parsed.type === 'error' || parsed.error) {
          const errMsg = parsed.error?.message || parsed.message || 'Upstream Claude stream error.';
          throw new Error(errMsg);
        }
        if (parsed.type === 'message_start' && parsed.message?.usage) {
          inputTokens = parsed.message.usage.input_tokens || 0;
        }
        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
          fullAiText += parsed.delta.text;
          safeWriteSse(`data: ${JSON.stringify({ text: parsed.delta.text })}\n\n`);
        }
        if (parsed.type === 'message_delta' && parsed.usage) {
          outputTokens = parsed.usage.output_tokens || 0;
          totalTokens = inputTokens + outputTokens;
          usageSource = 'provider';
        }
        return false;
      };

      let streamDone = false;
      while (!streamDone && !clientDisconnected) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          try {
            if (processClaudeLine(line)) {
              streamDone = true;
              break;
            }
          } catch (lineErr: any) {
            if (lineErr instanceof SyntaxError) continue;
            throw lineErr;
          }
        }
      }

      if (clientDisconnected) {
        await reader.cancel().catch(() => {});
        finalizeAndSave(fullAiText.trim() ? 'aborted' : 'error');
        return safeEndSse();
      }

      if (buffer.trim()) {
        try {
          processClaudeLine(buffer);
        } catch (lineErr: any) {
          if (!(lineErr instanceof SyntaxError)) throw lineErr;
        }
      }

      if (!fullAiText.trim()) {
        const emptyErr: any = new Error('Anthropic Claude returned an empty response stream.');
        emptyErr.code = 'EMPTY_PROVIDER_RESPONSE';
        throw emptyErr;
      }

      finalizeAndSave('success');
      safeWriteSse('data: [DONE]\n\n');
      return safeEndSse();
    } catch (error: any) {
      if (clientDisconnected) {
        finalizeAndSave(fullAiText.trim() ? 'aborted' : 'error');
        return safeEndSse();
      }
      console.error(`[ChatStream] Upstream Claude error (${reqTag}): ${error?.message || 'Unknown error'}`);
      finalizeAndSave('error');
      const { isApiKeyError, errorCode, friendlyMessage } = classifyError(error);
      safeWriteSse(
        `data: ${JSON.stringify({
          error: friendlyMessage,
          errorCode: error?.code === 'EMPTY_PROVIDER_RESPONSE' ? 'EMPTY_PROVIDER_RESPONSE' : errorCode,
          errorType: isApiKeyError ? 'INVALID_OR_EXPIRED_KEY' : 'GENERAL_ERROR',
        })}\n\n`
      );
      safeWriteSse('data: [DONE]\n\n');
      return safeEndSse();
    }
  }

  // 3. OpenAI, 9Router, and Other OpenAI-compatible providers
  try {
    const formattedMessages: any[] = [];
    if (systemInstruction && systemInstruction.trim().length > 0) {
      formattedMessages.push({
        role: 'system',
        content: systemInstruction.trim(),
      });
    }

    for (const msg of messages) {
      const isAI = msg.role === 'model' || msg.role === 'assistant' || msg.sender === 'ai';
      formattedMessages.push({
        role: isAI ? 'assistant' : 'user',
        content: msg.content || ' ',
      });
    }

    const { chatUrl } = resolveProviderUrlAndEndpoint(
      provider,
      activeBaseUrl,
      customEndpointPath,
      '/chat/completions'
    );

    console.log(`[ChatStream] Upstream POST ${safeUrlForLog(chatUrl)} model=${targetModel}`);

    const isReasoningModel = /^(o1|o3|o4)(-|$)/i.test(targetModel);
    const buildPayload = (includeStreamOptions: boolean, includeTemperature: boolean) => {
      const bodyObj: Record<string, any> = {
        model: targetModel,
        messages: formattedMessages,
        stream: true,
      };
      if (includeTemperature && !isReasoningModel) {
        bodyObj.temperature = parsedTemp;
      }
      if (includeStreamOptions) {
        bodyObj.stream_options = { include_usage: true };
      }
      return JSON.stringify(bodyObj);
    };

    const callOpenAiStream = (includeStreamOptions: boolean, includeTemperature: boolean) =>
      fetchWithSafeRedirects(
        chatUrl,
        {
          method: 'POST',
          signal: streamAbortController.signal,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${activeKey}`,
          },
          body: buildPayload(includeStreamOptions, includeTemperature),
        },
        60000
      );

    let response = await callOpenAiStream(true, !isReasoningModel);
    console.log(`[ChatStream] Upstream OpenAI-compatible response (${reqTag}): status=${response.status} content-type=${response.headers.get('content-type') || 'unknown'}`);

    if (response.status === 400 || response.status === 422) {
      const firstErrText = await response.text();
      const firstErrMsg = parseProviderErrorBody(firstErrText);
      const lower = firstErrMsg.toLowerCase();
      const shouldRetryWithoutOpts =
        lower.includes('stream_options') ||
        lower.includes('temperature') ||
        lower.includes('unsupported') ||
        lower.includes('unknown') ||
        lower.includes('unrecognized') ||
        lower.includes('extra_forbidden');

      if (shouldRetryWithoutOpts) {
        console.log(`[ChatStream] Retrying ${reqTag} without stream_options/temperature`);
        response = await callOpenAiStream(false, !lower.includes('temperature') && !isReasoningModel);
        console.log(`[ChatStream] Upstream OpenAI-compatible retry response (${reqTag}): status=${response.status} content-type=${response.headers.get('content-type') || 'unknown'}`);
      } else {
        finalizeAndSave('error');
        console.warn(`[ChatStream] Upstream HTTP ${response.status} (${reqTag}): ${firstErrMsg.slice(0, 160)}`);
        const { isApiKeyError, errorCode, friendlyMessage } = classifyError({ message: firstErrMsg, status: response.status });
        safeWriteSse(
          `data: ${JSON.stringify({
            error: friendlyMessage || firstErrMsg,
            errorCode,
            errorType: isApiKeyError ? 'INVALID_OR_EXPIRED_KEY' : 'GENERAL_ERROR',
          })}\n\n`
        );
        safeWriteSse('data: [DONE]\n\n');
        return safeEndSse();
      }
    }

    if (!response.ok) {
      finalizeAndSave('error');
      const errorText = await response.text();
      const parsedError = parseProviderErrorBody(errorText);
      console.warn(`[ChatStream] Upstream HTTP ${response.status} (${reqTag}): ${parsedError.slice(0, 160)}`);
      const { isApiKeyError, errorCode, friendlyMessage } = classifyError({ message: parsedError, status: response.status });
      safeWriteSse(
        `data: ${JSON.stringify({
          error: friendlyMessage || parsedError,
          errorCode,
          errorType: isApiKeyError ? 'INVALID_OR_EXPIRED_KEY' : 'GENERAL_ERROR',
        })}\n\n`
      );
      safeWriteSse('data: [DONE]\n\n');
      return safeEndSse();
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('application/json')) {
      const jsonBody = await response.json();
      if (jsonBody?.error) {
        throw new Error(jsonBody.error?.message || jsonBody.message || 'Provider returned an error.');
      }
      const text =
        jsonBody?.choices?.[0]?.message?.content ??
        jsonBody?.choices?.[0]?.text ??
        jsonBody?.output_text ??
        '';
      if (jsonBody?.usage) {
        inputTokens = jsonBody.usage.prompt_tokens || 0;
        outputTokens = jsonBody.usage.completion_tokens || 0;
        totalTokens = jsonBody.usage.total_tokens || inputTokens + outputTokens;
        cachedTokens = jsonBody.usage.prompt_tokens_details?.cached_tokens || 0;
        reasoningTokens = jsonBody.usage.completion_tokens_details?.reasoning_tokens || 0;
        if (totalTokens > 0) usageSource = 'provider';
      }
      if (!String(text).trim()) {
        const emptyErr: any = new Error('AI provider returned an empty response.');
        emptyErr.code = 'EMPTY_PROVIDER_RESPONSE';
        throw emptyErr;
      }
      fullAiText = String(text);
      safeWriteSse(`data: ${JSON.stringify({ text: fullAiText })}\n\n`);
      finalizeAndSave('success');
      safeWriteSse('data: [DONE]\n\n');
      return safeEndSse();
    }

    if (!response.body) {
      throw new Error('AI server did not open response stream.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    const processOpenAiLine = (rawLine: string): boolean => {
      const trimmed = rawLine.trim();
      if (!trimmed.startsWith('data:')) return false;
      const dataStr = trimmed.slice(5).trim();
      if (dataStr === '[DONE]') return true;
      if (!dataStr) return false;

      const parsed = JSON.parse(dataStr);
      if (parsed.error) {
        throw new Error(parsed.error?.message || parsed.message || 'Upstream provider stream error.');
      }
      if (parsed.usage) {
        inputTokens = parsed.usage.prompt_tokens || 0;
        outputTokens = parsed.usage.completion_tokens || 0;
        totalTokens = parsed.usage.total_tokens || inputTokens + outputTokens;
        cachedTokens = parsed.usage.prompt_tokens_details?.cached_tokens || 0;
        reasoningTokens = parsed.usage.completion_tokens_details?.reasoning_tokens || 0;
        usageSource = 'provider';
      }

      const textChunk =
        parsed.choices?.[0]?.delta?.content ??
        parsed.choices?.[0]?.message?.content ??
        '';
      if (textChunk) {
        fullAiText += textChunk;
        safeWriteSse(`data: ${JSON.stringify({ text: textChunk })}\n\n`);
      }
      return false;
    };

    let streamDone = false;
    while (!streamDone && !clientDisconnected) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        try {
          if (processOpenAiLine(line)) {
            streamDone = true;
            break;
          }
        } catch (lineErr: any) {
          if (lineErr instanceof SyntaxError) continue;
          throw lineErr;
        }
      }
    }

    if (clientDisconnected) {
      await reader.cancel().catch(() => {});
      finalizeAndSave(fullAiText.trim() ? 'aborted' : 'error');
      return safeEndSse();
    }

    if (buffer.trim()) {
      try {
        processOpenAiLine(buffer);
      } catch (lineErr: any) {
        if (!(lineErr instanceof SyntaxError)) throw lineErr;
      }
    }

    if (!fullAiText.trim()) {
      const emptyErr: any = new Error('AI provider returned an empty response stream.');
      emptyErr.code = 'EMPTY_PROVIDER_RESPONSE';
      throw emptyErr;
    }

    finalizeAndSave('success');
    safeWriteSse('data: [DONE]\n\n');
    return safeEndSse();
  } catch (error: any) {
    if (clientDisconnected) {
      finalizeAndSave(fullAiText.trim() ? 'aborted' : 'error');
      return safeEndSse();
    }
    console.error(`[ChatStream] Upstream error (${reqTag}): ${error?.message || 'Unknown error'}`);
    finalizeAndSave('error');
    const { isApiKeyError, errorCode, friendlyMessage } = classifyError(error);
    safeWriteSse(
      `data: ${JSON.stringify({
        error: friendlyMessage,
        errorCode: error?.code === 'EMPTY_PROVIDER_RESPONSE' ? 'EMPTY_PROVIDER_RESPONSE' : errorCode,
        errorType: isApiKeyError ? 'INVALID_OR_EXPIRED_KEY' : 'GENERAL_ERROR',
      })}\n\n`
    );
    safeWriteSse('data: [DONE]\n\n');
    return safeEndSse();
  }
});

// Serve frontend in production or mount Vite in development
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.resolve(__dirname, 'dist')));
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
  });
} else {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

app.listen(PRIMARY_PORT, '0.0.0.0', () => {
  console.log(`[Server] ChatAI server started and listening on http://0.0.0.0:${PRIMARY_PORT}`);
});

if (PRIMARY_PORT !== 8088) {
  try {
    const secondaryServer = app.listen(8088, '0.0.0.0', () => {
      console.log(`[Server] ChatAI default listener active on http://0.0.0.0:8088`);
    });
    secondaryServer.on('error', (err: any) => {
      console.log(`[Server] Secondary listener on port 8088 note: ${err.message}`);
    });
  } catch {
    // Non-fatal
  }
}
