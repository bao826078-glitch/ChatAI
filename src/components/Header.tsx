import React from 'react';
import {
  Settings,
  Trash2,
  HelpCircle,
  PanelLeft,
  BarChart3,
  Lock,
} from 'lucide-react';
import { AppLanguage, LicenseInfo, ModelOption, QuotaInfo } from '../types';
import { translations } from '../utils/i18n';

interface HeaderProps {
  onToggleSidebar: () => void;
  isSidebarOpen?: boolean;
  title: string;
  selectedModel: string;
  models: ModelOption[];
  onOpenSettings: (tab?: 'providers' | 'models' | 'language' | 'general' | 'license') => void;
  onOpenAnalyticsModal: () => void;
  onClearCurrentChat: () => void;
  hasMessages: boolean;
  onOpenHelpModal: () => void;
  language: AppLanguage;
  license: LicenseInfo;
  quota: QuotaInfo;
  hasProviderConfigured: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onToggleSidebar,
  isSidebarOpen = true,
  title,
  selectedModel,
  models,
  onOpenSettings,
  onOpenAnalyticsModal,
  onClearCurrentChat,
  hasMessages,
  onOpenHelpModal,
  language,
  license,
  quota,
  hasProviderConfigured,
}) => {
  const t = translations[language] || translations.en;
  const currentModelObj = models.find((m) => m.id === selectedModel);
  const isCommunity = license.plan === 'community' && license.status === 'active';
  const hasAnalyticsAccess = isCommunity && license.entitlements.usageAnalytics && license.entitlements.tokenHistory;

  return (
    <header className="h-13 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#0d0d10] px-3 sm:px-5 flex items-center justify-between gap-4 z-20 shrink-0 transition-colors">
      {/* Left: Sidebar toggle + Title & Active Model */}
      <div className="flex items-center gap-2.5 min-w-0">
        {!isSidebarOpen && (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="p-1.5 rounded-lg text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer shrink-0"
            title={t.showSidebar}
          >
            <PanelLeft className="w-4 h-4" />
          </button>
        )}

        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-xs sm:text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate max-w-[140px] sm:max-w-xs md:max-w-md">
            {title === 'Đoạn chat mới' || title === 'New chat' ? t.newChatTitle : title || t.newChatTitle}
          </h2>
          {!hasProviderConfigured ? (
            <button
              type="button"
              onClick={() => onOpenSettings('providers')}
              className="hidden sm:inline-flex text-xs text-amber-600 dark:text-amber-400 hover:underline cursor-pointer whitespace-nowrap"
            >
              · {t.noModelWarning}
            </button>
          ) : currentModelObj || selectedModel ? (
            <span className="hidden sm:inline-block text-xs text-neutral-500 dark:text-neutral-400 font-mono truncate max-w-[180px]">
              · {currentModelObj?.name || selectedModel}
            </span>
          ) : null}
        </div>
      </div>

      {/* Right Tools: Quota status + Usage + Unified Settings + Clear + Help */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {/* Quota Counter */}
        <button
          type="button"
          onClick={() => onOpenSettings('license')}
          className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer whitespace-nowrap"
          title={`${t.currentPlanLabel}: ${isCommunity ? t.planCommunity : t.planFree}`}
        >
          <span className="font-semibold text-neutral-900 dark:text-white">
            {isCommunity ? t.planCommunity : t.planFree}
          </span>
          <span aria-hidden="true" className="text-neutral-400">·</span>
          <span className={`font-mono tabular-nums ${quota.limitReached ? 'text-red-500 font-semibold' : quota.nearLimit ? 'text-amber-500 font-semibold' : ''}`}>
            {quota.chatRemaining}/{quota.chatLimit}
          </span>
        </button>

        {/* Usage Analytics & Token History */}
        <button
          type="button"
          onClick={onOpenAnalyticsModal}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
          title={hasAnalyticsAccess ? t.usageAnalyticsTooltip : t.usageAnalyticsLockedTooltip}
        >
          {hasAnalyticsAccess ? (
            <BarChart3 className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
          ) : (
            <Lock className="w-3.5 h-3.5 text-neutral-400" />
          )}
          <span className="hidden sm:inline">{t.usageAnalyticsBtn}</span>
        </button>

        {/* Unified Settings Button */}
        <button
          type="button"
          onClick={() => onOpenSettings('providers')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 dark:bg-white hover:bg-neutral-800 dark:hover:bg-neutral-200 text-white dark:text-neutral-950 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
          title={t.settingsTooltip}
        >
          <Settings className="w-3.5 h-3.5" />
          <span>{t.settingsBtn}</span>
        </button>

        {/* Clear Current Chat */}
        {hasMessages && (
          <button
            type="button"
            onClick={onClearCurrentChat}
            className="p-1.5 rounded-lg text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            title={t.clearChatTooltip}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}

        {/* Help */}
        <button
          type="button"
          onClick={onOpenHelpModal}
          className="p-1.5 rounded-lg text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
          title={t.helpTooltip}
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
