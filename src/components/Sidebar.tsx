import React, { useState } from 'react';
import {
  MessageSquarePlus,
  Search,
  Trash2,
  Cpu,
  X,
  MessageSquare,
  Edit2,
  Check,
  PanelLeftClose,
  ChevronDown,
  Clock,
  Coins,
  Settings,
  Bot,
} from 'lucide-react';
import {
  AppLanguage,
  Conversation,
  LicenseInfo,
  ModelOption,
  ProviderConfig,
  SettingsTab,
} from '../types';
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
  activeProvider?: ProviderConfig;
  onOpenSettings: (tab?: SettingsTab) => void;
  totalSessionTokens?: number;
  language: AppLanguage;
  license: LicenseInfo;
}

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
  activeProvider,
  onOpenSettings,
  totalSessionTokens = 0,
  language,
  license,
}) => {
  const t = translations[language] || translations.en;
  const [searchQuery, setSearchQuery] = useState('');
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

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

  const isCommunity = license.plan === 'community' && license.status === 'active';

  return (
    <>
      {isOpen && (
        <div
          onClick={onToggle}
          className="fixed inset-0 bg-black/50 z-30 md:hidden backdrop-blur-xs"
        />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 bg-neutral-50 dark:bg-[#0d0d10] border-neutral-200 dark:border-neutral-800 flex flex-col transition-all duration-200 ease-in-out text-neutral-900 dark:text-neutral-100 ${
          isOpen
            ? 'w-72 translate-x-0 border-r opacity-100'
            : 'w-0 -translate-x-full md:translate-x-0 md:w-0 overflow-hidden border-r-0 opacity-0 pointer-events-none'
        }`}
      >
        {/* Header */}
        <div className="p-3 border-b border-neutral-200 dark:border-neutral-800 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-950 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-semibold text-sm tracking-tight">ChatAI</span>
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  · {isCommunity ? t.planCommunity : t.planFree}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onToggle}
              className="p-1.5 rounded-lg text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/70 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              title={t.hideSidebar}
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={onNewChat}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-neutral-900 dark:bg-white hover:bg-neutral-800 dark:hover:bg-neutral-200 text-white dark:text-neutral-950 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
            <span>{t.newChatBtn}</span>
          </button>
        </div>

        {/* Active Model Quick Switch */}
        <div className="px-3 py-2.5 border-b border-neutral-200 dark:border-neutral-800 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-600 dark:text-neutral-400">
              <Cpu className="w-3.5 h-3.5" />
              <span>{t.activeModelLabel}</span>
            </span>
            {activeProvider && (
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate max-w-[110px]">
                {activeProvider.name}
              </span>
            )}
          </div>

          {models.length === 0 ? (
            <button
              type="button"
              onClick={() => onOpenSettings('providers')}
              className="w-full px-2.5 py-2 rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 hover:border-neutral-500 text-xs text-neutral-600 dark:text-neutral-400 text-left transition-colors cursor-pointer"
            >
              {activeProvider ? t.noModelsAvailable : t.noProviderConfigured}
            </button>
          ) : (
            <div className="relative">
              <select
                value={selectedModel}
                onChange={(e) => onSelectModel(e.target.value)}
                className="w-full pl-2.5 pr-7 py-1.5 bg-white dark:bg-[#151519] border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs text-neutral-900 dark:text-neutral-100 focus:outline-none appearance-none font-medium cursor-pointer"
              >
                {models.map((m) => (
                  <option key={`${m.provider || ''}-${m.id}`} value={m.id}>
                    {m.name} ({m.badge})
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-neutral-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          )}

          {totalSessionTokens > 0 && (
            <div className="flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400">
              <span className="flex items-center gap-1">
                <Coins className="w-3 h-3" />
                {t.sessionContextLabel}
              </span>
              <span className="font-mono tabular-nums">~{formatTokenCount(totalSessionTokens)} {t.tokensCount}</span>
            </div>
          )}
        </div>

        {/* Search */}
        <div className="p-2.5 border-b border-neutral-200 dark:border-neutral-800">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder={t.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 bg-white dark:bg-[#151519] border border-neutral-200 dark:border-neutral-800 rounded-lg text-xs text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-600"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
                title={t.clearSearch}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          {normalizedQuery && (
            <div className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-1 px-1 flex items-center justify-between">
              <span>{t.filteringLabel}</span>
              <span className="tabular-nums">{filteredConversations.length} {t.resultsLabel}</span>
            </div>
          )}
        </div>

        {/* Conversation History */}
        <div className="flex-1 overflow-y-auto px-2 py-1.5 space-y-0.5">
          {filteredConversations.length === 0 ? (
            <div className="p-4 text-center text-xs text-neutral-500 dark:text-neutral-400">
              {searchQuery ? t.noMatchingChats : t.noChatsYet}
            </div>
          ) : (
            filteredConversations.map((c) => {
              const isSelected = c.id === currentChatId;
              const isEditing = editingChatId === c.id;
              return (
                <div
                  key={c.id}
                  onClick={() => onSelectChat(c.id)}
                  className={`group relative flex items-center justify-between px-2.5 py-2 rounded-xl text-xs cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-neutral-200/80 dark:bg-[#1c1c22] text-neutral-900 dark:text-white font-medium'
                      : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-[#151519]'
                  }`}
                >
                  <div className="flex items-start gap-2 min-w-0 flex-1 mr-1.5">
                    <MessageSquare
                      className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                        isSelected ? 'text-neutral-900 dark:text-white' : 'text-neutral-400'
                      }`}
                    />
                    {isEditing ? (
                      <div className="flex items-center gap-1 w-full" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveRename(c.id, e)}
                          className="bg-white dark:bg-[#0d0d10] border border-neutral-400 dark:border-neutral-600 rounded px-1.5 py-0.5 text-xs w-full outline-none"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={(e) => handleSaveRename(c.id, e)}
                          className="p-1 text-emerald-500 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded cursor-pointer"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {c.title === 'Đoạn chat mới' || c.title === 'New chat' ? t.newChatTitle : c.title || t.newChatTitle}
                        </p>
                        <span className="text-[10px] text-neutral-500 dark:text-neutral-400 flex items-center gap-1 mt-0.5 font-mono tabular-nums">
                          <Clock className="w-2.5 h-2.5" />
                          {formatChatTime(c.updatedAt || c.createdAt)} · {c.messages?.length || 0} {t.msgsLabel}
                        </span>
                      </div>
                    )}
                  </div>

                  {!isEditing && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        type="button"
                        onClick={(e) => handleStartRename(c, e)}
                        className="p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-white rounded cursor-pointer"
                        title={t.renameChat}
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => onDeleteChat(c.id, e)}
                        className="p-1 text-neutral-400 hover:text-red-500 rounded cursor-pointer"
                        title={t.deleteChat}
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

        {/* Footer: Centralized Settings Entry & Clear All */}
        <div className="p-3 border-t border-neutral-200 dark:border-neutral-800 space-y-2">
          <button
            type="button"
            onClick={() => onOpenSettings('providers')}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#151519] hover:bg-neutral-100 dark:hover:bg-[#1c1c22] text-xs font-medium transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Settings className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
              <span>{t.settingsBtn}</span>
            </span>
            <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
              {activeProvider ? activeProvider.name : t.openBtn}
            </span>
          </button>

          <div className="flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400 px-0.5">
            <span className="font-mono">SQLite</span>
            {conversations.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(t.clearAllConfirm)) {
                    onClearAllChats();
                  }
                }}
                className="hover:text-red-500 transition-colors cursor-pointer"
              >
                {t.clearAllChats}
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};
