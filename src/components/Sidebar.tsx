import React, { useState } from 'react';
import { 
  MessageSquarePlus, 
  Search, 
  Trash2, 
  Key, 
  Cpu, 
  Sliders, 
  X, 
  MessageSquare, 
  Edit2, 
  Check, 
  PanelLeftClose, 
  ChevronDown, 
  Clock, 
  RefreshCw, 
  Coins,
  BarChart3,
  AlertCircle
} from 'lucide-react';
import { Conversation, ModelOption, ApiProvider, AppLanguage } from '../types';
import { formatTokenCount } from '../utils/tokenEstimator';
import { translations } from '../utils/i18n';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  conversations: Conversation[];
  currentChatId: string;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string, e: React.MouseEvent) => void;
  onRenameChat: (id: string, newTitle: string) => void;
  onClearAllChats: () => void;
  models: ModelOption[];
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
  onRefreshModels: () => void;
  isFetchingModels?: boolean;
  temperature: number;
  onChangeTemperature: (val: number) => void;
  systemInstruction: string;
  onChangeSystemInstruction: (val: string) => void;
  onOpenApiKeyModal: () => void;
  onOpenAnalyticsModal: () => void;
  hasCustomKey: boolean;
  hasDefaultKey: boolean;
  provider: ApiProvider;
  totalSessionTokens?: number;
  language?: AppLanguage;
}

