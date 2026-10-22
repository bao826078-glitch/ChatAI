/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Key, 
  Code, 
  FileText, 
  Languages, 
  Bug, 
  ArrowRight,
  AlertCircle,
  Bot,
  Coins,
  BarChart3,
  Sparkles
} from 'lucide-react';
import { Conversation, Message, ModelOption, ApiProvider, AppLanguage } from './types';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { ChatMessage } from './components/ChatMessage';
import { ChatInput } from './components/ChatInput';
import { ApiKeyModal } from './components/ApiKeyModal';
import { AnalyticsModal } from './components/AnalyticsModal';
import { HelpModal } from './components/HelpModal';
import { estimateTokens, formatTokenCount } from './utils/tokenEstimator';
import { syncConversationsWithHistory, recordTokenUsage } from './utils/analytics';
import { getStoredLanguage, saveStoredLanguage, translations } from './utils/i18n';


export default function App() {
  // Ensure pure light mode
  useEffect(() => {
    document.documentElement.classList.remove('dark');
    try {
      localStorage.removeItem('chat_theme_mode');
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Provider: 'openai' | 'google' | 'claude' | '9router' | 'other'
  const [provider, setProvider] = useState<ApiProvider>(() => {
    const saved = localStorage.getItem('ai_provider') as ApiProvider;
    if (saved === 'openai' || saved === 'google' || saved === 'claude' || saved === '9router' || saved === 'other') {
      return saved;
    }
    return 'openai';
  });

  // Base URL for API calls - empty by default per user request
  const [baseUrl, setBaseUrl] = useState<string>(() => {
    return localStorage.getItem('ai_base_url') || '';
  });

  // User chat history storage
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    try {
      const saved = localStorage.getItem('ai_chat_conversations');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    const initialId = 'chat-' + Date.now();
    const initTitle = getStoredLanguage() === 'vi' ? 'Đoạn chat mới' : 'New chat';
    return [
      {
        id: initialId,
        title: initTitle,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
        model: '',
      },
    ];
  });

  const [currentChatId, setCurrentChatId] = useState<string>(() => {
    return conversations[0]?.id || 'chat-' + Date.now();
  });

  const [apiKey, setApiKey] = useState<string>(() => {
    return localStorage.getItem('ai_custom_api_key') || '';
  });

  const [hasDefaultKey, setHasDefaultKey] = useState<boolean>(false);
  const [isKeyInvalid, setIsKeyInvalid] = useState<boolean>(false);
  const [invalidKeyErrorMsg, setInvalidKeyErrorMsg] = useState<string>('');

  // The model list is initially empty per user request:
  // Models are dynamically retrieved only after a valid API Key is provided
  const [models, setModels] = useState<ModelOption[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState<boolean>(false);
  const [selectedModel, setSelectedModel] = useState<string>('');
  
  const [temperature, setTemperature] = useState<number>(0.7);
  const [systemInstruction, setSystemInstruction] = useState<string>('');
  
  // Sidebar state
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 768;
    }
    return true;
  });

  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [isAnalyticsModalOpen, setIsAnalyticsModalOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  // App Language: 'en' (default) | 'vi'
  const [language, setLanguage] = useState<AppLanguage>(getStoredLanguage);
  const t = translations[language] || translations.en;

  const handleLanguageChange = (newLang: AppLanguage) => {
    setLanguage(newLang);
    saveStoredLanguage(newLang);
  };

  const starterPrompts = useMemo(() => [
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
  ], [t]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load server config
  useEffect(() => {
    fetch('/api/config')
      .then((res) => res.json())
      .then((data) => {
        if (data.hasDefaultApiKey) {
          setHasDefaultKey(true);
        }
      })
      .catch((err) => console.log('Config fetch note:', err));
  }, []);

  // Load conversation history from SQLite backend
  useEffect(() => {
    const loadConversationsFromBackend = async () => {
      try {
        const res = await fetch('/api/conversations');
        const data = await res.json();
        if (data.ok && Array.isArray(data.conversations) && data.conversations.length > 0) {
          const firstConvId = data.conversations[0].id;
          const detailRes = await fetch(`/api/conversations/${firstConvId}`);
          const detail = await detailRes.json();

          const mapped: Conversation[] = data.conversations.map((c: any) => ({
            id: c.id,
            title: c.title,
            createdAt: new Date(c.created_at).getTime(),
            updatedAt: new Date(c.updated_at).getTime(),
            messages: c.id === firstConvId && detail.ok && Array.isArray(detail.messages)
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
          setCurrentChatId(firstConvId);
        } else {
          // If SQLite is empty, check if localStorage has existing chats to bulk-sync into SQLite!
          const localSaved = localStorage.getItem('ai_chat_conversations');
          if (localSaved) {
            const parsed = JSON.parse(localSaved);
            if (Array.isArray(parsed) && parsed.length > 0) {
              await fetch('/api/conversations/bulk-sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conversations: parsed }),
              });
              const refreshed = await fetch('/api/conversations');
              const refreshedData = await refreshed.json();
              if (refreshedData.ok && Array.isArray(refreshedData.conversations) && refreshedData.conversations.length > 0) {
                const firstId = refreshedData.conversations[0].id;
                const dRes = await fetch(`/api/conversations/${firstId}`);
                const dData = await dRes.json();
                setConversations(refreshedData.conversations.map((c: any) => ({
                  id: c.id,
                  title: c.title,
                  createdAt: new Date(c.created_at).getTime(),
                  updatedAt: new Date(c.updated_at).getTime(),
                  messages: c.id === firstId && dData.ok && Array.isArray(dData.messages)
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
                })));
                setCurrentChatId(firstId);
              }
            }
          }
        }
      } catch (err) {
        console.warn('Failed to load conversations from SQLite:', err);
      }
    };

    loadConversationsFromBackend();
  }, []);

  // Automatically synchronize entire chat history into permanent analytics logs (auto-save)
  useEffect(() => {
    syncConversationsWithHistory(conversations);
  }, [conversations]);

  // Function to dynamically fetch models provided by the active key
  // When no API key is provided, the model list immediately resets to empty
  const fetchModelsFromApi = async (activeProvider = provider, activeKey = apiKey, activeBase = baseUrl) => {
    const trimmedKey = (activeKey || '').trim();
    if (!trimmedKey) {
      setModels([]);
      setSelectedModel('');
      return;
    }

    setIsFetchingModels(true);
    try {
      const res = await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: trimmedKey,
          provider: activeProvider,
          baseUrl: (activeBase || '').trim(),
        }),
      });

      const data = await res.json();
      if (data.ok && Array.isArray(data.models) && data.models.length > 0) {
        setModels(data.models);
        // If current model not in new list or is deprecated, pick first valid model
        if (!selectedModel || !data.models.some((m: ModelOption) => m.id === selectedModel) || selectedModel.includes('2.5-flash') || selectedModel.includes('1.5-flash') || selectedModel.includes('2.0-flash')) {
          setSelectedModel(data.models[0].id);
        }
      } else {
        setModels([]);
        setSelectedModel('');
      }
    } catch (e) {
      console.log('Fetch models error:', e);
      setModels([]);
      setSelectedModel('');
    } finally {
      setIsFetchingModels(false);
    }
  };

  // Fetch models whenever provider or API key changes
  useEffect(() => {
    if (apiKey.trim()) {
      fetchModelsFromApi(provider, apiKey, baseUrl);
    } else {
      setModels([]);
      setSelectedModel('');
    }
  }, [provider, apiKey, baseUrl]);

  // Persist conversation history to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('ai_chat_conversations', JSON.stringify(conversations));
    } catch (e) {
      console.error('Save conversations error:', e);
    }
  }, [conversations]);

  // Handle saving API key and provider
  const handleSaveApiKey = (key: string, newProvider: ApiProvider, newBaseUrl?: string) => {
    const trimmedKey = key.trim();
    setApiKey(trimmedKey);
    setProvider(newProvider);
    setIsKeyInvalid(false);
    setInvalidKeyErrorMsg('');

    localStorage.setItem('ai_provider', newProvider);

    if (trimmedKey) {
      localStorage.setItem('ai_custom_api_key', trimmedKey);
    } else {
      localStorage.removeItem('ai_custom_api_key');
      setModels([]);
      setSelectedModel('');
    }

    if (newBaseUrl !== undefined) {
      setBaseUrl(newBaseUrl);
      if (newBaseUrl) {
        localStorage.setItem('ai_base_url', newBaseUrl);
      } else {
        localStorage.removeItem('ai_base_url');
      }
    }

    // Refresh models with the new credentials if key is present
    if (trimmedKey) {
      fetchModelsFromApi(newProvider, trimmedKey, newBaseUrl !== undefined ? newBaseUrl : baseUrl);
    }
  };

  const currentChat = conversations.find((c) => c.id === currentChatId) || conversations[0];

  // Auto-scroll on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentChat?.messages, isStreaming]);

  // Total session context tokens
  const totalSessionTokens = useMemo(() => {
    if (!currentChat?.messages) return 0;
    return currentChat.messages.reduce((acc, m) => {
      const msgTokens = m.estimatedTokens || estimateTokens(m.content);
      return acc + msgTokens;
    }, 0);
  }, [currentChat?.messages]);

  // Select chat and load full messages if needed
  const handleSelectChat = async (id: string) => {
    setCurrentChatId(id);
    const target = conversations.find((c) => c.id === id);
    if (target && (!target.messages || target.messages.length === 0)) {
      try {
        const res = await fetch(`/api/conversations/${id}`);
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
          setConversations((prev) =>
            prev.map((c) => (c.id === id ? { ...c, messages: msgs } : c))
          );
        }
      } catch (err) {
        console.error('Error fetching conversation messages:', err);
      }
    }
  };

  // Create new chat
  const handleNewChat = () => {
    const newChatTitle = language === 'vi' ? 'Đoạn chat mới' : 'New chat';
    const newChatId = 'chat-' + Date.now();
    const newChat: Conversation = {
      id: newChatId,
      title: newChatTitle,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      model: selectedModel,
      provider,
      baseUrl,
    };
    setConversations((prev) => [newChat, ...prev]);
    setCurrentChatId(newChatId);

    // Save to SQLite
    fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: newChatId,
        title: newChatTitle,
        model: selectedModel,
        provider,
        system_instruction: systemInstruction,
      }),
    }).catch(console.error);
  };

  // Delete chat
  const handleDeleteChat = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    fetch(`/api/conversations/${id}`, { method: 'DELETE' }).catch(console.error);

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

  // Rename chat
  const handleRenameChat = (id: string, newTitle: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title: newTitle, updatedAt: Date.now() } : c))
    );
    fetch(`/api/conversations/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle }),
    }).catch(console.error);
  };

  // Clear all chats
  const handleClearAllChats = () => {
    conversations.forEach((c) => {
      fetch(`/api/conversations/${c.id}`, { method: 'DELETE' }).catch(console.error);
    });

    const newChatTitle = language === 'vi' ? 'Đoạn chat mới' : 'New chat';
    const initialId = 'chat-' + Date.now();
    const emptyChat: Conversation = {
      id: initialId,
      title: newChatTitle,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      model: selectedModel,
      provider,
      baseUrl,
    };
    setConversations([emptyChat]);
    setCurrentChatId(initialId);

    fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: initialId,
        title: newChatTitle,
        model: selectedModel,
        provider,
        system_instruction: systemInstruction,
      }),
    }).catch(console.error);
  };

  // Clear current chat messages
  const handleClearCurrentChat = () => {
    if (!currentChat) return;
    fetch(`/api/conversations/${currentChatId}`, { method: 'DELETE' }).catch(console.error);

    const defaultTitle = language === 'vi' ? 'Đoạn chat mới' : 'New chat';
    setConversations((prev) =>
      prev.map((c) =>
        c.id === currentChatId
          ? {
              ...c,
              messages: [],
              title: defaultTitle,
              updatedAt: Date.now(),
            }
          : c
      )
    );
  };


  // Send message and stream
  const handleSendMessage = async (text: string) => {
    if (!currentChat) return;

    if (isKeyInvalid) {
      setIsApiKeyModalOpen(true);
      return;
    }

    if (!apiKey.trim()) {
      setIsApiKeyModalOpen(true);
      return;
    }

    if (!selectedModel && models.length === 0) {
      setIsApiKeyModalOpen(true);
      return;
    }

    const timestampNow = Date.now();
    const inputEstimatedTokens = estimateTokens(text);

    // Automatically record token usage for user message (persisted into localStorage & SQLite)
    recordTokenUsage({
      tokens: inputEstimatedTokens,
      conversationId: currentChat.id,
      timestamp: timestampNow,
    });

    const userMessage: Message = {
      id: 'msg-' + timestampNow,
      sender: 'user',
      role: 'user',
      content: text,
      timestamp: timestampNow,
      estimatedTokens: inputEstimatedTokens,
    };

    const aiMessageId = 'msg-ai-' + (timestampNow + 1);
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
      ? text.slice(0, 32) + (text.length > 32 ? '...' : '') || 'Cuộc trò chuyện'
      : currentChat.title;

    const updatedMessages = [...currentChat.messages, userMessage, placeholderAiMessage];

    setConversations((prev) =>
      prev.map((c) =>
        c.id === currentChatId
          ? {
              ...c,
              title: computedTitle,
              messages: updatedMessages,
              updatedAt: timestampNow,
              model: selectedModel,
              provider,
              baseUrl,
            }
          : c
      )
    );

    setIsStreaming(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

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

      const clientRequestId = `req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      let realUsageTotal: number | null = null;

      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: historyPayload,
          model: selectedModel,
          systemInstruction,
          temperature,
          apiKey: apiKey.trim(),
          provider,
          baseUrl: baseUrl.trim(),
          conversationId: currentChat.id,
          userMessageId: userMessage.id,
          aiMessageId: aiMessageId,
          requestId: clientRequestId,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Máy chủ phản hồi mã lỗi: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('Không thể đọc luồng dữ liệu từ máy chủ.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let accumulatedText = '';
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

              if (parsed.errorType === 'INVALID_OR_EXPIRED_KEY') {
                setIsKeyInvalid(true);
                setInvalidKeyErrorMsg(parsed.error);
                setIsApiKeyModalOpen(true);
                throw new Error(parsed.error);
              }

              if (parsed.error) {
                throw new Error(parsed.error);
              }

              if (parsed.usage && parsed.usage.totalTokens > 0) {
                realUsageTotal = parsed.usage.totalTokens;
              }

              if (parsed.text) {
                accumulatedText += parsed.text;
                setConversations((prev) =>
                  prev.map((c) =>
                    c.id === currentChatId
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
            } catch (jsonErr: any) {
              if (jsonErr?.message?.includes('Khóa API không hợp lệ') || jsonErr?.message?.includes('hết hạn')) {
                throw jsonErr;
              }
            }
          }
        }
      }

      // Mark streaming done with estimated tokens finalized
      const finalTokens = realUsageTotal || estimateTokens(accumulatedText);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === currentChatId
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

      // Automatically persist generated AI response tokens into analytics logs (auto-save)
      recordTokenUsage({
        tokens: finalTokens,
        conversationId: currentChat.id,
        timestamp: Date.now(),
      });
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === currentChatId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === aiMessageId ? { ...m, isStreaming: false } : m
                  ),
                }
              : c
          )
        );
      } else {
        const errorContent = err.message || 'Đã xảy ra lỗi khi tạo phản hồi từ AI.';
        setConversations((prev) =>
          prev.map((c) =>
            c.id === currentChatId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === aiMessageId
                      ? {
                          ...m,
                          content: errorContent,
                          isStreaming: false,
                          error: true,
                          errorType: isKeyInvalid ? 'INVALID_OR_EXPIRED_KEY' : 'GENERAL_ERROR',
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

  // Stop streaming
  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
  };

  // Regenerate last message
  const handleRegenerate = () => {
    if (!currentChat || currentChat.messages.length === 0 || isStreaming) return;
    const msgs = [...currentChat.messages];
    const lastMsg = msgs[msgs.length - 1];
    if (lastMsg.sender !== 'ai' && lastMsg.role !== 'model') return;

    const userMsgIndex = msgs.length - 2;
    if (userMsgIndex >= 0) {
      const userMsg = msgs[userMsgIndex];
      setConversations((prev) =>
        prev.map((c) =>
          c.id === currentChatId
            ? {
                ...c,
                messages: c.messages.slice(0, userMsgIndex),
              }
            : c
        )
      );
      handleSendMessage(userMsg.content);
    }
  };

  const hasAnyKey = Boolean(apiKey.trim());

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white font-sans text-neutral-900 transition-colors">
      {/* Sidebar */}
      <Sidebar
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        conversations={conversations}
        currentChatId={currentChatId}
        onSelectChat={(id) => {
          handleSelectChat(id);
          if (window.innerWidth < 768) {
            setIsSidebarOpen(false);
          }
        }}
        onNewChat={handleNewChat}
        onDeleteChat={handleDeleteChat}
        onRenameChat={handleRenameChat}
        onClearAllChats={handleClearAllChats}
        models={models}
        selectedModel={selectedModel}
        onSelectModel={setSelectedModel}
        onRefreshModels={() => fetchModelsFromApi(provider, apiKey, baseUrl)}
        isFetchingModels={isFetchingModels}
        temperature={temperature}
        onChangeTemperature={setTemperature}
        systemInstruction={systemInstruction}
        onChangeSystemInstruction={setSystemInstruction}
        onOpenApiKeyModal={() => setIsApiKeyModalOpen(true)}
        onOpenAnalyticsModal={() => setIsAnalyticsModalOpen(true)}
        hasCustomKey={Boolean(apiKey.trim())}
        hasDefaultKey={hasDefaultKey}
        provider={provider}
        totalSessionTokens={totalSessionTokens}
        language={language}
      />

      {/* Main Container */}
      <div className="flex-1 flex flex-col h-full min-w-0 bg-white">
        {/* Header */}
        <Header
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          isSidebarOpen={isSidebarOpen}
          title={currentChat?.title || (language === 'vi' ? 'Đoạn chat mới' : 'New chat')}
          selectedModel={selectedModel}
          models={models}
          onOpenApiKeyModal={() => setIsApiKeyModalOpen(true)}
          onOpenAnalyticsModal={() => setIsAnalyticsModalOpen(true)}
          hasCustomKey={Boolean(apiKey.trim())}
          hasDefaultKey={hasDefaultKey}
          isKeyInvalid={isKeyInvalid}
          onClearCurrentChat={handleClearCurrentChat}
          hasMessages={Boolean(currentChat && currentChat.messages.length > 0)}
          onOpenHelpModal={() => setIsHelpModalOpen(true)}
          language={language}
          onLanguageChange={handleLanguageChange}
        />

        {/* Invalid key banner prompt */}
        {isKeyInvalid && (
          <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-xs text-red-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <span>
                {invalidKeyErrorMsg || (language === 'vi' ? 'Khóa API không hợp lệ hoặc đã hết hạn. Đã dừng kết nối với AI.' : 'API Key is invalid or expired. AI connection paused.')}
              </span>
            </div>
            <button
              onClick={() => setIsApiKeyModalOpen(true)}
              className="px-2.5 py-0.5 rounded bg-red-600 hover:bg-red-500 text-white font-medium text-[11px] transition-colors cursor-pointer"
            >
              {language === 'vi' ? 'Cập nhật Key' : 'Update Key'}
            </button>
          </div>
        )}

        {/* Message Workspace */}
        <main className="flex-1 overflow-y-auto min-h-0">
          {currentChat && currentChat.messages.length > 0 ? (
            <div className="max-w-3xl mx-auto px-3 sm:px-4 py-6 space-y-4">
              {currentChat.messages.map((message, index) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  isLast={index === currentChat.messages.length - 1}
                  onRegenerate={
                    index === currentChat.messages.length - 1 && !isStreaming
                      ? handleRegenerate
                      : undefined
                  }
                  onOpenApiKeyModal={() => setIsApiKeyModalOpen(true)}
                  language={language}
                />
              ))}
              <div ref={messagesEndRef} className="h-4" />
            </div>
          ) : (
            /* Minimalist Starter Screen */
            <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12 flex flex-col items-center justify-center min-h-full">
              {/* Minimalist AI Icon */}
              <div className="w-12 h-12 rounded-xl bg-neutral-900 text-white flex items-center justify-center font-bold text-lg mb-3 shadow-xs">
                <Bot className="w-6 h-6" />
              </div>

              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 text-center tracking-tight mb-1">
                ChatAI
              </h2>
              <p className="text-xs sm:text-sm text-neutral-500 text-center max-w-md mb-6 leading-relaxed">
                {t.welcomeSubtitle}
              </p>

              {/* API Key Box */}
              <div className="w-full max-w-xl mb-6 p-4 rounded-xl border border-neutral-200 bg-neutral-50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-neutral-200 text-neutral-700 shrink-0">
                    <Key className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-xs text-neutral-900 flex items-center gap-1.5">
                      <span>{language === 'vi' ? 'Cấu hình Cổng AI' : 'AI Provider Configuration'} ({provider === '9router' ? '9Router' : (language === 'vi' ? 'Cổng khác' : 'Other')})</span>
                      {!isKeyInvalid ? (
                        hasAnyKey ? (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-neutral-200 text-neutral-700">
                            {models.length > 0 ? (language === 'vi' ? `Key đã lưu (${models.length} model)` : `Key saved (${models.length} models)`) : (language === 'vi' ? 'Key đã lưu (Đang tải)' : 'Key saved (Loading...)')}
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 font-medium">
                            {language === 'vi' ? 'Chưa có API Key' : 'No API Key yet'}
                          </span>
                        )
                      ) : null}
                    </h4>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {isKeyInvalid
                        ? (language === 'vi' ? 'Khóa hiện tại không hợp lệ. Vui lòng cập nhật key mới.' : 'Current key is invalid. Please update with a valid API key.')
                        : !hasAnyKey
                        ? (language === 'vi' ? 'Mục mô hình hiện đang trống. Vui lòng nhập API Key để nhận danh sách mô hình AI.' : 'Model list is empty. Enter your API Key to retrieve available AI models.')
                        : (language === 'vi' 
                            ? `URL gọi AI: ${baseUrl ? baseUrl : (provider === '9router' ? '9Router mặc định' : 'Cổng tiêu chuẩn')}`
                            : `AI Endpoint: ${baseUrl ? baseUrl : (provider === '9router' ? '9Router default' : 'Standard endpoint')}`)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                  <button
                    onClick={() => setIsAnalyticsModalOpen(true)}
                    className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-300 hover:bg-neutral-100 text-neutral-800 text-xs font-medium transition-colors cursor-pointer"
                  >
                    <BarChart3 className="w-3.5 h-3.5 text-neutral-500" />
                    <span>{t.monthlyStatsBtnShort}</span>
                  </button>
                  <button
                    onClick={() => setIsApiKeyModalOpen(true)}
                    className="flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold transition-colors cursor-pointer"
                  >
                    {language === 'vi' ? 'Cài đặt Key' : 'API Key'}
                  </button>
                </div>
              </div>

              {/* Notice when no API key is configured and model list is empty */}
              {models.length === 0 && (
                <div className="w-full max-w-xl mb-6 p-4 rounded-xl border border-dashed border-amber-300 bg-amber-50/60 text-center space-y-2">
                  <p className="text-xs text-amber-900 font-medium">
                    {language === 'vi' 
                      ? '⚡ Danh sách mô hình AI đang để trống. Hãy bấm Cài đặt Key và nhập API Key của bạn (9Router hoặc cổng khác) để hệ thống nhận các mô hình AI.'
                      : '⚡ AI model list is currently empty. Click API Key and enter your API key to populate available AI models.'}
                  </p>
                </div>
              )}

              {/* Starter Prompt Cards */}
              <div className="w-full max-w-xl grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {starterPrompts.map((item, idx) => {
                  const Icon = item.icon;
                  const estimatedPromptTokens = estimateTokens(item.prompt);
                  return (
                    <button
                      key={idx}
                      onClick={() => handleSendMessage(item.prompt)}
                      className="p-3 rounded-xl border border-neutral-200 bg-neutral-50/60 hover:bg-neutral-100 text-left transition-colors cursor-pointer group flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <Icon className="w-3.5 h-3.5 text-neutral-500 group-hover:text-neutral-900" />
                            <span className="font-semibold text-xs text-neutral-900">
                              {item.title}
                            </span>
                          </div>
                          <span className="text-[10px] text-neutral-400 font-mono">
                            ~{formatTokenCount(estimatedPromptTokens)} {t.tokensCount}
                          </span>
                        </div>
                        <p className="text-[11px] text-neutral-500 line-clamp-2 leading-relaxed">
                          {item.desc}
                        </p>
                      </div>
                      <div className="mt-2 flex items-center gap-1 text-[11px] text-neutral-800 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                        <span>{language === 'vi' ? 'Hỏi ngay' : 'Ask now'}</span>
                        <ArrowRight className="w-2.5 h-2.5" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </main>

        {/* Input Composer */}
        <ChatInput
          onSendMessage={handleSendMessage}
          isStreaming={isStreaming}
          onStopStreaming={handleStopStreaming}
          onOpenApiKeyModal={() => setIsApiKeyModalOpen(true)}
          hasApiKey={hasAnyKey && models.length > 0}
          isKeyInvalid={isKeyInvalid}
          language={language}
        />
      </div>

      {/* API Key & URL Settings Modal */}
      <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        apiKey={apiKey}
        provider={provider}
        baseUrl={baseUrl}
        onSaveApiKey={handleSaveApiKey}
        hasDefaultKey={hasDefaultKey}
        isKeyInvalid={isKeyInvalid}
        errorMessage={invalidKeyErrorMsg}
        language={language}
      />

      {/* Recharts Analytics Dashboard Modal */}
      <AnalyticsModal
        isOpen={isAnalyticsModalOpen}
        onClose={() => setIsAnalyticsModalOpen(false)}
        conversations={conversations}
        language={language}
      />

      {/* Help Modal */}
      <HelpModal
        isOpen={isHelpModalOpen}
        onClose={() => setIsHelpModalOpen(false)}
        onOpenApiKeyModal={() => setIsApiKeyModalOpen(true)}
        language={language}
      />
    </div>
  );
}
