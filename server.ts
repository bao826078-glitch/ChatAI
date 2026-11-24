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
  const trimmed = (rawUrl || '').trim();
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

function validateCustomEndpointPath(rawEndpoint: string): { valid: boolean; normalized: string; error?: string } {
  const trimmed = (rawEndpoint || '').trim();
  if (!trimmed) return { valid: true, normalized: '' };
  if (trimmed.includes('://') || trimmed.includes('@') || trimmed.includes('\\') || trimmed.includes('..')) {
    return { valid: false, normalized: '', error: 'Invalid API endpoint path.' };
  }
  const normalized = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return { valid: true, normalized };
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

function getGoogleAIClient(customApiKey?: string): GoogleGenAI {
  const apiKey = customApiKey && customApiKey.trim().length > 0
    ? customApiKey.trim()
    : process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    const err: any = new Error('No API Key provided. Please enter a valid API Key to proceed.');
    err.code = 'MISSING_API_KEY';
    throw err;
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function classifyError(error: any): { isApiKeyError: boolean; errorCode: string; friendlyMessage: string } {
  const rawMsg = (error?.message || '').toLowerCase();
  const status = error?.status || error?.statusCode;

  if (
    rawMsg.includes('api_key_invalid') ||
    rawMsg.includes('api key not valid') ||
    rawMsg.includes('api key expired') ||
    rawMsg.includes('unauthenticated') ||
    rawMsg.includes('permission_denied') ||
    rawMsg.includes('authentication_error') ||
    rawMsg.includes('invalid_api_key') ||
    rawMsg.includes('invalid x-api-key') ||
    rawMsg.includes('key has expired') ||
    rawMsg.includes('invalid api key') ||
    rawMsg.includes('invalid_argument') ||
    rawMsg.includes('incorrect api key') ||
    status === 400 ||
    status === 401 ||
    status === 403
  ) {
    return {
      isApiKeyError: true,
      errorCode: 'API_KEY_INVALID',
      friendlyMessage: 'Invalid or expired API key. Please check your provider settings.',
    };
  }

  if (rawMsg.includes('resource_exhausted') || rawMsg.includes('quota') || rawMsg.includes('rate limit') || status === 429) {
    return {
      isApiKeyError: true,
      errorCode: 'PROVIDER_QUOTA_EXHAUSTED',
      friendlyMessage: 'Provider API key rate limit or quota exceeded.',
    };
  }

  if (rawMsg.includes('not_found') || rawMsg.includes('404') || rawMsg.includes('no longer available') || status === 404) {
    return {
      isApiKeyError: false,
      errorCode: 'MODEL_NOT_FOUND',
      friendlyMessage: 'Selected AI model is unavailable or not found.',
    };
  }

  return {
    isApiKeyError: false,
    errorCode: 'PROVIDER_CONNECTION_ERROR',
    friendlyMessage: error?.message || 'Failed to connect to AI provider.',
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

async function testProviderCredentials(params: {
  provider: ApiProviderType;
  apiKey: string;
  baseUrl?: string;
}): Promise<{ ok: boolean; count?: number; errorType?: string; error?: string; message?: string }> {
  const keyToTest = (params.apiKey || '').trim();
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

  if (params.provider === 'google') {
    const googleUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(keyToTest)}`;
    const response = await fetch(googleUrl, { redirect: 'manual' });
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
    return {
      ok: false,
      errorType: 'INVALID_OR_EXPIRED_KEY',
      error: `Invalid Google API key (HTTP ${response.status}).`,
    };
  }

  if (params.provider === 'claude') {
    const cleanBase = getTargetBaseUrl('claude', urlValidation.normalized);
    const response = await fetch(`${cleanBase}/models`, {
      headers: {
        'x-api-key': keyToTest,
        'anthropic-version': '2023-06-01',
      },
      redirect: 'manual',
    });
    if (response.status >= 300 && response.status < 400) {
      return { ok: false, errorType: 'REDIRECT_BLOCKED', error: 'Redirects are disallowed for security.' };
    }
    if (response.ok) {
      return {
        ok: true,
        message: 'Connected to Anthropic Claude successfully.',
      };
    }
    const errText = await response.text();
    return {
      ok: false,
      errorType: 'INVALID_OR_EXPIRED_KEY',
      error: `Anthropic Claude authentication failed (HTTP ${response.status}). ${errText.slice(0, 80)}`,
    };
  }

  const cleanBase =
    getTargetBaseUrl(params.provider, urlValidation.normalized) ||
    (params.provider === '9router' ? DEFAULT_9ROUTER_BASE_URL : DEFAULT_OPENAI_BASE_URL);

  const response = await fetch(`${cleanBase}/models`, {
    headers: {
      Authorization: `Bearer ${keyToTest}`,
    },
    redirect: 'manual',
  });
  if (response.status >= 300 && response.status < 400) {
    return { ok: false, errorType: 'REDIRECT_BLOCKED', error: 'Redirects are disallowed for security.' };
  }

  if (response.ok) {
    const data = await response.json();
    const count = Array.isArray(data?.data) ? data.data.length : 0;
    return {
      ok: true,
      count,
      message: `Connection succeeded (${count} models discovered).`,
    };
  }

  const errText = await response.text();
  return {
    ok: false,
    errorType: 'INVALID_OR_EXPIRED_KEY',
    error: `Provider connection failed (HTTP ${response.status}). ${errText.slice(0, 80)}`,
  };
}

async function fetchProviderModelsList(params: {
  provider: ApiProviderType;
  apiKey: string;
  baseUrl?: string;
}) {
  const activeKey = (params.apiKey || '').trim();
  if (!activeKey) {
    return { ok: true, models: [], count: 0 };
  }

  const urlValidation = validateExternalProviderUrl(params.baseUrl || '');
  if (!urlValidation.valid) {
    return { ok: false, models: [], error: urlValidation.error || 'Invalid Base URL.' };
  }

  if (params.provider === 'google') {
    const googleUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(activeKey)}`;
    const response = await fetch(googleUrl, { redirect: 'manual' });
    if (response.status >= 300 && response.status < 400) {
      return { ok: false, models: [], error: 'Redirects are disallowed for security.' };
    }
    if (!response.ok) {
      return { ok: false, models: [], error: `Google API key invalid or expired (HTTP ${response.status}).` };
    }
    const data = await response.json();
    const rawList: any[] = Array.isArray(data?.models) ? data.models : [];
    const deprecatedModels = [
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-2.0-flash',
      'gemini-2.0-pro',
      'gemini-1.5-flash',
      'gemini-1.5-pro',
      'gemini-1.0-pro',
    ];
    const nonTextKeywords = ['tts', 'image', 'embedding', 'transcribe', 'robotics'];
    const supportedModels = rawList.filter((m: any) => {
      const id = (m.name || '').replace(/^models\//, '').toLowerCase();
      const methods: string[] = Array.isArray(m.supportedGenerationMethods) ? m.supportedGenerationMethods : [];
      if (!methods.includes('generateContent')) return false;
      if (deprecatedModels.includes(id)) return false;
      if (nonTextKeywords.some((kw) => id.includes(kw))) return false;
      return true;
    });

    const priorityOrder = [
      'gemini-3.8-flash',
      'gemini-3.7-flash',
      'gemini-3.6-flash',
      'gemini-3.5-flash',
      'gemini-flash-latest',
      'gemini-3.1-flash-lite',
      'gemini-flash-lite-latest',
      'gemini-pro-latest',
      'gemini-2.5-flash-lite',
      'gemini-4-argon',
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
    const cleanBase = getTargetBaseUrl('claude', urlValidation.normalized);
    const response = await fetch(`${cleanBase}/models`, {
      headers: {
        'x-api-key': activeKey,
        'anthropic-version': '2023-06-01',
      },
      redirect: 'manual',
    });
    if (response.status >= 300 && response.status < 400) {
      return { ok: false, models: [], error: 'Redirects are disallowed for security.' };
    }
    if (!response.ok) {
      return { ok: false, models: [], error: `Anthropic API key invalid (HTTP ${response.status}).` };
    }
    const data = await response.json();
    const rawList: any[] = Array.isArray(data?.data) ? data.data : [];
    const mapped = rawList.map((m: any) => ({
      id: m.id,
      name: m.display_name || m.id,
      badge: 'Claude',
      description: `Anthropic Claude: ${m.display_name || m.id}`,
      provider: 'claude',
    }));
    return { ok: true, models: mapped, count: mapped.length };
  }

  const cleanBase =
    getTargetBaseUrl(params.provider, urlValidation.normalized) ||
    (params.provider === '9router' ? DEFAULT_9ROUTER_BASE_URL : DEFAULT_OPENAI_BASE_URL);

  const response = await fetch(`${cleanBase}/models`, {
    headers: {
      Authorization: `Bearer ${activeKey}`,
    },
    redirect: 'manual',
  });
  if (response.status >= 300 && response.status < 400) {
    return { ok: false, models: [], error: 'Redirects are disallowed for security.' };
  }

  if (!response.ok) {
    return {
      ok: false,
      models: [],
      error: `Unable to fetch models from provider (HTTP ${response.status}).`,
    };
  }

  const data = await response.json();
  const rawList: any[] = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
  let filteredList = rawList;

  if (params.provider === 'openai') {
    const nonChatKeywords = ['whisper', 'tts', 'embedding', 'moderation', 'dall-e', 'davinci', 'babbage', 'curie', 'realtime'];
    filteredList = rawList.filter((m: any) => {
      const id = (typeof m === 'string' ? m : m.id || '').toLowerCase();
      return !nonChatKeywords.some((kw) => id.includes(kw));
    });
    const priorityOrder = ['gpt-4o', 'gpt-4o-mini', 'o1', 'o3-mini', 'o1-mini', 'chatgpt-4o-latest', 'gpt-4.5', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'];
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
      name: id,
      badge: badgeLabel,
      description: m.description || `AI Model: ${id}`,
      provider: params.provider,
    };
  });

  return { ok: true, models: mappedModels, count: mappedModels.length };
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

    const created = dbManager.createProvider({
      name,
      type,
      baseUrl: urlCheck.normalized,
      apiEndpoint: endpointCheck.normalized,
      apiKey: typeof apiKey === 'string' ? apiKey : '',
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

    const updated = dbManager.updateProvider(req.params.id, {
      name,
      type,
      baseUrl: normalizedBaseUrl,
      apiEndpoint: normalizedEndpoint,
      apiKey,
      clearApiKey: Boolean(clearApiKey),
      isDefault,
      status: apiKey ? 'unverified' : undefined,
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
  const deleted = dbManager.deleteProvider(req.params.id);
  if (!deleted) {
    return res.status(404).json({ ok: false, error: 'Provider not found.' });
  }
  res.json({ ok: true, providers: dbManager.listProviders() });
});

app.post('/api/providers/:id/test', requireSession, verifyRateLimit, async (req: Request, res: Response) => {
  try {
    const row = dbManager.getProviderRow(req.params.id);
    if (!row) {
      return res.status(404).json({ ok: false, error: 'Provider not found.' });
    }

    const overrideKey = typeof req.body?.apiKey === 'string' && req.body.apiKey.trim() ? req.body.apiKey.trim() : '';
    const activeKey = overrideKey || dbManager.getDecryptedProviderKey(row.id);

    const result = await testProviderCredentials({
      provider: row.type,
      apiKey: activeKey,
      baseUrl: req.body?.baseUrl !== undefined ? req.body.baseUrl : row.base_url,
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
    const { apiKey, provider = 'openai', baseUrl = '', providerId } = req.body;
    let keyToTest = typeof apiKey === 'string' ? apiKey.trim() : '';
    let provType = provider as ApiProviderType;
    let provUrl = baseUrl;

    if (!keyToTest && providerId) {
      const row = dbManager.getProviderRow(providerId);
      if (row) {
        keyToTest = dbManager.getDecryptedProviderKey(row.id);
        provType = row.type;
        provUrl = provUrl || row.base_url;
      }
    }

    const result = await testProviderCredentials({
      provider: provType,
      apiKey: keyToTest,
      baseUrl: provUrl,
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
    const { apiKey, provider = 'openai', baseUrl = '', providerId } = req.body;
    let activeKey = typeof apiKey === 'string' ? apiKey.trim() : '';
    let provType = provider as ApiProviderType;
    let provUrl = baseUrl;

    if (providerId) {
      const row = dbManager.getProviderRow(providerId);
      if (row) {
        provType = row.type;
        provUrl = provUrl || row.base_url;
        if (!activeKey) {
          activeKey = dbManager.getDecryptedProviderKey(row.id);
        }
      }
    } else if (!activeKey) {
      const def = dbManager.getDefaultProviderRow();
      if (def) {
        provType = def.type;
        provUrl = def.base_url;
        activeKey = dbManager.getDecryptedProviderKey(def.id);
      }
    }

    const customModels = dbManager.listCustomModels(providerId);
    const fetched = await fetchProviderModelsList({
      provider: provType,
      apiKey: activeKey,
      baseUrl: provUrl,
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
  const deleted = dbManager.deleteCustomModel(req.params.id);
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
    const result = dbManager.getConversation(req.params.id);
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
    const updated = dbManager.updateConversation(req.params.id, {
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
    const success = dbManager.deleteConversation(req.params.id);
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
      conversation_id: req.params.id,
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

  // 1. Authoritative server-side license & quota verification BEFORE calling AI provider
  const license = await licenseService.getEffectiveLicenseState(false);
  const reservation = quotaService.reserveRequest(license);

  if (!reservation.allowed) {
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

  const provider: ApiProviderType = providerRow?.type || (bodyProvider as ApiProviderType) || 'openai';
  let activeKey = '';
  try {
    activeKey = providerRow ? dbManager.getDecryptedProviderKey(providerRow.id) : '';
  } catch (decryptErr: any) {
    quotaService.refundFailedRequest(reservation.dateKey, license.plan);
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
    return res.status(400).json({ ok: false, errorCode: 'INVALID_URL', error: customEndpointCheck.error });
  }
  const customEndpointPath = customEndpointCheck.normalized;

  // Fallback to server environment GEMINI_API_KEY only when using Google and no stored provider key exists
  if (!activeKey && provider === 'google' && process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY') {
    activeKey = process.env.GEMINI_API_KEY.trim();
  }

  const urlCheck = validateExternalProviderUrl(activeBaseUrl);
  if (!urlCheck.valid) {
    quotaService.refundFailedRequest(reservation.dateKey, license.plan);
    return res.status(400).json({ ok: false, errorCode: 'INVALID_URL', error: urlCheck.error });
  }
  activeBaseUrl = urlCheck.normalized;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  if (!activeKey) {
    quotaService.refundFailedRequest(reservation.dateKey, license.plan);
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

  const rawModel =
    model ||
    dbManager.getUserSetting('default_model') ||
    (provider === 'google' ? 'gemini-3.8-flash' : provider === 'claude' ? 'claude-3-5-sonnet-20241022' : 'gpt-4o-mini');
  let targetModel = String(rawModel).replace(/^models\//, '').trim();

  if (provider === 'google') {
    const deprecated = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-2.0-pro', 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-1.0-pro'];
    if (deprecated.includes(targetModel.toLowerCase())) {
      targetModel = 'gemini-3.8-flash';
    }
  }

  const activeConvId = conversationId || 'chat-' + Date.now();
  const lastUserMsg = messages.filter((m: any) => m.role === 'user' || m.sender === 'user').slice(-1)[0];
  const userText = lastUserMsg?.content || '';

  try {
    const existingConv = dbManager.getConversation(activeConvId);
    if (!existingConv) {
      dbManager.createConversation({
        id: activeConvId,
        title: userText ? (userText.slice(0, 32) + (userText.length > 32 ? '...' : '')) : 'New chat',
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
        request_id: requestId || activeConvId + '-' + Date.now(),
        status,
      });

      quotaService.addTokensUsed(reservation.dateKey, license.plan, totalTokens);
    } catch (saveErr) {
      console.error('[Stream] Error saving to SQLite:', saveErr);
    }

    const updatedQuota = quotaService.getQuotaStatus(license);
    res.write(
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
      const ai = getGoogleAIClient(activeKey);
      const formattedContents = messages.map((msg: any) => {
        const isModel = msg.role === 'model' || msg.role === 'assistant' || msg.sender === 'ai';
        return {
          role: isModel ? 'model' : 'user',
          parts: [{ text: msg.content || ' ' }],
        };
      });

      const config: any = {
        temperature: Number(temperature) || 0.7,
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
        const chunkText = chunk.text;
        if (chunkText) {
          fullAiText += chunkText;
          res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
        }

        if (chunk.usageMetadata) {
          inputTokens = chunk.usageMetadata.promptTokenCount || inputTokens;
          outputTokens = chunk.usageMetadata.candidatesTokenCount || outputTokens;
          totalTokens = chunk.usageMetadata.totalTokenCount || inputTokens + outputTokens;
          cachedTokens = chunk.usageMetadata.cachedContentTokenCount || cachedTokens;
          usageSource = 'provider';
        }
      }

      finalizeAndSave('success');
      res.write('data: [DONE]\n\n');
      return res.end();
    } catch (error: any) {
      finalizeAndSave('error');
      const { isApiKeyError, errorCode, friendlyMessage } = classifyError(error);
      res.write(
        `data: ${JSON.stringify({
          error: friendlyMessage,
          errorCode,
          errorType: isApiKeyError ? 'INVALID_OR_EXPIRED_KEY' : 'GENERAL_ERROR',
        })}\n\n`
      );
      res.write('data: [DONE]\n\n');
      return res.end();
    }
  }

  // 2. Anthropic Claude Provider
  if (provider === 'claude') {
    try {
      const cleanBase = getTargetBaseUrl('claude', activeBaseUrl);
      const endpointPath = customEndpointPath ? (customEndpointPath.startsWith('/') ? customEndpointPath : `/${customEndpointPath}`) : '/messages';
      const formattedClaudeMessages = messages.map((msg: any) => {
        const isAI = msg.role === 'model' || msg.role === 'assistant' || msg.sender === 'ai';
        return {
          role: isAI ? 'assistant' : 'user',
          content: msg.content || ' ',
        };
      });

      const response = await fetch(`${cleanBase}${endpointPath}`, {
        method: 'POST',
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
          temperature: Number(temperature) || 0.7,
          stream: true,
        }),
        redirect: 'manual',
      });

      if (response.status >= 300 && response.status < 400) {
        finalizeAndSave('error');
        res.write(
          `data: ${JSON.stringify({
            error: 'Provider attempted an HTTP redirect, which is disallowed for security.',
            errorCode: 'PROVIDER_CONNECTION_ERROR',
            errorType: 'GENERAL_ERROR',
          })}\n\n`
        );
        res.write('data: [DONE]\n\n');
        return res.end();
      }

      if (!response.ok) {
        finalizeAndSave('error');
        const errorText = await response.text();
        let parsedError = errorText;
        try {
          const parsed = JSON.parse(errorText);
          parsedError = parsed.error?.message || parsed.message || errorText;
        } catch {
          // ignore
        }
        const { isApiKeyError, errorCode, friendlyMessage } = classifyError({ message: parsedError, status: response.status });
        res.write(
          `data: ${JSON.stringify({
            error: friendlyMessage || parsedError,
            errorCode,
            errorType: isApiKeyError ? 'INVALID_OR_EXPIRED_KEY' : 'GENERAL_ERROR',
          })}\n\n`
        );
        res.write('data: [DONE]\n\n');
        return res.end();
      }

      if (!response.body) {
        throw new Error('Anthropic Claude server did not open response stream.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const dataStr = trimmed.slice(6);
            if (dataStr === '[DONE]') break;
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.type === 'message_start' && parsed.message?.usage) {
                inputTokens = parsed.message.usage.input_tokens || 0;
              }
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                fullAiText += parsed.delta.text;
                res.write(`data: ${JSON.stringify({ text: parsed.delta.text })}\n\n`);
              }
              if (parsed.type === 'message_delta' && parsed.usage) {
                outputTokens = parsed.usage.output_tokens || 0;
                totalTokens = inputTokens + outputTokens;
                usageSource = 'provider';
              }
            } catch {
              // ignore single chunk parse error
            }
          }
        }
      }

      finalizeAndSave('success');
      res.write('data: [DONE]\n\n');
      return res.end();
    } catch (error: any) {
      finalizeAndSave('error');
      const { isApiKeyError, errorCode, friendlyMessage } = classifyError(error);
      res.write(
        `data: ${JSON.stringify({
          error: friendlyMessage,
          errorCode,
          errorType: isApiKeyError ? 'INVALID_OR_EXPIRED_KEY' : 'GENERAL_ERROR',
        })}\n\n`
      );
      res.write('data: [DONE]\n\n');
      return res.end();
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

    const cleanBase =
      getTargetBaseUrl(provider, activeBaseUrl) ||
      (provider === '9router' ? DEFAULT_9ROUTER_BASE_URL : DEFAULT_OPENAI_BASE_URL);
    const endpointPath = customEndpointPath
      ? (customEndpointPath.startsWith('/') ? customEndpointPath : `/${customEndpointPath}`)
      : '/chat/completions';

    const response = await fetch(`${cleanBase}${endpointPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${activeKey}`,
      },
      body: JSON.stringify({
        model: targetModel,
        messages: formattedMessages,
        temperature: Number(temperature) || 0.7,
        stream: true,
        stream_options: { include_usage: true },
      }),
      redirect: 'manual',
    });

    if (response.status >= 300 && response.status < 400) {
      finalizeAndSave('error');
      res.write(
        `data: ${JSON.stringify({
          error: 'Provider attempted an HTTP redirect, which is disallowed for security.',
          errorCode: 'PROVIDER_CONNECTION_ERROR',
          errorType: 'GENERAL_ERROR',
        })}\n\n`
      );
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    if (!response.ok) {
      finalizeAndSave('error');
      const errorText = await response.text();
      let parsedError = errorText;
      try {
        const parsed = JSON.parse(errorText);
        parsedError = parsed.error?.message || parsed.message || errorText;
      } catch {
        // ignore
      }
      const { isApiKeyError, errorCode, friendlyMessage } = classifyError({ message: parsedError, status: response.status });
      res.write(
        `data: ${JSON.stringify({
          error: friendlyMessage || parsedError,
          errorCode,
          errorType: isApiKeyError ? 'INVALID_OR_EXPIRED_KEY' : 'GENERAL_ERROR',
        })}\n\n`
      );
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    if (!response.body) {
      throw new Error('AI server did not open response stream.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          const dataStr = trimmed.slice(6);
          if (dataStr === '[DONE]') break;
          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.usage) {
              inputTokens = parsed.usage.prompt_tokens || 0;
              outputTokens = parsed.usage.completion_tokens || 0;
              totalTokens = parsed.usage.total_tokens || inputTokens + outputTokens;
              cachedTokens = parsed.usage.prompt_tokens_details?.cached_tokens || 0;
              reasoningTokens = parsed.usage.completion_tokens_details?.reasoning_tokens || 0;
              usageSource = 'provider';
            }

            const textChunk = parsed.choices?.[0]?.delta?.content || '';
            if (textChunk) {
              fullAiText += textChunk;
              res.write(`data: ${JSON.stringify({ text: textChunk })}\n\n`);
            }
          } catch {
            // ignore chunk error
          }
        }
      }
    }

    finalizeAndSave('success');
    res.write('data: [DONE]\n\n');
    return res.end();
  } catch (error: any) {
    finalizeAndSave('error');
    const { isApiKeyError, errorCode, friendlyMessage } = classifyError(error);
    res.write(
      `data: ${JSON.stringify({
        error: friendlyMessage,
        errorCode,
        errorType: isApiKeyError ? 'INVALID_OR_EXPIRED_KEY' : 'GENERAL_ERROR',
      })}\n\n`
    );
    res.write('data: [DONE]\n\n');
    return res.end();
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