const SYSTEM_PROMPT_PRESETS = [
  {
    name: 'Trợ lý tổng quát',
    prompt: 'Bạn là trợ lý AI hữu ích, súc tích và chuẩn mực. Luôn trả lời bằng tiếng Việt rõ ràng, logic và có cấu trúc dễ đọc.',
  },
  {
    name: 'Chuyên gia Lập trình',
    prompt: 'Bạn là lập trình viên chuyên nghiệp. Viết code sạch, tối ưu, tuân thủ tiêu chuẩn kỹ thuật và giải thích logic cặn kẽ.',
  },
  {
    name: 'Dịch thuật viên',
    prompt: 'Bạn là chuyên viên dịch thuật song ngữ. Dịch chuẩn xác theo ngữ cảnh tự nhiên và giữ đúng thuật ngữ chuyên môn.',
  },
  {
    name: 'Viết lách & Văn bản',
    prompt: 'Bạn là người biên soạn nội dung chuyên nghiệp. Sử dụng từ ngữ trang trọng, mạch lạc và phù hợp mục đích giao tiếp.',
  },
];

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onToggle,
  conversations,
  currentChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  onRenameChat,
  onClearAllChats,
  models,
  selectedModel,
  onSelectModel,
  onRefreshModels,
  isFetchingModels = false,
  temperature,
  onChangeTemperature,
  systemInstruction,
  onChangeSystemInstruction,
  onOpenApiKeyModal,
  onOpenAnalyticsModal,
  hasCustomKey,
  provider,
  totalSessionTokens = 0,
  language = 'en',
}) => {
  const t = translations[language] || translations.en;
  const [searchQuery, setSearchQuery] = useState('');
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);

  const currentPresets = [
    {
      name: t.presetGeneral,
      prompt: t.presetGeneralPrompt,
    },
    {
      name: t.presetCoding,
      prompt: t.presetCodingPrompt,
    },
    {
      name: t.presetTranslator,
      prompt: t.presetTranslatorPrompt,
    },
    {
      name: t.presetWriter,
      prompt: t.presetWriterPrompt,
    },
  ];

  // Filter conversations by title or message content
  const normalizedQuery = searchQuery.toLowerCase().trim();

  const filteredConversations = conversations.filter((c) => {
    if (!normalizedQuery) return true;
    const matchTitle = (c.title || '').toLowerCase().includes(normalizedQuery);
    const matchContent = c.messages?.some((m) => (m.content || '').toLowerCase().includes(normalizedQuery));
    return matchTitle || matchContent;
  });

  const handleStartRename = (c: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingChatId(c.id);
    setEditTitle(c.title);
  };

  const handleSaveRename = (id: string, e: React.MouseEvent | React.FormEvent) => {
    e.stopPropagation();
    if (editTitle.trim()) {
      onRenameChat(id, editTitle.trim());
    }
    setEditingChatId(null);
  };

  const formatChatTime = (timestamp: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
  };

  // Helper to extract a message snippet matching the search query
  const getMatchingSnippet = (c: Conversation): string | null => {
    if (!normalizedQuery) return null;
    const msg = c.messages?.find((m) => (m.content || '').toLowerCase().includes(normalizedQuery));
    if (!msg) return null;
    const idx = msg.content.toLowerCase().indexOf(normalizedQuery);
    const start = Math.max(0, idx - 15);
    const end = Math.min(msg.content.length, idx + normalizedQuery.length + 35);
    return (start > 0 ? '...' : '') + msg.content.slice(start, end) + (end < msg.content.length ? '...' : '');
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          onClick={onToggle}
          className="fixed inset-0 bg-black/40 z-30 md:hidden backdrop-blur-xs"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 bg-neutral-50 border-neutral-200 flex flex-col transition-all duration-200 ease-in-out text-neutral-900 ${
          isOpen
            ? 'w-72 lg:w-76 translate-x-0 border-r opacity-100'
            : 'w-0 -translate-x-full md:translate-x-0 md:w-0 overflow-hidden border-r-0 opacity-0 pointer-events-none'
        }`}
      >
        {/* Header */}
        <div className="p-3 border-b border-neutral-200 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-neutral-900 text-white flex items-center justify-center font-bold text-xs">
                AI
              </div>
              <h1 className="font-semibold text-xs text-neutral-900 tracking-tight flex items-center gap-1.5">
                <span>ChatAI</span>
                <span className="text-[10px] px-1 py-0.2 rounded bg-neutral-200 text-neutral-600 font-normal">
                  {provider === 'openai' ? 'OpenAI' :
                   provider === 'google' ? 'Google' :
                   provider === 'claude' ? 'Claude' :
                   provider === '9router' ? '9Router' : (language === 'en' ? 'Custom' : 'Tùy chỉnh')}
                </span>
              </h1>
            </div>

            {/* Sidebar close button inside sidebar header (left side) */}
            <button
              onClick={onToggle}
              className="p-1 rounded-md text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200 transition-colors cursor-pointer"
              title={t.hideSidebar}
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>

          {/* New Chat */}
          <button
            onClick={onNewChat}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold transition-colors cursor-pointer shadow-xs"
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
            <span>{t.newChatBtn}</span>
          </button>
        </div>

        {/* AI Model & Dynamic Models Fetching */}
        <div className="px-3 py-2 border-b border-neutral-200 space-y-2 bg-white/70">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1 text-[11px] font-semibold text-neutral-700">
              <Cpu className="w-3.5 h-3.5 text-neutral-500" />
              {t.modelSectionTitle} ({models.length}):
            </span>
            <div className="flex items-center gap-1.5">
              {models.length > 0 && (
                <button
                  type="button"
                  onClick={onRefreshModels}
                  disabled={isFetchingModels}
                  className="p-1 text-neutral-500 hover:text-neutral-800 hover:bg-neutral-200 rounded transition-colors"
                  title={t.refreshModels}
                >
                  <RefreshCw className={`w-3 h-3 ${isFetchingModels ? 'animate-spin' : ''}`} />
                </button>
              )}
              <button
                onClick={() => setShowSettingsDrawer(!showSettingsDrawer)}
                className="flex items-center gap-1 text-[11px] text-neutral-500 hover:text-neutral-900 font-medium cursor-pointer"
              >
                <Sliders className="w-3 h-3" />
                <span>{showSettingsDrawer ? (language === 'en' ? 'Close' : 'Đóng') : (language === 'en' ? 'Tune' : 'Tùy chỉnh')}</span>
              </button>
            </div>
          </div>

          {/* Initial state without API Key: Empty model list with prompt to enter key */}
          {models.length === 0 ? (
            <button
              type="button"
              onClick={onOpenApiKeyModal}
              className="w-full flex items-center justify-between px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100/80 border border-dashed border-amber-300 rounded-lg text-xs text-amber-900 transition-colors cursor-pointer text-left font-medium"
            >
              <div className="flex items-center gap-1.5 truncate">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span className="truncate">{t.noModelsAvailable}</span>
              </div>
              <span className="text-[10px] underline shrink-0 ml-1">{language === 'en' ? 'Enter key' : 'Nhập key'}</span>
            </button>
          ) : (
            <div className="relative">
              <select
                value={selectedModel}
                onChange={(e) => onSelectModel(e.target.value)}
                className="w-full pl-2.5 pr-7 py-1.5 bg-white border border-neutral-300 rounded-lg text-xs text-neutral-900 focus:outline-none focus:border-neutral-500 appearance-none font-medium cursor-pointer"
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} {m.badge ? `(${m.badge})` : ''}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-neutral-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          )}

          {/* Token Consumption Tracker */}
          {totalSessionTokens > 0 && (
            <div className="flex items-center justify-between text-[10px] text-neutral-500 pt-0.5">
              <span className="flex items-center gap-1">
                <Coins className="w-3 h-3" />
                {language === 'en' ? 'Session context:' : 'Bộ nhớ ngữ cảnh:'}
              </span>
              <span className="font-mono font-medium">~{formatTokenCount(totalSessionTokens)} {t.tokensCount}</span>
            </div>
          )}

          {/* Drawer Settings */}
          {showSettingsDrawer && (
            <div className="pt-2 pb-1 space-y-2.5 text-xs border-t border-neutral-200">
              <div>
                <div className="flex justify-between text-[11px] text-neutral-500 mb-1">
                  <span>{t.creativityTitle}:</span>
                  <span className="font-mono font-semibold text-neutral-800">{temperature}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={temperature}
                  onChange={(e) => onChangeTemperature(parseFloat(e.target.value))}
                  className="w-full accent-neutral-900 h-1 bg-neutral-200 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              <div>
                <span className="text-[11px] text-neutral-500 block mb-1">{t.systemPromptTitle}:</span>
                <textarea
                  rows={2}
                  value={systemInstruction}
                  onChange={(e) => onChangeSystemInstruction(e.target.value)}
                  placeholder={t.systemPromptPlaceholder}
                  className="w-full p-1.5 bg-white border border-neutral-200 rounded-lg text-xs text-neutral-800 placeholder-neutral-400 focus:outline-none focus:border-neutral-400 resize-none"
                />
              </div>

              <div className="space-y-1">
                <span className="text-[10px] text-neutral-400 uppercase tracking-wider font-semibold">
                  {language === 'en' ? 'Quick Presets:' : 'Mẫu thiết lập nhanh:'}
                </span>
                <div className="grid grid-cols-2 gap-1">
                  {currentPresets.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => onChangeSystemInstruction(preset.prompt)}
                      className="px-1.5 py-1 bg-neutral-100 hover:bg-neutral-200 rounded text-[10px] text-neutral-700 font-medium truncate text-left transition-colors cursor-pointer"
                      title={preset.prompt}
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Search */}
        <div className="p-2 border-b border-neutral-200">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2 pointer-events-none" />
            <input
              type="text"
              placeholder={t.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-7 pr-7 py-1 bg-white border border-neutral-200 rounded-lg text-xs text-neutral-800 placeholder-neutral-400 focus:outline-none focus:border-neutral-400 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 cursor-pointer"
                title={language === 'en' ? 'Clear search' : 'Xóa tìm kiếm'}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          {normalizedQuery && (
            <div className="text-[10px] text-neutral-400 mt-1 px-1 flex items-center justify-between">
              <span>{language === 'en' ? 'Filtering title & content' : 'Đang lọc theo tiêu đề & nội dung'}</span>
              <span>{filteredConversations.length} {language === 'en' ? 'results' : 'kết quả'}</span>
            </div>
          )}
        </div>

        {/* History List */}
        <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
          {filteredConversations.length === 0 ? (
            <div className="p-4 text-center text-xs text-neutral-400">
              {searchQuery ? t.noMatchingChats : t.noChatsYet}
            </div>
          ) : (
            filteredConversations.map((c) => {
              const isSelected = c.id === currentChatId;
              const isEditing = editingChatId === c.id;
              const snippet = getMatchingSnippet(c);

              return (
                <div
                  key={c.id}
                  onClick={() => onSelectChat(c.id)}
                  className={`group relative flex items-center justify-between px-2.5 py-2 rounded-xl text-xs cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-neutral-200/90 text-neutral-900 font-medium'
                      : 'text-neutral-700 hover:bg-neutral-100'
                  }`}
                >
                  <div className="flex items-start gap-2 min-w-0 flex-1 mr-1.5">
                    <MessageSquare className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${isSelected ? 'text-neutral-900' : 'text-neutral-400'}`} />
                    {isEditing ? (
                      <div className="flex items-center gap-1 w-full" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveRename(c.id, e)}
                          className="bg-white border border-neutral-400 rounded px-1.5 py-0.5 text-xs text-neutral-900 w-full outline-none"
                          autoFocus
                        />
                        <button
                          onClick={(e) => handleSaveRename(c.id, e)}
                          className="p-1 text-emerald-600 hover:bg-neutral-200 rounded"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {(c.title === 'Đoạn chat mới' || c.title === 'New chat') ? t.newChatTitle : (c.title || t.newChatTitle)}
                        </p>
                        
                        {snippet && (
                          <p className="text-[10px] text-neutral-500 truncate mt-0.5 bg-neutral-100 px-1 py-0.5 rounded border border-neutral-200">
                            💬 {snippet}
                          </p>
                        )}

                        <span className="text-[10px] text-neutral-400 flex items-center gap-1 mt-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          {formatChatTime(c.updatedAt || c.createdAt)} • {c.messages?.length || 0} {language === 'en' ? 'msgs' : 'tin nhắn'}
                        </span>
                      </div>
                    )}
                  </div>

                  {!isEditing && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={(e) => handleStartRename(c, e)}
                        className="p-1 text-neutral-400 hover:text-neutral-700 rounded"
                        title={language === 'en' ? 'Rename' : 'Đổi tên'}
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => onDeleteChat(c.id, e)}
                        className="p-1 text-neutral-400 hover:text-red-500 rounded"
                        title={language === 'en' ? 'Delete' : 'Xóa đoạn chat'}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-neutral-200 bg-white/70 space-y-2">
          {/* Monthly Stats Button */}
          <button
            onClick={onOpenAnalyticsModal}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg border border-neutral-200 hover:bg-neutral-100 text-neutral-800 text-xs font-medium transition-colors cursor-pointer shadow-xs"
          >
            <div className="flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5 text-neutral-500" />
              <span>{t.monthlyStatsBtn}</span>
            </div>
            <span className="text-[10px] text-neutral-400">{language === 'en' ? 'Open' : 'Mở'}</span>
          </button>

          {/* Key settings */}
          <button
            onClick={onOpenApiKeyModal}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-neutral-100 text-neutral-800 text-xs border border-neutral-200 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${hasCustomKey ? 'bg-emerald-500' : 'bg-amber-400'}`} />
              <span className="text-[11px] font-medium">
                {hasCustomKey 
                  ? (language === 'en' 
                      ? `Key: ${provider === 'openai' ? 'OpenAI' : provider === 'google' ? 'Google' : provider === 'claude' ? 'Claude' : provider === '9router' ? '9Router' : 'Custom'} (Saved)`
                      : `Khóa ${provider === 'openai' ? 'OpenAI' : provider === 'google' ? 'Google' : provider === 'claude' ? 'Claude' : provider === '9router' ? '9Router' : 'Cổng khác'}: Đã lưu`)
                  : t.noKeyYet}
              </span>
            </div>
            <span className="text-[11px] underline">{language === 'en' ? 'Settings' : 'Cài đặt'}</span>
          </button>

          {/* Database indicator */}
          <div className="flex items-center justify-between text-[10px] text-neutral-500 font-medium px-0.5">
            <span>{t.databaseLabel}</span>
            <span className="font-mono text-neutral-700 bg-neutral-100 px-1.5 py-0.5 rounded border border-neutral-200">
              SQLite (data/chatai.db)
            </span>
          </div>

          {/* Clear All Chats */}
          {conversations.length > 0 && (
            <div className="flex items-center justify-end pt-1 text-[11px] text-neutral-500">
              <button
                onClick={() => {
                  if (window.confirm(t.clearAllConfirm)) {
                    onClearAllChats();
                  }
                }}
                className="hover:text-red-600 transition-colors cursor-pointer"
                title={t.clearAllChats}
              >
                {t.clearAllChats}
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};
