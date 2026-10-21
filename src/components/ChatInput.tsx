import React, { useState, useRef, useEffect } from 'react';
import { 
  ArrowUp, 
  Square, 
  Mic, 
  AlertCircle,
  Coins
} from 'lucide-react';
import { estimateTokens, formatTokenCount } from '../utils/tokenEstimator';

interface ChatInputProps {
  onSendMessage: (text: string) => void;
  isStreaming: boolean;
  onStopStreaming: () => void;
  disabled?: boolean;
  onOpenApiKeyModal: () => void;
  hasApiKey: boolean;
  isKeyInvalid?: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  isStreaming,
  onStopStreaming,
  disabled,
  onOpenApiKeyModal,
  hasApiKey,
  isKeyInvalid,
}) => {
  const [text, setText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [text]);

  // Web Speech recognition (Vietnamese voice to text)
  const toggleSpeechRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      return;
    }

    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'vi-VN';
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
    } catch (e) {
      setIsRecording(false);
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isKeyInvalid || !hasApiKey) {
      onOpenApiKeyModal();
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
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Real-time estimated token count
  const estimatedInputTokens = estimateTokens(text);

  return (
    <div className="w-full max-w-3xl mx-auto px-3 sm:px-4 pb-3 pt-1">
      {/* Warning banner when key is invalid */}
      {isKeyInvalid && (
        <div 
          onClick={onOpenApiKeyModal}
          className="mb-2 p-2.5 rounded-xl bg-red-50 border border-red-300 text-red-700 text-xs flex items-center justify-between cursor-pointer hover:opacity-90 transition-opacity shadow-xs"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
            <span className="font-medium">
              Khóa API không hợp lệ hoặc đã hết hạn. Đã tạm dừng kết nối với AI.
            </span>
          </div>
          <span className="underline font-semibold shrink-0">Cập nhật ngay</span>
        </div>
      )}

      {/* Input box */}
      <div className={`relative rounded-2xl bg-white border transition-all shadow-xs ${
        isKeyInvalid
          ? 'border-red-400 ring-1 ring-red-400/20'
          : 'border-neutral-300 focus-within:border-neutral-500 focus-within:ring-1 focus-within:ring-neutral-400/30'
      }`}>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isKeyInvalid
              ? 'Khóa API không hợp lệ. Vui lòng bấm vào đây để cập nhật...'
              : !hasApiKey
              ? 'Vui lòng nhập API Key để tải mô hình và trò chuyện... (Bấm để cài đặt)'
              : 'Nhắn tin cho AI... (Enter để gửi, Shift+Enter xuống dòng)'
          }
          rows={1}
          disabled={disabled}
          onClick={() => {
            if (isKeyInvalid || !hasApiKey) onOpenApiKeyModal();
          }}
          className="w-full py-3 pl-3.5 pr-20 bg-transparent text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none resize-none max-h-40 leading-relaxed disabled:opacity-60"
        />

        {/* Action Row */}
        <div className="flex items-center justify-between px-2.5 pb-2 pt-0">
          <div className="flex items-center gap-1">
            {/* Voice Input */}
            <button
              type="button"
              onClick={toggleSpeechRecognition}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                isRecording
                  ? 'bg-red-500 text-white animate-pulse'
                  : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100'
              }`}
              title={isRecording ? 'Đang lắng nghe... Bấm để dừng' : 'Nhập giọng nói bằng tiếng Việt'}
            >
              <Mic className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Live estimated tokens */}
            {estimatedInputTokens > 0 && (
              <span className="text-[11px] font-mono text-neutral-400 flex items-center gap-1">
                <Coins className="w-3 h-3 text-neutral-400" />
                ~{formatTokenCount(estimatedInputTokens)} tokens
              </span>
            )}

            {/* Send / Stop button */}
            {isStreaming ? (
              <button
                type="button"
                onClick={onStopStreaming}
                className="p-2 rounded-xl bg-neutral-900 text-white hover:bg-neutral-800 transition-colors cursor-pointer shadow-xs"
                title="Dừng phản hồi"
              >
                <Square className="w-4 h-4 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleSubmit()}
                disabled={!text.trim() || disabled}
                className="p-2 rounded-xl bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-30 disabled:hover:bg-neutral-900 transition-colors cursor-pointer shadow-xs disabled:cursor-not-allowed"
                title="Gửi tin nhắn"
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
