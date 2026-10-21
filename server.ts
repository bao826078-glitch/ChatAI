import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { dbManager } from './server/db.ts';

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
const DEFAULT_9ROUTER_BASE_URL = 'https://api.9router.com/v1';

// Helper to instantiate Google AI Client
function getGoogleAIClient(customApiKey?: string): GoogleGenAI {
  const apiKey = (customApiKey && customApiKey.trim().length > 0)
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

function classifyError(error: any): { isApiKeyError: boolean; friendlyMessage: string } {
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
      friendlyMessage: 'Khóa API không hợp lệ hoặc đã hết hạn. Vui lòng kiểm tra và cập nhật lại API Key mới để tiếp tục.',
    };
  }

  if (rawMsg.includes('resource_exhausted') || rawMsg.includes('quota') || rawMsg.includes('rate limit') || status === 429) {
    return {
      isApiKeyError: true,
      friendlyMessage: 'Khóa API đã vượt quá hạn mức sử dụng (Quota / Rate Limit). Vui lòng thử lại sau hoặc đổi khóa khác.',
    };
  }

  if (rawMsg.includes('not_found') || rawMsg.includes('404') || rawMsg.includes('no longer available') || status === 404) {
    return {
      isApiKeyError: false,
      friendlyMessage: 'Mô hình này hiện không khả dụng hoặc đã ngừng hỗ trợ. Hệ thống khuyến nghị chọn mô hình hoạt động như gemini-3.8-flash.',
    };
  }

  return {
    isApiKeyError: false,
    friendlyMessage: error?.message || 'Đã xảy ra lỗi khi kết nối với máy chủ AI.',
  };
}

// Configuration endpoint
app.get('/api/config', (_req: Request, res: Response) => {
  const hasValidDefault = Boolean(
    process.env.GEMINI_API_KEY &&
    process.env.GEMINI_API_KEY.trim().length > 0 &&
    process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
  );

  console.log(`[Config] Serving configuration (hasDefaultKey: ${hasValidDefault})`);

  res.json({
    hasDefaultApiKey: hasValidDefault,
    defaultOpenAiUrl: DEFAULT_OPENAI_BASE_URL,
    defaultAnthropicUrl: DEFAULT_ANTHROPIC_BASE_URL,
    default9RouterUrl: DEFAULT_9ROUTER_BASE_URL,
    serverTime: new Date().toISOString(),
  });
});

// Helper to resolve the target base URL
function getTargetBaseUrl(provider: string, baseUrl?: string): string {
  if (baseUrl && baseUrl.trim().length > 0) {
    return baseUrl.trim().replace(/\/+$/, '');
  }
  if (provider === 'openai') return DEFAULT_OPENAI_BASE_URL;
  if (provider === 'claude') return DEFAULT_ANTHROPIC_BASE_URL;
  if (provider === '9router') return DEFAULT_9ROUTER_BASE_URL;
  return '';
}

