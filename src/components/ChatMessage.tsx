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
  Key,
  Clock,
  Coins
} from 'lucide-react';
import { Message, AppLanguage } from '../types';
import { MarkdownView } from './MarkdownView';
import { estimateTokens, formatTokenCount } from '../utils/tokenEstimator';

interface ChatMessageProps {
  message: Message;
  isLast?: boolean;
  onRegenerate?: () => void;
  onRetry?: () => void;
  onOpenApiKeyModal?: () => void;
  language?: AppLanguage;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  onRegenerate,
  onRetry,
  onOpenApiKeyModal,
  language = 'en',
}) => {
  const isAI = message.sender === 'ai' || message.role === 'model';
  const [copied, setCopied] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleSpeech = () => {
    if (!('speechSynthesis' in window)) {
      return;
    }

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

  const formattedFullDate = new Date(message.timestamp).toLocaleString();

  // Token count estimation
  const tokenCount = message.estimatedTokens || estimateTokens(message.content);

  const handleRetryAction = onRegenerate || onRetry;

  return (
    <div
      className={`py-3.5 px-3 sm:px-6 transition-colors border-b ${
        isAI
          ? 'bg-neutral-50/70 border-neutral-200/80'
          : 'bg-transparent border-transparent'
      }`}
    >
      <div className="max-w-3xl mx-auto flex gap-3 sm:gap-3.5">
        {/* Avatar */}
        <div className="shrink-0 pt-0.5">
          {isAI ? (
            <div className="w-7 h-7 rounded-lg bg-neutral-900 text-white flex items-center justify-center font-bold text-xs shadow-xs">
              <Bot className="w-3.5 h-3.5" />
            </div>
          ) : (
            <div className="w-7 h-7 rounded-lg bg-neutral-200 text-neutral-700 flex items-center justify-center text-xs">
              <User className="w-3.5 h-3.5" />
            </div>
          )}
        </div>

        {/* Message Content */}
        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Header with Sender, Token Badge, and Timestamp */}
          <div className="flex items-center justify-between text-xs text-neutral-500">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-neutral-900">
                {isAI ? (language === 'vi' ? 'Trợ lý AI' : 'AI Assistant') : (language === 'vi' ? 'Bạn' : 'You')}
              </span>
              {message.modelUsed && (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-neutral-100 text-neutral-600 font-mono">
                  {message.modelUsed}
                </span>
              )}
              {tokenCount > 0 && (
                <span 
                  className="text-[10px] px-1.5 py-0.2 rounded bg-neutral-100 text-neutral-500 font-mono flex items-center gap-0.5"
                  title={language === 'vi' ? 'Số lượng token ước tính tiêu thụ' : 'Estimated token count'}
                >
                  <Coins className="w-2.5 h-2.5 text-neutral-400" />
                  ~{formatTokenCount(tokenCount)} tokens
                </span>
              )}
            </div>
            <span
              className="text-[11px] text-neutral-400 flex items-center gap-1"
              title={formattedFullDate}
            >
              <Clock className="w-3 h-3" />
              {formattedTime}
            </span>
          </div>

          {/* Message Content */}
          {message.error ? (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="font-semibold block">{language === 'vi' ? 'Thông báo lỗi kết nối' : 'Connection Error'}</span>
                  <p className="leading-relaxed text-neutral-700">
                    {message.content}
                  </p>
                </div>
              </div>

              {message.errorType === 'INVALID_OR_EXPIRED_KEY' && onOpenApiKeyModal && (
                <div className="pt-1">
                  <button
                    onClick={onOpenApiKeyModal}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium text-xs transition-colors cursor-pointer"
                  >
                    <Key className="w-3 h-3" />
                    <span>{language === 'vi' ? 'Mở cài đặt để cập nhật API Key' : 'Open settings to update API Key'}</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="prose max-w-none text-neutral-800 text-sm leading-relaxed">
              <MarkdownView content={message.content} isStreaming={message.isStreaming} />
            </div>
          )}

          {/* Action Toolbar for AI responses */}
          {isAI && !message.error && !message.isStreaming && (
            <div className="flex items-center gap-1 pt-1 opacity-80 hover:opacity-100 transition-opacity">
              <button
                onClick={handleCopy}
                className="p-1 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200 transition-colors cursor-pointer"
                title={copied ? (language === 'vi' ? 'Đã sao chép!' : 'Copied!') : (language === 'vi' ? 'Sao chép nội dung' : 'Copy message')}
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              </button>

              <button
                onClick={toggleSpeech}
                className="p-1 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200 transition-colors cursor-pointer"
                title={isSpeaking ? (language === 'vi' ? 'Dừng đọc văn bản' : 'Stop speaking') : (language === 'vi' ? 'Đọc phản hồi bằng giọng nói' : 'Read aloud')}
              >
                {isSpeaking ? <VolumeX className="w-3.5 h-3.5 text-blue-600" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>

              {handleRetryAction && (
                <button
                  onClick={handleRetryAction}
                  className="p-1 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200 transition-colors cursor-pointer"
                  title={language === 'vi' ? 'Thử tạo lại câu trả lời' : 'Regenerate response'}
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
