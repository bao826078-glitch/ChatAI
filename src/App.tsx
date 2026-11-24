/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Code,
  FileText,
  Languages,
  Bug,
  ArrowRight,
  Bot,
  Server,
  Settings,
  KeyRound,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import {
  ApiProvider,
  AppLanguage,
  AppTheme,
  Conversation,
  CustomModelConfig,
  LicenseInfo,
  MasterKeyStatus,
  Message,
  ModelOption,
  ProviderConfig,
  QuotaInfo,
  SettingsTab,
} from './types';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { ChatMessage } from './components/ChatMessage';
import { ChatInput } from './components/ChatInput';
import { WelcomeScreen } from './components/WelcomeScreen';
import { SettingsModal } from './components/SettingsModal';
import { AnalyticsModal } from './components/AnalyticsModal';
import { HelpModal } from './components/HelpModal';
import { estimateTokens, formatTokenCount } from './utils/tokenEstimator';
import { getStoredLanguage, saveStoredLanguage, translations, translateErrorCode } from './utils/i18n';
import { apiFetch, initSession } from './utils/api';

const DEFAULT_LICENSE: LicenseInfo = {
  plan: 'free',
  status: 'not_activated',
  maskedKey: '',
  productId: '',
  productName: 'ChatAI',
  planName: 'Free',
  entitlements: {
    usageAnalytics: false,
    tokenHistory: false,
    customModels: false,
  },
  activatedAt: null,
  expiresAt: null,
  lastVerifiedAt: null,
  cacheExpiresAt: null,
  graceDays: 0,
  lastError: null,
  keygateConfigured: false,
  usingCachedVerification: false,
};

const DEFAULT_QUOTA: QuotaInfo = {
  plan: 'free',
  dateKey: new Date().toISOString().slice(0, 10),
  chatLimit: 20,
  chatUsed: 0,
  chatRemaining: 20,
  tokenLimit: 50000,
  tokenUsed: 0,
  tokenRemaining: 50000,
  nearLimit: false,
  limitReached: false,
  resetAt: new Date().toISOString(),
};

function makeEmptyConversation(lang: AppLanguage, model = '', provider?: ApiProvider): Conversation {
  const now = Date.now();
  return {
    id: `chat-${now}`,
    title: lang === 'vi' ? 'Đoạn chat mới' : 'New chat',
    createdAt: now,
    updatedAt: now,
    messages: [],
    model,
    provider,
  };
}