// Fetch models dynamically from the provided API key (No hardcoded fallback lists)
app.post('/api/models', async (req: Request, res: Response) => {
  try {
    const { apiKey, provider = 'openai', baseUrl } = req.body;
    const activeKey = (apiKey && typeof apiKey === 'string') ? apiKey.trim() : '';

    // Requirement: Empty model list initially until API key is provided
    if (!activeKey) {
      console.log(`[Models] No API key provided for provider "${provider}". Returning empty list.`);
      return res.json({
        ok: true,
        models: [],
        count: 0,
        message: 'Chưa có API Key. Vui lòng nhập API Key để nhận danh sách mô hình từ nhà cung cấp.',
      });
    }

    console.log(`[Models] Fetching live models from API for provider: "${provider}"...`);

    // 1. Google AI Studio (Fetch live models from Google Generative Language API)
    if (provider === 'google') {
      const googleUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${activeKey}`;
      const response = await fetch(googleUrl);

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`[Models] Failed to fetch Google models (HTTP ${response.status}): ${errText.slice(0, 100)}`);
        return res.json({
          ok: false,
          models: [],
          error: `Khóa Google API không hợp lệ hoặc đã hết hạn (Mã lỗi: ${response.status}).`,
        });
      }

      const data = await response.json();
      const rawList: any[] = Array.isArray(data?.models) ? data.models : [];

      // Exclude discontinued/deprecated models and non-text modalities
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

      // Priority sort for modern active Gemini models
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
          description: m.description || `Mô hình Google AI: ${id}`,
          provider: 'google',
        };
      });

      console.log(`[Models] Successfully retrieved ${mapped.length} live models from Google API.`);
      return res.json({
        ok: true,
        models: mapped,
        count: mapped.length,
      });
    }

    // 2. Anthropic Claude (Fetch live models from Anthropic API)
    if (provider === 'claude') {
      const cleanBase = getTargetBaseUrl('claude', baseUrl);
      const response = await fetch(`${cleanBase}/models`, {
        headers: {
          'x-api-key': activeKey,
          'anthropic-version': '2023-06-01',
        },
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`[Models] Failed to fetch Claude models (HTTP ${response.status}): ${errText.slice(0, 100)}`);
        return res.json({
          ok: false,
          models: [],
          error: `Khóa API Claude không hợp lệ hoặc không có quyền truy cập (Mã lỗi: ${response.status}).`,
        });
      }

      const data = await response.json();
      const rawList: any[] = Array.isArray(data?.data) ? data.data : [];

      const mapped = rawList.map((m: any) => ({
        id: m.id,
        name: m.display_name || m.id,
        badge: 'Claude',
        description: `Mô hình Anthropic Claude: ${m.display_name || m.id}`,
        provider: 'claude',
      }));

      console.log(`[Models] Successfully retrieved ${mapped.length} live models from Anthropic API.`);
      return res.json({
        ok: true,
        models: mapped,
        count: mapped.length,
      });
    }

    // 3. OpenAI, 9Router, and Other (Fetch live models via standard /models endpoint)
    const cleanBase = getTargetBaseUrl(provider, baseUrl) || (provider === '9router' ? DEFAULT_9ROUTER_BASE_URL : DEFAULT_OPENAI_BASE_URL);

    const response = await fetch(`${cleanBase}/models`, {
      headers: {
        Authorization: `Bearer ${activeKey}`,
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[Models] Failed to fetch models for "${provider}" (HTTP ${response.status}): ${errText.slice(0, 100)}`);
      return res.json({
        ok: false,
        models: [],
        error: `Không thể lấy danh sách mô hình từ nhà cung cấp (Mã lỗi: ${response.status}). Vui lòng kiểm tra lại API Key hoặc URL.`,
      });
    }

    const data = await response.json();
    const rawList: any[] = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];

    let filteredList = rawList;

    // Filter non-chat models for OpenAI
    if (provider === 'openai') {
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

    const badgeLabel = provider === 'openai' ? 'OpenAI' : provider === '9router' ? '9Router' : 'AI Cung Cấp';

    const mappedModels = filteredList.map((m: any) => {
      const id = typeof m === 'string' ? m : m.id || m.name;
      return {
        id,
        name: id,
        badge: badgeLabel,
        description: m.description || `Mô hình AI: ${id}`,
        provider,
      };
    });

    console.log(`[Models] Successfully retrieved ${mappedModels.length} live models for provider "${provider}".`);
    return res.json({
      ok: true,
      models: mappedModels,
      count: mappedModels.length,
    });
  } catch (error: any) {
    console.error(`[Models] Unexpected error fetching models:`, error?.message);
    return res.json({
      ok: false,
      models: [],
      error: error?.message || 'Lỗi khi tải danh sách mô hình từ máy chủ.',
    });
  }
});

