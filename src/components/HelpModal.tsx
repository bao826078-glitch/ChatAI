import React, { useState } from 'react';
import { X, ShieldCheck, Server, BarChart3, Terminal, KeyRound } from 'lucide-react';
import { AppLanguage, SettingsTab } from '../types';
import { translations } from '../utils/i18n';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings: (tab?: SettingsTab) => void;
  language: AppLanguage;
}

export const HelpModal: React.FC<HelpModalProps> = ({
  isOpen,
  onClose,
  onOpenSettings,
  language,
}) => {
  const t = translations[language] || translations.en;
  const [activeTab, setActiveTab] = useState<'guide' | 'docker'>('guide');

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/70 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-white dark:bg-[#111114] border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xl overflow-hidden flex flex-col text-neutral-900 dark:text-neutral-100 max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#151519] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-950">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base">{t.helpModalTitle}</h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {language === 'vi'
                  ? 'Kiến trúc, bản quyền Keygate & triển khai Docker'
                  : 'Architecture, Keygate licensing & Docker deployment'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/70 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex border-b border-neutral-200 dark:border-neutral-800 px-5 pt-2 bg-neutral-50/50 dark:bg-[#151519]/60">
          <button
            type="button"
            onClick={() => setActiveTab('guide')}
            className={`pb-2 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'guide'
                ? 'border-neutral-900 dark:border-white text-neutral-900 dark:text-white'
                : 'border-transparent text-neutral-500 dark:text-neutral-400'
            }`}
          >
            {language === 'vi' ? 'Tính năng & Gói sử dụng' : 'Features & Plans'}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('docker')}
            className={`pb-2 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'docker'
                ? 'border-neutral-900 dark:border-white text-neutral-900 dark:text-white'
                : 'border-transparent text-neutral-500 dark:text-neutral-400'
            }`}
          >
            {language === 'vi' ? 'Chạy cục bộ & Docker' : 'Local & Docker'}
          </button>
        </div>

        <div className="p-5 space-y-3.5 overflow-y-auto text-xs text-neutral-600 dark:text-neutral-300">
          {activeTab === 'guide' ? (
            <>
              <div className="p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#151519] space-y-1">
                <div className="flex items-center gap-2 font-semibold text-neutral-900 dark:text-white">
                  <Server className="w-4 h-4" />
                  <span>{language === 'vi' ? 'Quản lý Provider & Model tập trung' : 'Unified Provider & Model Hub'}</span>
                </div>
                <p className="leading-relaxed">
                  {language === 'vi'
                    ? 'Thêm nhiều nhà cung cấp (OpenAI, Google Gemini, Claude, 9Router, Ollama/DeepSeek/Groq) trong Settings. API Key được mã hóa ở Backend.'
                    : 'Manage multiple AI providers (OpenAI, Google Gemini, Claude, 9Router, Ollama/DeepSeek/Groq) in Settings. API keys are encrypted at rest on the backend.'}
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#151519] space-y-1">
                <div className="flex items-center gap-2 font-semibold text-neutral-900 dark:text-white">
                  <KeyRound className="w-4 h-4" />
                  <span>{language === 'vi' ? 'Hai gói Free & Community (Keygate)' : 'Free & Community Plans (Keygate)'}</span>
                </div>
                <p className="leading-relaxed">
                  {language === 'vi'
                    ? 'Gói Free cho phép chat với hạn mức ngày do Backend kiểm soát. Kích hoạt License Key hợp lệ để mở khóa gói Community.'
                    : 'Free plan includes daily backend-enforced chat quotas. Activate a valid Keygate license key to unlock Community capabilities.'}
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#151519] space-y-1">
                <div className="flex items-center gap-2 font-semibold text-neutral-900 dark:text-white">
                  <BarChart3 className="w-4 h-4" />
                  <span>{language === 'vi' ? 'Lịch sử Token Usage (Community)' : 'Token Usage History (Community)'}</span>
                </div>
                <p className="leading-relaxed">
                  {language === 'vi'
                    ? 'Theo dõi Prompt/Completion/Total Tokens thực tế từ nhà cung cấp theo từng ngày, nhà cung cấp và mô hình.'
                    : 'Track real prompt, completion, and total tokens recorded server-side by date, provider, and model.'}
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#151519] space-y-1">
                <div className="flex items-center gap-2 font-semibold text-neutral-900 dark:text-white">
                  <ShieldCheck className="w-4 h-4" />
                  <span>{language === 'vi' ? 'Bảo mật & Lưu trữ SQLite' : 'Security & SQLite Persistence'}</span>
                </div>
                <p className="leading-relaxed">
                  {language === 'vi'
                    ? 'Lịch sử trò chuyện, cấu hình và thống kê được lưu bền vững trong SQLite (/data/chatai.db trên Docker).'
                    : 'Conversations, provider configurations, and analytics persist in SQLite (/data/chatai.db in Docker).'}
                </p>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#151519] space-y-2">
                <p className="font-semibold text-neutral-900 dark:text-white">NPM Development</p>
                <pre className="p-2.5 rounded-lg bg-neutral-900 text-neutral-100 font-mono text-xs overflow-x-auto">
                  npm install && npm run dev
                </pre>
              </div>
              <div className="p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#151519] space-y-2">
                <p className="font-semibold text-neutral-900 dark:text-white">Docker (Port 8088)</p>
                <pre className="p-2.5 rounded-lg bg-neutral-900 text-neutral-100 font-mono text-xs overflow-x-auto">
                  docker run -d -p 8088:8088 -v chatai_data:/data bao826078/chatai:latest
                </pre>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#151519] shrink-0">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenSettings('providers');
            }}
            className="text-xs font-semibold underline cursor-pointer"
          >
            {t.openSettingsBtn}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-950 text-xs font-semibold cursor-pointer"
          >
            {t.closeBtn}
          </button>
        </div>
      </div>
    </div>
  );
};