export default function App() {
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [language, setLanguage] = useState<AppLanguage>(getStoredLanguage);
  const [theme, setTheme] = useState<AppTheme>('dark');

  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [activeProviderId, setActiveProviderId] = useState<string>('');
  const [customModels, setCustomModels] = useState<CustomModelConfig[]>([]);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [hasDefaultEnvKey, setHasDefaultEnvKey] = useState(false);

  const [temperature, setTemperature] = useState<number>(0.7);
  const [systemInstruction, setSystemInstruction] = useState<string>('');
  const [sendOnEnter, setSendOnEnter] = useState<boolean>(true);
  const [compactMode, setCompactMode] = useState<boolean>(false);

  const [license, setLicense] = useState<LicenseInfo>(DEFAULT_LICENSE);
  const [quota, setQuota] = useState<QuotaInfo>(DEFAULT_QUOTA);
  const [keyStatus, setKeyStatus] = useState<MasterKeyStatus | null>(null);
  const [welcomeDismissed, setWelcomeDismissed] = useState<boolean>(false);
  const [forceShowWelcome, setForceShowWelcome] = useState<boolean>(false);

  const [conversations, setConversations] = useState<Conversation[]>(() => [
    makeEmptyConversation(getStoredLanguage()),
  ]);
  const [currentChatId, setCurrentChatId] = useState<string>('');

  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(() => {
    if (typeof window !== 'undefined') return window.innerWidth >= 768;
    return true;
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('providers');
  const [isAnalyticsModalOpen, setIsAnalyticsModalOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const t = translations[language] || translations.en;

  // Apply Dark/Light theme and HTML lang attribute
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const activeProvider = useMemo(
    () => providers.find((p) => p.id === activeProviderId) || providers.find((p) => p.isDefault) || providers[0],
    [providers, activeProviderId]
  );

  const hasReadyProvider = Boolean(
    activeProvider?.hasApiKey ||
      providers.some((p) => p.hasApiKey) ||
      (hasDefaultEnvKey && (!activeProvider || activeProvider.type === 'google'))
  );

  const persistUserSettings = useCallback(async (patch: Record<string, string>) => {
    try {
      await apiFetch('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({ settings: patch }),
      });
    } catch (err) {
      console.warn('Settings sync note:', err);
    }
  }, []);

  const handleLanguageChange = useCallback(
    (newLang: AppLanguage) => {
      setLanguage(newLang);
      saveStoredLanguage(newLang);
      void persistUserSettings({ language: newLang });
    },
    [persistUserSettings]
  );

  const handleThemeChange = useCallback(
    (newTheme: AppTheme) => {
      setTheme(newTheme);
      void persistUserSettings({ theme: newTheme });
    },
    [persistUserSettings]
  );

  const refreshModels = useCallback(
    async (providerIdOverride?: string, preferredModel?: string) => {
      const targetId = providerIdOverride || activeProviderId || activeProvider?.id || '';
      if (!targetId && !hasDefaultEnvKey) {
        setModels([]);
        return;
      }

      setIsFetchingModels(true);
      try {
        const res = await apiFetch('/api/models', {
          method: 'POST',
          body: JSON.stringify({
            providerId: targetId || undefined,
            provider: !targetId && hasDefaultEnvKey ? 'google' : undefined,
          }),
        });
        const data = await res.json();
        if (data.ok && Array.isArray(data.models)) {
          setModels(data.models);
          const candidateModel = preferredModel ?? selectedModel;
          if (data.models.length > 0) {
            if (!candidateModel || !data.models.some((m: ModelOption) => m.id === candidateModel)) {
              setSelectedModel(data.models[0].id);
            }
          }
        } else {
          setModels([]);
        }
      } catch (err) {
        console.warn('Model fetch note:', err);
      } finally {
        setIsFetchingModels(false);
      }
    },
    [activeProviderId, activeProvider?.id, hasDefaultEnvKey, selectedModel]
  );

  // Bootstrap session, settings, providers, license, quota, and SQLite conversations
  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const [configData, sessionData] = await Promise.all([
          fetch('/api/config').then((r) => r.json()).catch(() => ({})),
          initSession(),
        ]);

        if (cancelled) return;

        const envGeminiKey = Boolean(configData?.hasDefaultApiKey);
        setHasDefaultEnvKey(envGeminiKey);

        let loadedProviders: ProviderConfig[] = Array.isArray(sessionData?.providers) ? sessionData.providers : [];
        let loadedSettings: Record<string, string> = sessionData?.settings || {};

        // Migrate legacy browser-stored API key once into backend encrypted SQLite storage
        if (loadedProviders.length === 0) {
          try {
            const legacyKey = localStorage.getItem('ai_custom_api_key')?.trim() || '';
            const legacyProvider = (localStorage.getItem('ai_provider') as ApiProvider) || 'openai';
            const legacyBaseUrl = localStorage.getItem('ai_base_url') || '';
            if (legacyKey) {
              const migrateRes = await apiFetch('/api/providers', {
                method: 'POST',
                body: JSON.stringify({
                  name:
                    legacyProvider === 'google'
                      ? 'Google Gemini'
                      : legacyProvider === 'claude'
                      ? 'Anthropic Claude'
                      : legacyProvider === '9router'
                      ? '9Router'
                      : 'Primary Provider',
                  type: ['openai', 'google', 'claude', '9router', 'other'].includes(legacyProvider)
                    ? legacyProvider
                    : 'openai',
                  baseUrl: legacyBaseUrl,
                  apiKey: legacyKey,
                  isDefault: true,
                }),
              });
              const migrateJson = await migrateRes.json();
              if (migrateJson.ok && Array.isArray(migrateJson.providers)) {
                loadedProviders = migrateJson.providers;
                localStorage.removeItem('ai_custom_api_key');
              }
            }
            localStorage.removeItem('ai_provider');
            localStorage.removeItem('ai_base_url');
            localStorage.removeItem('chat_ai_analytics_logs');
          } catch {
            // ignore legacy migration error
          }
        }

        if (cancelled) return;

        const resolvedLang: AppLanguage = loadedSettings.language === 'vi' ? 'vi' : 'en';
        setLanguage(resolvedLang);
        saveStoredLanguage(resolvedLang);

        const resolvedTheme: AppTheme = loadedSettings.theme === 'light' ? 'light' : 'dark';
        setTheme(resolvedTheme);

        if (loadedSettings.temperature !== undefined) {
          const parsedTemp = Number(loadedSettings.temperature);
          if (!Number.isNaN(parsedTemp)) setTemperature(parsedTemp);
        }
        if (loadedSettings.system_instruction !== undefined) {
          setSystemInstruction(loadedSettings.system_instruction);
        }
        if (loadedSettings.send_on_enter !== undefined) {
          setSendOnEnter(loadedSettings.send_on_enter !== 'false');
        }
        if (loadedSettings.compact_mode !== undefined) {
          setCompactMode(loadedSettings.compact_mode === 'true');
        }

        setWelcomeDismissed(loadedSettings.welcome_dismissed === 'true');
        if (sessionData?.license) setLicense(sessionData.license);
        if (sessionData?.quota) setQuota(sessionData.quota);
        if (sessionData?.keyStatus) setKeyStatus(sessionData.keyStatus);
        if (Array.isArray(sessionData?.customModels)) setCustomModels(sessionData.customModels);

        setProviders(loadedProviders);
        const defaultProv =
          loadedProviders.find((p) => p.id === loadedSettings.active_provider_id) ||
          loadedProviders.find((p) => p.isDefault) ||
          loadedProviders[0];
        const nextActiveProvId = defaultProv?.id || '';
        setActiveProviderId(nextActiveProvId);

        const savedDefaultModel = loadedSettings.default_model || '';
        if (savedDefaultModel) setSelectedModel(savedDefaultModel);

        // Fetch initial models if provider or default key exists
        if (defaultProv?.hasApiKey || envGeminiKey || (sessionData?.customModels || []).length > 0) {
          setIsFetchingModels(true);
          try {
            const modRes = await apiFetch('/api/models', {
              method: 'POST',
              body: JSON.stringify({
                providerId: nextActiveProvId || undefined,
                provider: !nextActiveProvId && envGeminiKey ? 'google' : undefined,
              }),
            });
            const modData = await modRes.json();
            if (!cancelled && modData.ok && Array.isArray(modData.models)) {
              setModels(modData.models);
              if (modData.models.length > 0) {
                const chosen =
                  savedDefaultModel && modData.models.some((m: ModelOption) => m.id === savedDefaultModel)
                    ? savedDefaultModel
                    : modData.models[0].id;
                setSelectedModel(chosen);
              }
            }
          } catch {
            // ignore
          } finally {
            if (!cancelled) setIsFetchingModels(false);
          }
        }

        // Load conversations from SQLite
        const convRes = await apiFetch('/api/conversations');
        const convData = await convRes.json();
        if (!cancelled && convData.ok && Array.isArray(convData.conversations) && convData.conversations.length > 0) {
          const firstId = convData.conversations[0].id;
          const detailRes = await apiFetch(`/api/conversations/${firstId}`);
          const detail = await detailRes.json();

          const mapped: Conversation[] = convData.conversations.map((c: any) => ({
            id: c.id,
            title: c.title,
            createdAt: new Date(c.created_at).getTime(),
            updatedAt: new Date(c.updated_at).getTime(),
            messages:
              c.id === firstId && detail.ok && Array.isArray(detail.messages)
                ? detail.messages.map((m: any) => ({
                    id: m.id,
                    sender: m.sender || (m.role === 'user' ? 'user' : 'ai'),
                    role: m.role || 'user',
                    content: m.content,
                    timestamp: new Date(m.created_at).getTime(),
                    estimatedTokens: estimateTokens(m.content),
                  }))
                : [],
            model: c.model || '',
            provider: c.provider || 'openai',
            systemInstruction: c.system_instruction || '',
          }));

          setConversations(mapped);
          setCurrentChatId(firstId);
        } else {
          // One-time sync of legacy localStorage conversations if SQLite is empty
          let synced = false;
          try {
            const localSaved = localStorage.getItem('ai_chat_conversations');
            if (localSaved) {
              const parsed = JSON.parse(localSaved);
              if (Array.isArray(parsed) && parsed.some((c: any) => Array.isArray(c.messages) && c.messages.length > 0)) {
                await apiFetch('/api/conversations/bulk-sync', {
                  method: 'POST',
                  body: JSON.stringify({ conversations: parsed }),
                });
                const refreshed = await apiFetch('/api/conversations');
                const refreshedData = await refreshed.json();
                if (!cancelled && refreshedData.ok && Array.isArray(refreshedData.conversations) && refreshedData.conversations.length > 0) {
                  const firstId = refreshedData.conversations[0].id;
                  const dRes = await apiFetch(`/api/conversations/${firstId}`);
                  const dData = await dRes.json();
                  const mapped: Conversation[] = refreshedData.conversations.map((c: any) => ({
                    id: c.id,
                    title: c.title,
                    createdAt: new Date(c.created_at).getTime(),
                    updatedAt: new Date(c.updated_at).getTime(),
                    messages:
                      c.id === firstId && dData.ok && Array.isArray(dData.messages)
                        ? dData.messages.map((m: any) => ({
                            id: m.id,
                            sender: m.sender || (m.role === 'user' ? 'user' : 'ai'),
                            role: m.role || 'user',
                            content: m.content,
                            timestamp: new Date(m.created_at).getTime(),
                            estimatedTokens: estimateTokens(m.content),
                          }))
                        : [],
                    model: c.model || '',
                    provider: c.provider || 'openai',
                    systemInstruction: c.system_instruction || '',
                  }));
                  setConversations(mapped);
                  setCurrentChatId(firstId);
                  synced = true;
                }
              }
            }
          } catch {
            // ignore
          }

          if (!synced && !cancelled) {
            const initial = makeEmptyConversation(resolvedLang, savedDefaultModel, defaultProv?.type);
            setConversations([initial]);
            setCurrentChatId(initial.id);
          }
        }
      } catch (err) {
        console.error('Bootstrap error:', err);
      } finally {
        if (!cancelled) setIsBootstrapping(false);
      }
    };

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const currentChat = useMemo(
    () => conversations.find((c) => c.id === currentChatId) || conversations[0],
    [conversations, currentChatId]
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentChat?.messages, isStreaming]);

  const totalSessionTokens = useMemo(() => {
    if (!currentChat?.messages) return 0;
    return currentChat.messages.reduce((acc, m) => acc + (m.estimatedTokens || estimateTokens(m.content)), 0);
  }, [currentChat?.messages]);

  const openSettings = (tab: SettingsTab = 'providers') => {
    setSettingsTab(tab);
    setIsSettingsOpen(true);
  };

  // ==================== PROVIDER & MODEL HANDLERS ====================

  const handleSelectActiveProvider = async (providerId: string) => {
    setActiveProviderId(providerId);
    await persistUserSettings({ active_provider_id: providerId });
    await refreshModels(providerId);
  };

  const handleCreateProvider = async (payload: {
    name: string;
    type: ApiProvider;
    baseUrl: string;
    apiEndpoint: string;
    apiKey: string;
    isDefault: boolean;
  }) => {
    const res = await apiFetch('/api/providers', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.ok) return { ok: false, error: data.error };

    setProviders(data.providers || []);
    if (data.provider && (data.provider.isDefault || providers.length === 0)) {
      setActiveProviderId(data.provider.id);
      await persistUserSettings({ active_provider_id: data.provider.id });
      await refreshModels(data.provider.id);
    }
    return { ok: true };
  };

  const handleUpdateProvider = async (
    id: string,
    payload: {
      name?: string;
      type?: ApiProvider;
      baseUrl?: string;
      apiEndpoint?: string;
      apiKey?: string;
      isDefault?: boolean;
    }
  ) => {
    const res = await apiFetch(`/api/providers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.ok) return { ok: false, error: data.error };

    setProviders(data.providers || []);
    if (id === activeProviderId || data.provider?.isDefault) {
      if (data.provider?.isDefault) {
        setActiveProviderId(data.provider.id);
        await persistUserSettings({ active_provider_id: data.provider.id });
      }
      await refreshModels(data.provider?.id || id);
    }
    return { ok: true };
  };

  const handleDeleteProvider = async (id: string) => {
    const res = await apiFetch(`/api/providers/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.ok) return { ok: false, error: data.error };

    const nextList: ProviderConfig[] = data.providers || [];
    setProviders(nextList);
    if (id === activeProviderId) {
      const nextDefault = nextList.find((p) => p.isDefault) || nextList[0];
      const nextId = nextDefault?.id || '';
      setActiveProviderId(nextId);
      await persistUserSettings({ active_provider_id: nextId });
      await refreshModels(nextId);
    }
    return { ok: true };
  };

  const handleTestProvider = async (id: string) => {
    const res = await apiFetch(`/api/providers/${id}/test`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (Array.isArray(data.providers)) {
      setProviders(data.providers);
    }
    if (data.ok && id === activeProviderId) {
      await refreshModels(id);
    }
    return { ok: Boolean(data.ok), message: data.message, error: data.error };
  };

  const handleSelectModel = (modelId: string) => {
    setSelectedModel(modelId);
    void persistUserSettings({ default_model: modelId });
  };

  const handleAddCustomModel = async (payload: {
    providerId: string;
    modelId: string;
    displayName?: string;
    isDefault?: boolean;
  }) => {
    const res = await apiFetch('/api/custom-models', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.ok) return { ok: false, error: data.error };
    setCustomModels(data.customModels || []);
    return { ok: true };
  };

  const handleDeleteCustomModel = async (id: string) => {
    const res = await apiFetch(`/api/custom-models/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.ok) {
      setCustomModels(data.customModels || []);
      await refreshModels(activeProviderId);
    }
  };

  // ==================== LICENSE & WELCOME HANDLERS ====================

  const handleActivateLicense = async (licenseKey: string) => {
    const res = await apiFetch('/api/license/activate', {
      method: 'POST',
      body: JSON.stringify({ licenseKey }),
    });
    const data = await res.json();
    if (data.license) setLicense(data.license);
    if (data.quota) setQuota(data.quota);
    if (data.ok) {
      setWelcomeDismissed(true);
      await persistUserSettings({ welcome_dismissed: 'true' });
    }
    return data;
  };

  const handleVerifyLicense = async (licenseKey?: string) => {
    const res = await apiFetch('/api/license/verify', {
      method: 'POST',
      body: JSON.stringify({ licenseKey }),
    });
    const data = await res.json();
    if (data.license) setLicense(data.license);
    if (data.quota) setQuota(data.quota);
    return data;
  };

  const handleDeactivateLicense = async () => {
    const res = await apiFetch('/api/license/deactivate', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (data.license) setLicense(data.license);
    if (data.quota) setQuota(data.quota);
    return data;
  };

  const handleSkipWelcome = async () => {
    const res = await apiFetch('/api/license/skip-welcome', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (data.license) setLicense(data.license);
    if (data.quota) setQuota(data.quota);
    setWelcomeDismissed(true);
    setForceShowWelcome(false);
  };

  // ==================== MASTER KEY SECURITY HANDLERS ====================

  const handleRefreshKeyStatus = useCallback(async () => {
    try {
      const res = await apiFetch('/api/security/key-status');
      const data = await res.json();
      if (data.ok && data.keyStatus) {
        setKeyStatus(data.keyStatus);
      }
    } catch {
      // ignore
    }
  }, []);

  const handleBackupMasterKey = async (passphrase: string) => {
    const res = await apiFetch('/api/security/key/backup', {
      method: 'POST',
      body: JSON.stringify({ passphrase }),
    });
    const data = await res.json();
    if (data.keyStatus) setKeyStatus(data.keyStatus);
    return data;
  };

  const handleRestoreMasterKey = async (backupContent: string, passphrase?: string) => {
    const res = await apiFetch('/api/security/key/restore', {
      method: 'POST',
      body: JSON.stringify({ backupContent, passphrase }),
    });
    const data = await res.json();
    if (data.keyStatus) setKeyStatus(data.keyStatus);
    if (data.license) setLicense(data.license);
    if (data.quota) setQuota(data.quota);
    if (data.ok && activeProviderId) {
      await refreshModels(activeProviderId);
    }
    return data;
  };

  const handleRotateMasterKey = async () => {
    const res = await apiFetch('/api/security/key/rotate', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (data.keyStatus) setKeyStatus(data.keyStatus);
    return data;
  };

  // ==================== CONVERSATION HANDLERS ====================

  const handleSelectChat = async (id: string) => {
    setCurrentChatId(id);
    const target = conversations.find((c) => c.id === id);
    if (target && (!target.messages || target.messages.length === 0)) {
      try {
        const res = await apiFetch(`/api/conversations/${id}`);
        const data = await res.json();
        if (data.ok && Array.isArray(data.messages)) {
          const msgs: Message[] = data.messages.map((m: any) => ({
            id: m.id,
            sender: m.sender || (m.role === 'user' ? 'user' : 'ai'),
            role: m.role || 'user',
            content: m.content,
            timestamp: new Date(m.created_at).getTime(),
            estimatedTokens: estimateTokens(m.content),
          }));
          setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, messages: msgs } : c)));
        }
      } catch (err) {
        console.warn('Error fetching conversation messages:', err);
      }
    }
  };

  const handleNewChat = () => {
    const fresh = makeEmptyConversation(language, selectedModel, activeProvider?.type);
    setConversations((prev) => [fresh, ...prev]);
    setCurrentChatId(fresh.id);

    apiFetch('/api/conversations', {
      method: 'POST',
      body: JSON.stringify({
        id: fresh.id,
        title: fresh.title,
        model: selectedModel,
        provider: activeProvider?.type || 'openai',
        system_instruction: systemInstruction,
      }),
    }).catch(console.warn);
  };

  const handleClearCurrentChat = () => {
    if (!currentChat) return;
    apiFetch(`/api/conversations/${currentChat.id}`, { method: 'DELETE' }).catch(console.warn);

    const freshTitle = language === 'vi' ? 'Đoạn chat mới' : 'New chat';
    setConversations((prev) =>
      prev.map((c) =>
        c.id === currentChat.id
          ? {
              ...c,
              messages: [],
              title: freshTitle,
              updatedAt: Date.now(),
            }
          : c
      )
    );
  };

  const handleDeleteChat = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    apiFetch(`/api/conversations/${id}`, { method: 'DELETE' }).catch(console.warn);

    if (conversations.length <= 1) {
      handleClearCurrentChat();
      return;
    }
    const remaining = conversations.filter((c) => c.id !== id);
    setConversations(remaining);
    if (currentChatId === id) {
      setCurrentChatId(remaining[0].id);
    }
  };

  const handleRenameChat = (id: string, newTitle: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title: newTitle, updatedAt: Date.now() } : c))
    );
    apiFetch(`/api/conversations/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ title: newTitle }),
    }).catch(console.warn);
  };

  const handleClearAllChats = () => {
    conversations.forEach((c) => {
      apiFetch(`/api/conversations/${c.id}`, { method: 'DELETE' }).catch(console.warn);
    });
    const fresh = makeEmptyConversation(language, selectedModel, activeProvider?.type);
    setConversations([fresh]);
    setCurrentChatId(fresh.id);

    apiFetch('/api/conversations', {
      method: 'POST',
      body: JSON.stringify({
        id: fresh.id,
        title: fresh.title,
        model: selectedModel,
        provider: activeProvider?.type || 'openai',
        system_instruction: systemInstruction,
      }),
    }).catch(console.warn);
  };

  // ==================== CHAT STREAMING ====================

  const handleSendMessage = async (text: string) => {
    if (!currentChat || isStreaming) return;

    if (quota.limitReached) {
      openSettings('license');
      return;
    }

    if (!hasReadyProvider) {
      openSettings('providers');
      return;
    }

    const timestampNow = Date.now();
    const inputEstimatedTokens = estimateTokens(text);

    const userMessage: Message = {
      id: `msg-${timestampNow}`,
      sender: 'user',
      role: 'user',
      content: text,
      timestamp: timestampNow,
      estimatedTokens: inputEstimatedTokens,
    };

    const aiMessageId = `msg-ai-${timestampNow + 1}`;
    const placeholderAiMessage: Message = {
      id: aiMessageId,
      sender: 'ai',
      role: 'model',
      content: '',
      timestamp: timestampNow + 1,
      modelUsed: selectedModel,
      isStreaming: true,
      estimatedTokens: 0,
    };

    const isFirstMessage = currentChat.messages.length === 0;
    const computedTitle = isFirstMessage
      ? text.slice(0, 32) + (text.length > 32 ? '...' : '')
      : currentChat.title;

    setConversations((prev) =>
      prev.map((c) =>
        c.id === currentChat.id
          ? {
              ...c,
              title: computedTitle,
              messages: [...c.messages, userMessage, placeholderAiMessage],
              updatedAt: timestampNow,
              model: selectedModel,
              provider: activeProvider?.type,
            }
          : c
      )
    );

    setIsStreaming(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    let detectedErrorType = 'GENERAL_ERROR';

    try {
      const historyPayload = currentChat.messages
        .filter((m) => !m.error)
        .map((m) => ({
          role: m.sender === 'user' || m.role === 'user' ? 'user' : 'model',
          content: m.content,
        }));

      historyPayload.push({
        role: 'user',
        content: text,
      });

      const response = await apiFetch('/api/chat/stream', {
        method: 'POST',
        body: JSON.stringify({
          messages: historyPayload,
          model: selectedModel,
          systemInstruction,
          temperature,
          providerId: activeProvider?.id,
          provider: activeProvider?.type || (hasDefaultEnvKey ? 'google' : 'openai'),
          conversationId: currentChat.id,
          userMessageId: userMessage.id,
          aiMessageId,
          requestId: `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        let errJson: any = {};
        try {
          errJson = await response.json();
        } catch {
          // ignore
        }
        if (errJson.quota) setQuota(errJson.quota);
        if (errJson.errorCode === 'QUOTA_EXCEEDED') {
          detectedErrorType = 'QUOTA_EXCEEDED';
          throw new Error(translateErrorCode(language, 'QUOTA_EXCEEDED', errJson.error));
        }
        throw new Error(translateErrorCode(language, errJson.errorCode, errJson.error || `HTTP ${response.status}`));
      }

      if (!response.body) {
        throw new Error(language === 'vi' ? 'Không thể đọc luồng phản hồi.' : 'Unable to read response stream.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let accumulatedText = '';
      let buffer = '';
      let realUsageTotal: number | null = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;

          const dataStr = trimmed.slice(6);
          if (dataStr === '[DONE]') break;

          let parsed: any;
          try {
            parsed = JSON.parse(dataStr);
          } catch {
            continue;
          }

          if (parsed.error) {
            detectedErrorType = parsed.errorType || parsed.errorCode || 'GENERAL_ERROR';
            throw new Error(translateErrorCode(language, parsed.errorCode, parsed.error));
          }

          if (parsed.quota) {
            setQuota(parsed.quota);
          }

          if (parsed.usage && parsed.usage.totalTokens > 0) {
            realUsageTotal = parsed.usage.totalTokens;
          }

          if (parsed.text) {
            accumulatedText += parsed.text;
            setConversations((prev) =>
              prev.map((c) =>
                c.id === currentChat.id
                  ? {
                      ...c,
                      messages: c.messages.map((m) =>
                        m.id === aiMessageId
                          ? {
                              ...m,
                              content: accumulatedText,
                              isStreaming: true,
                              estimatedTokens: realUsageTotal || estimateTokens(accumulatedText),
                            }
                          : m
                      ),
                    }
                  : c
              )
            );
          }
        }
      }

      const finalTokens = realUsageTotal || estimateTokens(accumulatedText);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === currentChat.id
            ? {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === aiMessageId
                    ? { ...m, content: accumulatedText, isStreaming: false, estimatedTokens: finalTokens }
                    : m
                ),
              }
            : c
        )
      );
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === currentChat.id
              ? {
                  ...c,
                  messages: c.messages.map((m) => (m.id === aiMessageId ? { ...m, isStreaming: false } : m)),
                }
              : c
          )
        );
      } else {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === currentChat.id
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === aiMessageId
                      ? {
                          ...m,
                          content: err?.message || 'Error generating response.',
                          isStreaming: false,
                          error: true,
                          errorType: detectedErrorType,
                        }
                      : m
                  ),
                }
              : c
          )
        );
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
  };

  const handleRegenerate = () => {
    if (!currentChat || currentChat.messages.length === 0 || isStreaming) return;
    const msgs = [...currentChat.messages];
    const lastMsg = msgs[msgs.length - 1];
    if (lastMsg.sender !== 'ai' && lastMsg.role !== 'model') return;

    const userMsgIndex = msgs.length - 2;
    if (userMsgIndex >= 0) {
      const userMsg = msgs[userMsgIndex];
      setConversations((prev) =>
        prev.map((c) => (c.id === currentChat.id ? { ...c, messages: c.messages.slice(0, userMsgIndex) } : c))
      );
      void handleSendMessage(userMsg.content);
    }
  };

  const starterPrompts = useMemo(
    () => [
      {
        icon: Code,
        title: t.starterCodingTitle,
        desc: t.starterCodingDesc,
        prompt: t.starterCodingPrompt,
      },
      {
        icon: FileText,
        title: t.starterEmailTitle,
        desc: t.starterEmailDesc,
        prompt: t.starterEmailPrompt,
      },
      {
        icon: Languages,
        title: t.starterTranslationTitle,
        desc: t.starterTranslationDesc,
        prompt: t.starterTranslationPrompt,
      },
      {
        icon: Bug,
        title: t.starterDebugTitle,
        desc: t.starterDebugDesc,
        prompt: t.starterDebugPrompt,
      },
    ],
    [t]
  );

  // Loading state while bootstrapping session & license
  if (isBootstrapping) {
    return (
      <div className="min-h-screen w-screen flex items-center justify-center bg-neutral-50 dark:bg-[#09090b] text-neutral-600 dark:text-neutral-300">
        <div className="flex items-center gap-2.5 text-sm font-medium">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>{t.loadingText}</span>
        </div>
      </div>
    );
  }

  // Dedicated Welcome Screen on first launch when no active Community license is present
  const isCommunityActive = license.plan === 'community' && license.status === 'active';
  const showWelcomeScreen = forceShowWelcome || (!welcomeDismissed && !isCommunityActive);

  if (showWelcomeScreen) {
    return (
      <WelcomeScreen
        language={language}
        onLanguageChange={handleLanguageChange}
        license={license}
        onActivateLicense={handleActivateLicense}
        onVerifyLicense={handleVerifyLicense}
        onSkip={handleSkipWelcome}
        onContinueToApp={() => {
          setWelcomeDismissed(true);
          setForceShowWelcome(false);
        }}
      />
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white dark:bg-[#09090b] font-sans text-neutral-900 dark:text-neutral-100 transition-colors">
      {/* Collapsible Sidebar */}
      <Sidebar
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        conversations={conversations}
        currentChatId={currentChat?.id || ''}
        onSelectChat={(id) => {
          void handleSelectChat(id);
          if (window.innerWidth < 768) setIsSidebarOpen(false);
        }}
        onNewChat={handleNewChat}
        onDeleteChat={handleDeleteChat}
        onRenameChat={handleRenameChat}
        onClearAllChats={handleClearAllChats}
        models={models}
        selectedModel={selectedModel}
        onSelectModel={handleSelectModel}
        activeProvider={activeProvider}
        onOpenSettings={openSettings}
        totalSessionTokens={totalSessionTokens}
        language={language}
        license={license}
      />

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col h-full min-w-0 bg-white dark:bg-[#09090b]">
        <Header
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          isSidebarOpen={isSidebarOpen}
          title={currentChat?.title || t.newChatTitle}
          selectedModel={selectedModel}
          models={models}
          onOpenSettings={openSettings}
          onOpenAnalyticsModal={() => setIsAnalyticsModalOpen(true)}
          onClearCurrentChat={handleClearCurrentChat}
          hasMessages={Boolean(currentChat && currentChat.messages.length > 0)}
          onOpenHelpModal={() => setIsHelpModalOpen(true)}
          language={language}
          license={license}
          quota={quota}
          hasProviderConfigured={hasReadyProvider}
        />

        {keyStatus && keyStatus.status !== 'ready' && (
          <div className="px-4 py-2.5 bg-red-600 text-white text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-red-700 shrink-0">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="font-medium">{keyStatus.errorMessage || t.masterKeyAlertBanner}</span>
            </div>
            <button
              type="button"
              onClick={() => openSettings('security')}
              className="px-3 py-1 rounded-lg bg-white text-red-700 hover:bg-red-50 font-semibold text-xs whitespace-nowrap cursor-pointer"
            >
              {t.tabSecurity}
            </button>
          </div>
        )}

        {/* Messages or Empty Workspace */}
        <main className="flex-1 overflow-y-auto min-h-0">
          {currentChat && currentChat.messages.length > 0 ? (
            <div className="py-2">
              {currentChat.messages.map((message, index) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  isLast={index === currentChat.messages.length - 1}
                  onRegenerate={
                    index === currentChat.messages.length - 1 && !isStreaming ? handleRegenerate : undefined
                  }
                  onOpenSettings={() => openSettings('providers')}
                  language={language}
                  compactMode={compactMode}
                />
              ))}
              <div ref={messagesEndRef} className="h-4" />
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12 flex flex-col items-center justify-center min-h-full">
              <div className="w-12 h-12 rounded-2xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-950 flex items-center justify-center mb-3 shadow-xs">
                <Bot className="w-6 h-6" />
              </div>

              <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 dark:text-white text-center tracking-tight mb-1.5">
                {t.workspaceTitle}
              </h1>
              <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 text-center max-w-lg mb-6 leading-relaxed">
                {t.workspaceSubtitle}
              </p>

              {/* Unified Workspace Status Card */}
              <div className="w-full max-w-xl mb-6 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#111114] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="p-2 rounded-lg bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 shrink-0">
                    <Server className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 space-y-0.5">
                    <div className="text-xs font-semibold text-neutral-900 dark:text-white flex items-center gap-2 flex-wrap">
                      <span>{activeProvider ? activeProvider.name : t.providerSummaryTitle}</span>
                      <span className="text-neutral-400">·</span>
                      <span className="font-mono text-neutral-600 dark:text-neutral-300">
                        {isCommunityActive ? t.planCommunity : t.planFree} ({quota.chatRemaining}/{quota.chatLimit})
                      </span>
                    </div>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                      {!hasReadyProvider
                        ? t.noProviderConfigured
                        : selectedModel
                        ? `${t.activeModelLabel}: ${selectedModel}`
                        : t.noModelsAvailable}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                  {!isCommunityActive && (
                    <button
                      type="button"
                      onClick={() => openSettings('license')}
                      className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>{t.upgradeCommunityBtn}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => openSettings('providers')}
                    className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-neutral-900 dark:bg-white hover:bg-neutral-800 dark:hover:bg-neutral-200 text-white dark:text-neutral-950 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>{t.providerSummaryConfigure}</span>
                  </button>
                </div>
              </div>

              {/* Starter Prompts */}
              <div className="w-full max-w-xl grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {starterPrompts.map((item, idx) => {
                  const Icon = item.icon;
                  const estimatedPromptTokens = estimateTokens(item.prompt);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => void handleSendMessage(item.prompt)}
                      className="p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 dark:bg-[#111114] hover:bg-neutral-100 dark:hover:bg-[#17171c] text-left transition-colors cursor-pointer group flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <Icon className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400 group-hover:text-neutral-900 dark:group-hover:text-white" />
                            <span className="font-semibold text-xs text-neutral-900 dark:text-white">
                              {item.title}
                            </span>
                          </div>
                          <span className="text-[10px] text-neutral-400 font-mono tabular-nums">
                            ~{formatTokenCount(estimatedPromptTokens)} {t.tokensCount}
                          </span>
                        </div>
                        <p className="text-[11px] text-neutral-500 dark:text-neutral-400 line-clamp-2 leading-relaxed">
                          {item.desc}
                        </p>
                      </div>
                      <div className="mt-2 flex items-center gap-1 text-[11px] text-neutral-800 dark:text-neutral-200 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                        <span>{t.askNow}</span>
                        <ArrowRight className="w-2.5 h-2.5" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </main>

        {/* Composer */}
        <ChatInput
          onSendMessage={(msg) => void handleSendMessage(msg)}
          isStreaming={isStreaming}
          onStopStreaming={handleStopStreaming}
          onOpenSettings={openSettings}
          hasReadyProvider={hasReadyProvider}
          language={language}
          quota={quota}
          sendOnEnter={sendOnEnter}
        />
      </div>

      {/* Unified Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        initialTab={settingsTab}
        onClose={() => setIsSettingsOpen(false)}
        language={language}
        onLanguageChange={handleLanguageChange}
        theme={theme}
        onThemeChange={handleThemeChange}
        providers={providers}
        activeProviderId={activeProviderId}
        onSelectActiveProvider={handleSelectActiveProvider}
        onCreateProvider={handleCreateProvider}
        onUpdateProvider={handleUpdateProvider}
        onDeleteProvider={handleDeleteProvider}
        onTestProvider={handleTestProvider}
        models={models}
        customModels={customModels}
        selectedModel={selectedModel}
        onSelectModel={handleSelectModel}
        onRefreshModels={(pid) => refreshModels(pid)}
        isFetchingModels={isFetchingModels}
        onAddCustomModel={handleAddCustomModel}
        onDeleteCustomModel={handleDeleteCustomModel}
        temperature={temperature}
        onChangeTemperature={(val) => {
          setTemperature(val);
          void persistUserSettings({ temperature: String(val) });
        }}
        systemInstruction={systemInstruction}
        onChangeSystemInstruction={(val) => {
          setSystemInstruction(val);
          void persistUserSettings({ system_instruction: val });
        }}
        sendOnEnter={sendOnEnter}
        onChangeSendOnEnter={(val) => {
          setSendOnEnter(val);
          void persistUserSettings({ send_on_enter: String(val) });
        }}
        compactMode={compactMode}
        onChangeCompactMode={(val) => {
          setCompactMode(val);
          void persistUserSettings({ compact_mode: String(val) });
        }}
        license={license}
        quota={quota}
        onActivateLicense={handleActivateLicense}
        onVerifyLicense={handleVerifyLicense}
        onDeactivateLicense={handleDeactivateLicense}
        onOpenWelcomeScreen={() => {
          setIsSettingsOpen(false);
          setForceShowWelcome(true);
        }}
        keyStatus={keyStatus}
        onRefreshKeyStatus={handleRefreshKeyStatus}
        onBackupMasterKey={handleBackupMasterKey}
        onRestoreMasterKey={handleRestoreMasterKey}
        onRotateMasterKey={handleRotateMasterKey}
      />

      {/* Community Analytics & Token Usage History Modal */}
      <AnalyticsModal
        isOpen={isAnalyticsModalOpen}
        onClose={() => setIsAnalyticsModalOpen(false)}
        language={language}
        license={license}
        onOpenLicenseSettings={() => openSettings('license')}
      />

      {/* System Info & Guide Modal */}
      <HelpModal
        isOpen={isHelpModalOpen}
        onClose={() => setIsHelpModalOpen(false)}
        onOpenSettings={openSettings}
        language={language}
      />
    </div>
  );
}
