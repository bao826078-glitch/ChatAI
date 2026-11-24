import React, { useState } from 'react';
import {
  Bot,
  User,
  Copy,
  Check,
  Volume2,
  VolumeX,
  RotateCcw,
  AlertTriangle,
  Settings,
  Clock,
  Coins,
} from 'lucide-react';
import { Message, AppLanguage } from '../types';
import { MarkdownView } from './MarkdownView';
import { estimateTokens, formatTokenCount } from '../utils/tokenEstimator';
import { translations } from '../utils/i18n';

interface ChatMessageProps {
  message: Message;
  isLast?: boolean;
  onRegenerate?: () => void;
  onRetry?: () => void;
  onOpenSettings?: () => void;
  language: AppLanguage;
  compactMode?: boolean;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  onRegenerate,
  onRetry,
  onOpenSettings,
  language,
  compactMode = false,
}) => {
  const t = translations[language] || translations.en;
  const isAI = message.sender === 'ai' || message.role === 'model';
  const [copied, setCopied] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleSpeech = () => {
    if (!('speechSynthesis' in window)) return;
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(message.content);
    utterance.lang = language === 'vi' ? 'vi-VN' : 'en-US';
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const formattedTime = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const tokenCount = message.estimatedTokens || estimateTokens(message.content);
  const handleRetryAction = onRegenerate || onRetry;

  return (
    <div
      className={`${compactMode ? 'py-2.5' : 'py-4'} px-3 sm:px-6 transition-colors border-b ${
        isAI
          ? 'bg-neutral-50/80 dark:bg-[#111115] border-neutral-200/80 dark:border-neutral-800/80'
          : 'bg-transparent border-transparent'
      }`}
    >
      <div className="max-w-3xl mx-auto flex gap-3 sm:gap-3.5">
        <div className="shrink-0 pt-0.5">
          {isAI ? (
            <div className="w-7 h-7 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-950 flex items-center justify-center text-xs">
              <Bot className="w-3.5 h-3.5" />
            </div>
          ) : (
            <div className="w-7 h-7 rounded-lg bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 flex items-center justify-center text-xs">
              <User className="w-3.5 h-3.5" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                {isAI ? t.aiAssistantLabel : t.youLabel}
              </span>
              {message.modelUsed && (
                <span className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400">
                  · {message.modelUsed}
                </span>
              )}
              {tokenCount > 0 && (
                <span className="text-[11px] font-mono tabular-nums text-neutral-500 dark:text-neutral-400 inline-flex items-center gap-1">
                  · <Coins className="w-2.5 h-2.5" /> ~{formatTokenCount(tokenCount)} {t.tokensCount}
                </span>
              )}
            </div>
            <span className="text-[11px] font-mono tabular-nums flex items-center gap-1 shrink-0">
              <Clock className="w-3 h-3" />
              {formattedTime}
            </span>
          </div>

          {message.error ? (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-500/40 text-red-700 dark:text-red-300 text-xs space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="font-semibold block">{t.connectionErrorTitle}</span>
                  <p className="leading-relaxed text-neutral-700 dark:text-neutral-300">{message.content}</p>
                </div>
              </div>

              {message.errorType === 'INVALID_OR_EXPIRED_KEY' && onOpenSettings && (
                <div>
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium text-xs transition-colors cursor-pointer"
                  >
                    <Settings className="w-3 h-3" />
                    <span>{t.openSettingsUpdateKey}</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="prose max-w-none text-neutral-800 dark:text-neutral-200 text-sm leading-relaxed">
              <MarkdownView content={message.content} isStreaming={message.isStreaming} language={language} />
            </div>
          )}

          {isAI && !message.error && !message.isStreaming && (
            <div className="flex items-center gap-1 pt-1 opacity-80 hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={handleCopy}
                className="p-1 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-white hover:bg-neutral-200/70 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                title={copied ? t.copiedMessage : t.copyMessage}
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>

              <button
                type="button"
                onClick={toggleSpeech}
                className="p-1 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-white hover:bg-neutral-200/70 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                title={isSpeaking ? t.stopSpeaking : t.readAloud}
              >
                {isSpeaking ? <VolumeX className="w-3.5 h-3.5 text-indigo-400" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>

              {handleRetryAction && (
                <button
                  type="button"
                  onClick={handleRetryAction}
                  className="p-1 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-white hover:bg-neutral-200/70 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                  title={t.regenerate}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