// Verify API key endpoint
app.post('/api/verify-key', async (req: Request, res: Response) => {
  try {
    const { apiKey, provider = 'openai', baseUrl } = req.body;
    const keyToTest = (apiKey && typeof apiKey === 'string') ? apiKey.trim() : '';

    if (!keyToTest) {
      return res.json({
        ok: false,
        errorType: 'INVALID_OR_EXPIRED_KEY',
        error: 'Vui lòng nhập mã API Key để kiểm tra kết nối.',
      });
    }

    console.log(`[Verify] Verifying credentials for provider: "${provider}"...`);

    // 1. Google AI Studio
    if (provider === 'google') {
      const googleUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${keyToTest}`;
      const response = await fetch(googleUrl);

      if (response.ok) {
        const data = await response.json();
        const count = Array.isArray(data?.models) ? data.models.length : 0;
        console.log(`[Verify] Google API key verification passed (found ${count} models).`);
        return res.json({
          ok: true,
          message: `Kết nối thành công với Google AI Studio! Đã xác thực khóa API (tìm thấy ${count} mô hình khả dụng).`,
        });
      } else {
        console.warn(`[Verify] Google API key verification failed with status: ${response.status}`);
        return res.json({
          ok: false,
          errorType: 'INVALID_OR_EXPIRED_KEY',
          error: `Khóa Google API không hợp lệ (Mã phản hồi: ${response.status}).`,
        });
      }
    }

    // 2. Anthropic Claude
    if (provider === 'claude') {
      const cleanBase = getTargetBaseUrl('claude', baseUrl);
      const response = await fetch(`${cleanBase}/models`, {
        headers: {
          'x-api-key': keyToTest,
          'anthropic-version': '2023-06-01',
        },
      });

      if (response.ok) {
        console.log('[Verify] Anthropic Claude API key verification passed.');
        return res.json({
          ok: true,
          message: 'Kết nối thành công với Anthropic Claude! Khóa API của bạn hoạt động bình thường.',
        });
      } else {
        const errText = await response.text();
        console.warn(`[Verify] Anthropic Claude verification failed with status: ${response.status}`);
        return res.json({
          ok: false,
          errorType: 'INVALID_OR_EXPIRED_KEY',
          error: `Khóa API Claude không hợp lệ (Mã: ${response.status}). ${errText.slice(0, 80)}`,
        });
      }
    }

    // 3. OpenAI, 9Router, and Other providers (OpenAI-compatible)
    const cleanBase = getTargetBaseUrl(provider, baseUrl) || (provider === '9router' ? DEFAULT_9ROUTER_BASE_URL : DEFAULT_OPENAI_BASE_URL);

    const response = await fetch(`${cleanBase}/models`, {
      headers: {
        Authorization: `Bearer ${keyToTest}`,
      },
    });

    if (response.ok) {
      const data = await response.json();
      const count = Array.isArray(data?.data) ? data.data.length : 0;
      const providerLabel = provider === 'openai' ? 'OpenAI' : provider === '9router' ? '9Router' : 'máy chủ AI';
      console.log(`[Verify] API key verification passed for "${providerLabel}" (found ${count} models).`);
      return res.json({
        ok: true,
        message: `Kết nối thành công với ${providerLabel}! Khóa API và URL hoạt động bình thường (Tìm thấy ${count} mô hình).`,
      });
    } else {
      const errText = await response.text();
      console.warn(`[Verify] Verification failed for "${provider}" (HTTP ${response.status})`);
      return res.json({
        ok: false,
        errorType: 'INVALID_OR_EXPIRED_KEY',
        error: `Khóa API hoặc địa chỉ URL không hợp lệ (Mã: ${response.status}). ${errText.slice(0, 80)}`,
      });
    }
  } catch (error: any) {
    const { isApiKeyError, friendlyMessage } = classifyError(error);
    console.error(`[Verify] Exception during key verification:`, error?.message);
    return res.json({
      ok: false,
      errorType: isApiKeyError ? 'INVALID_OR_EXPIRED_KEY' : 'GENERAL_ERROR',
      error: friendlyMessage,
    });
  }
});

// ==================== TOKEN ESTIMATOR HELPER ====================
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

// ==================== SQLITE CONVERSATIONS API ====================
app.get('/api/conversations', (_req: Request, res: Response) => {
  try {
    const list = dbManager.getConversations();
    res.json({ ok: true, conversations: list });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/conversations', (req: Request, res: Response) => {
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

app.get('/api/conversations/:id', (req: Request, res: Response) => {
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

app.put('/api/conversations/:id', (req: Request, res: Response) => {
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

app.delete('/api/conversations/:id', (req: Request, res: Response) => {
  try {
    const success = dbManager.deleteConversation(req.params.id);
    res.json({ ok: success });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/conversations/:id/messages', (req: Request, res: Response) => {
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

// Bulk sync endpoint for migrating existing chats to SQLite
app.post('/api/conversations/bulk-sync', (req: Request, res: Response) => {
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

// ==================== SQLITE ANALYTICS API ====================
app.get('/api/analytics/monthly', (req: Request, res: Response) => {
  try {
    const month = typeof req.query.month === 'string' ? req.query.month : undefined;
    const stats = dbManager.getMonthlyAnalytics(month);
    res.json({ ok: true, ...stats });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/analytics/summary', (req: Request, res: Response) => {
  try {
    const count = Number(req.query.count) || 6;
    const summary = dbManager.getRecentMonthsSummary(count);
    res.json({ ok: true, summary });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/analytics/record', (req: Request, res: Response) => {
  try {
    const record = dbManager.recordTokenUsage(req.body);
    res.json({ ok: true, record });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==================== CHAT STREAMING WITH USAGE TRACKING ====================
app.post('/api/chat/stream', async (req: Request, res: Response) => {
  const {
    messages = [],
    model = '',
    systemInstruction,
    temperature = 0.7,
    apiKey,
    provider = 'openai',
    baseUrl,
    conversationId,
    userMessageId,
    aiMessageId,
    requestId,
  } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const activeKey = (apiKey && typeof apiKey === 'string') ? apiKey.trim() : '';
  if (!activeKey) {
    console.warn(`[Stream] Chat stream rejected: Missing API key`);
    res.write(
      `data: ${JSON.stringify({
        error: 'Chưa có API Key. Vui lòng cấu hình API Key trong mục Cài đặt trước khi trò chuyện.',
        errorType: 'INVALID_OR_EXPIRED_KEY',
      })}\n\n`
    );
    res.write('data: [DONE]\n\n');
    return res.end();
  }

  const rawModel = model || (provider === 'google' ? 'gemini-3.8-flash' : provider === 'claude' ? 'claude-3-5-sonnet-20241022' : 'gpt-4o-mini');
  let targetModel = String(rawModel).replace(/^models\//, '').trim();

  // Auto-migrate discontinued/deprecated models to active gemini-3.8-flash
  if (provider === 'google') {
    const deprecated = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-2.0-pro', 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-1.0-pro'];
    if (deprecated.includes(targetModel.toLowerCase())) {
      console.log(`[Stream] Migrating deprecated model "${targetModel}" to "gemini-3.8-flash"`);
      targetModel = 'gemini-3.8-flash';
    }
  }

  console.log(`[Stream] Starting chat stream (provider: "${provider}", model: "${targetModel}", messageCount: ${messages.length})`);

  // Ensure active conversation in SQLite
  const activeConvId = conversationId || 'chat-' + Date.now();
  const lastUserMsg = messages.filter((m: any) => m.role === 'user' || m.sender === 'user').slice(-1)[0];
  const userText = lastUserMsg?.content || '';

  try {
    const existingConv = dbManager.getConversation(activeConvId);
    if (!existingConv) {
      dbManager.createConversation({
        id: activeConvId,
        title: userText ? (userText.slice(0, 32) + (userText.length > 32 ? '...' : '')) : 'Đoạn chat mới',
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

      // Record token usage into SQLite token_usage table (preventing double counting)
      dbManager.recordTokenUsage({
        conversation_id: activeConvId,
        message_id: aiMsgId,
        provider,
        model: targetModel,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
        cached_input_tokens: cachedTokens,
        reasoning_tokens: reasoningTokens,
        usage_source: usageSource,
        request_id: requestId || (activeConvId + '-' + Date.now()),
        status,
      });
    } catch (saveErr) {
      console.error('[Stream] Error saving to SQLite:', saveErr);
    }

    // Send usage payload to client
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
      })}\n\n`
    );
  };

  // 1. Google AI Studio Provider (Text only)
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

        // Capture provider usage metadata from Gemini
        if (chunk.usageMetadata) {
          inputTokens = chunk.usageMetadata.promptTokenCount || inputTokens;
          outputTokens = chunk.usageMetadata.candidatesTokenCount || outputTokens;
          totalTokens = chunk.usageMetadata.totalTokenCount || (inputTokens + outputTokens);
          cachedTokens = chunk.usageMetadata.cachedContentTokenCount || cachedTokens;
          usageSource = 'provider';
        }
      }

      console.log(`[Stream] Google stream completed successfully for model: "${targetModel}"`);
      finalizeAndSave('success');
      res.write('data: [DONE]\n\n');
      return res.end();
    } catch (error: any) {
      finalizeAndSave('error');
      const { isApiKeyError, friendlyMessage } = classifyError(error);
      console.error(`[Stream] Google stream error:`, error?.message);
      res.write(
        `data: ${JSON.stringify({
          error: friendlyMessage,
          errorType: isApiKeyError ? 'INVALID_OR_EXPIRED_KEY' : 'GENERAL_ERROR',
        })}\n\n`
      );
      res.write('data: [DONE]\n\n');
      return res.end();
    }
  }

  // 2. Anthropic Claude Provider (Text only)
  if (provider === 'claude') {
    try {
      const cleanBase = getTargetBaseUrl('claude', baseUrl);
      const formattedClaudeMessages = messages.map((msg: any) => {
        const isAI = msg.role === 'model' || msg.role === 'assistant' || msg.sender === 'ai';
        return {
          role: isAI ? 'assistant' : 'user',
          content: msg.content || ' ',
        };
      });

      const response = await fetch(`${cleanBase}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': activeKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: targetModel,
          max_tokens: 4096,
          system: (systemInstruction && systemInstruction.trim().length > 0) ? systemInstruction.trim() : undefined,
          messages: formattedClaudeMessages,
          temperature: Number(temperature) || 0.7,
          stream: true,
        }),
      });

      if (!response.ok) {
        finalizeAndSave('error');
        const errorText = await response.text();
        console.warn(`[Stream] Claude stream HTTP ${response.status}: ${errorText.slice(0, 100)}`);
        let parsedError = errorText;
        try {
          const parsed = JSON.parse(errorText);
          parsedError = parsed.error?.message || parsed.message || errorText;
        } catch (e) {
          // ignore
        }
        const { isApiKeyError, friendlyMessage } = classifyError({ message: parsedError, status: response.status });
        res.write(
          `data: ${JSON.stringify({
            error: friendlyMessage || parsedError,
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
            if (dataStr === '[DONE]') {
              break;
            }
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
            } catch (err) {
              // ignore json parse of single chunk
            }
          }
        }
      }

      console.log(`[Stream] Claude stream completed successfully for model: "${targetModel}"`);
      finalizeAndSave('success');
      res.write('data: [DONE]\n\n');
      return res.end();
    } catch (error: any) {
      finalizeAndSave('error');
      const { isApiKeyError, friendlyMessage } = classifyError(error);
      console.error(`[Stream] Claude stream error:`, error?.message);
      res.write(
        `data: ${JSON.stringify({
          error: friendlyMessage,
          errorType: isApiKeyError ? 'INVALID_OR_EXPIRED_KEY' : 'GENERAL_ERROR',
        })}\n\n`
      );
      res.write('data: [DONE]\n\n');
      return res.end();
    }
  }

  // 3. OpenAI, 9Router, and Other providers (OpenAI-compatible text streaming)
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

    const cleanBase = getTargetBaseUrl(provider, baseUrl) || (provider === '9router' ? DEFAULT_9ROUTER_BASE_URL : DEFAULT_OPENAI_BASE_URL);

    const response = await fetch(`${cleanBase}/chat/completions`, {
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
    });

    if (!response.ok) {
      finalizeAndSave('error');
      const errorText = await response.text();
      console.warn(`[Stream] "${provider}" stream HTTP ${response.status}: ${errorText.slice(0, 100)}`);
      let parsedError = errorText;
      try {
        const parsed = JSON.parse(errorText);
        parsedError = parsed.error?.message || parsed.message || errorText;
      } catch (e) {
        // ignore
      }
      const { isApiKeyError, friendlyMessage } = classifyError({ message: parsedError, status: response.status });
      res.write(
        `data: ${JSON.stringify({
          error: friendlyMessage || parsedError,
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
          if (dataStr === '[DONE]') {
            break;
          }
          try {
            const parsed = JSON.parse(dataStr);
            // Capture provider usage details if available from OpenAI stream_options
            if (parsed.usage) {
              inputTokens = parsed.usage.prompt_tokens || 0;
              outputTokens = parsed.usage.completion_tokens || 0;
              totalTokens = parsed.usage.total_tokens || (inputTokens + outputTokens);
              cachedTokens = parsed.usage.prompt_tokens_details?.cached_tokens || 0;
              reasoningTokens = parsed.usage.completion_tokens_details?.reasoning_tokens || 0;
              usageSource = 'provider';
            }

            const textChunk = parsed.choices?.[0]?.delta?.content || '';
            if (textChunk) {
              fullAiText += textChunk;
              res.write(`data: ${JSON.stringify({ text: textChunk })}\n\n`);
            }
          } catch (err) {
            // ignore chunk error
          }
        }
      }
    }

    console.log(`[Stream] "${provider}" stream completed successfully for model: "${targetModel}"`);
    finalizeAndSave('success');
    res.write('data: [DONE]\n\n');
    return res.end();
  } catch (error: any) {
    finalizeAndSave('error');
    const { isApiKeyError, friendlyMessage } = classifyError(error);
    console.error(`[Stream] "${provider}" stream error:`, error?.message);
    res.write(
      `data: ${JSON.stringify({
        error: friendlyMessage,
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

const primaryServer = app.listen(PRIMARY_PORT, '0.0.0.0', () => {
  console.log(`[Server] ChatAI server started and listening on http://0.0.0.0:${PRIMARY_PORT}`);
});

if (PRIMARY_PORT !== 8088) {
  try {
    const secondaryServer = app.listen(8088, '0.0.0.0', () => {
      console.log(`[Server] ChatAI npm default listener active on http://0.0.0.0:8088`);
    });
    secondaryServer.on('error', (err: any) => {
      console.log(`[Server] Secondary listener on port 8088 note: ${err.message}`);
    });
  } catch (err: any) {
    // Non-fatal
  }
}
