import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, Square, Mic, AlertCircle, Coins, KeyRound } from 'lucide-react';
import { estimateTokens, formatTokenCount } from '../utils/tokenEstimator';
import { AppLanguage, QuotaInfo } from '../types';
import { translations } from '../utils/i18n';

interface ChatInputProps {
  onSendMessage: (text: string) => void;
  isStreaming: boolean;
  onStopStreaming: () => void;
  disabled?: boolean;
  onOpenSettings: (tab?: 'providers' | 'models' | 'language' | 'general' | 'license') => void;
  hasReadyProvider: boolean;
  language: AppLanguage;
  quota: QuotaInfo;
  sendOnEnter?: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  isStreaming,
  onStopStreaming,
  disabled,
  onOpenSettings,
  hasReadyProvider,
  language,
  quota,
  sendOnEnter = true,
}) => {
  const t = translations[language] || translations.en;
  const [text, setText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [text]);

  const toggleSpeechRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = language === 'vi' ? 'vi-VN' : 'en-US';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onstart = () => setIsRecording(true);
      recognition.onend = () => setIsRecording(false);
      recognition.onerror = () => setIsRecording(false);

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          transcript += event.results[i][0].transcript;
        }
        if (transcript) {
          setText((prev) => (prev ? `${prev} ${transcript}` : transcript));
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsRecording(false);
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (quota.limitReached) {
      onOpenSettings('license');
      return;
    }

    if (!hasReadyProvider) {
      onOpenSettings('providers');
      return;
    }

    if (isStreaming) {
      onStopStreaming();
      return;
    }

    const trimmed = text.trim();
    if (!trimmed) return;

    onSendMessage(trimmed);
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (sendOnEnter && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const estimatedInputTokens = estimateTokens(text);

  return (
    <div className="w-full max-w-3xl mx-auto px-3 sm:px-4 pb-3 pt-1">
      {/* Quota Limit Reached Alert */}
      {quota.limitReached && (
        <div className="mb-2 p-2.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-500/40 text-red-700 dark:text-red-300 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="font-medium truncate">{t.limitReachedBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => onOpenSettings('license')}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-600 text-white text-xs font-semibold shrink-0 cursor-pointer whitespace-nowrap"
          >
            <KeyRound className="w-3 h-3" />
            <span>{t.upgradeCommunityBtn}</span>
          </button>
        </div>
      )}

      {/* Near Quota Limit Warning */}
      {!quota.limitReached && quota.nearLimit && (
        <div className="mb-2 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/25 border border-amber-300 dark:border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="truncate">
              {t.nearLimitBanner} ({quota.chatRemaining} {t.quotaRemainingShort})
            </span>
          </div>
          <button
            type="button"
            onClick={() => onOpenSettings('license')}
            className="underline font-semibold shrink-0 cursor-pointer whitespace-nowrap"
          >
            {t.upgradeCommunityBtn}
          </button>
        </div>
      )}

      {/* Input Box */}
      <div
        className={`relative rounded-2xl bg-white dark:bg-[#131317] border transition-colors ${
          quota.limitReached
            ? 'border-red-400/70 dark:border-red-500/50'
            : 'border-neutral-300 dark:border-neutral-800 focus-within:border-neutral-500 dark:focus-within:border-neutral-600'
        }`}
      >
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            quota.limitReached
              ? t.inputPlaceholderQuotaReached
              : !hasReadyProvider
              ? t.inputPlaceholderNoProvider
              : t.inputPlaceholder
          }
          rows={1}
          disabled={disabled || quota.limitReached}
          onClick={() => {
            if (!hasReadyProvider) onOpenSettings('providers');
          }}
          className="w-full py-3 pl-3.5 pr-16 bg-transparent text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none resize-none max-h-40 leading-relaxed disabled:opacity-60"
        />

        <div className="flex items-center justify-between px-2.5 pb-2 pt-0">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={toggleSpeechRecognition}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                isRecording
                  ? 'bg-red-500 text-white animate-pulse'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800'
              }`}
              title={isRecording ? t.voiceListening : t.voiceInput}
            >
              <Mic className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            {estimatedInputTokens > 0 && (
              <span className="text-[11px] font-mono tabular-nums text-neutral-400 flex items-center gap-1">
                <Coins className="w-3 h-3" />
                ~{formatTokenCount(estimatedInputTokens)} {t.tokensCount}
              </span>
            )}

            {isStreaming ? (
              <button
                type="button"
                onClick={onStopStreaming}
                className="p-2 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-950 hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors cursor-pointer"
                title={t.stopTooltip}
              >
                <Square className="w-4 h-4 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleSubmit()}
                disabled={!text.trim() || disabled || quota.limitReached}
                className="p-2 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-950 hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-not-allowed"
                title={t.sendTooltip}
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
