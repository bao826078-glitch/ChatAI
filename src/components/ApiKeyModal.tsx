import React, { useState, useEffect } from 'react';
import { 
  Key, 
  CheckCircle2, 
  AlertCircle, 
  Eye, 
  EyeOff, 
  X, 
  ShieldCheck, 
  RefreshCw, 
  Trash2, 
  Server,
  Globe,
  ChevronDown,
  Sparkles,
  Cpu,
  Bot
} from 'lucide-react';
import { ApiProvider, PopularProviderOption } from '../types';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  provider: ApiProvider;
  baseUrl?: string;
  onSaveApiKey: (key: string, provider: ApiProvider, baseUrl?: string) => void;
  hasDefaultKey: boolean;
  isKeyInvalid?: boolean;
  errorMessage?: string;
}

export interface ProviderItem {
  id: ApiProvider;
  name: string;
  badge: string;
  desc: string;
  defaultUrl: string;
  keyPlaceholder: string;
  urlPlaceholder: string;
  helpText: string;
}

export const PROVIDER_OPTIONS: ProviderItem[] = [
  {
    id: 'openai',
    name: 'OpenAI (ChatGPT)',
    badge: 'OpenAI',
    desc: 'GPT-4o, GPT-4o-mini, o1, o3-mini...',
    defaultUrl: 'https://api.openai.com/v1',
    keyPlaceholder: 'Dán mã OpenAI API Key (sk-...) tại đây...',
    urlPlaceholder: 'https://api.openai.com/v1 (Để trống dùng URL mặc định)',
    helpText: 'Sử dụng API Key từ OpenAI Platform (platform.openai.com) để truy cập GPT-4o, GPT-4o-mini, o1, o3-mini.',
  },
  {
    id: 'google',
    name: 'Google (AI Studio)',
    badge: 'Google',
    desc: 'Gemini 3.8 Flash, 3.7 Flash, Flash Latest...',
    defaultUrl: '',
    keyPlaceholder: 'Dán mã Google API Key (AIzaSy...) tại đây...',
    urlPlaceholder: 'Tự động kết nối Google Generative AI (Không cần nhập URL)',
    helpText: 'Sử dụng API Key từ Google AI Studio (aistudio.google.com) với hạn mức miễn phí cao và tốc độ siêu nhanh.',
  },
  {
    id: 'claude',
    name: 'Claude (Anthropic)',
    badge: 'Claude',
    desc: 'Claude 3.5 Sonnet, 3.5 Haiku, Opus...',
    defaultUrl: 'https://api.anthropic.com/v1',
    keyPlaceholder: 'Dán mã Anthropic API Key (sk-ant-...) tại đây...',
    urlPlaceholder: 'https://api.anthropic.com/v1 (Để trống dùng URL mặc định)',
    helpText: 'Sử dụng API Key từ Anthropic Console (console.anthropic.com) để kết nối Claude 3.5 Sonnet và Claude 3.5 Haiku.',
  },
  {
    id: '9router',
    name: '9Router',
    badge: '9Router',
    desc: 'Cổng AI thông minh đa mô hình',
    defaultUrl: 'https://api.9router.com/v1',
    keyPlaceholder: 'Dán mã API Key 9Router tại đây...',
    urlPlaceholder: 'https://api.9router.com/v1 (Để trống dùng URL mặc định)',
    helpText: 'Cổng định tuyến AI tích hợp 9Router cung cấp nhiều mô hình linh hoạt với một API Key duy nhất.',
  },
  {
    id: 'other',
    name: 'Khác / Tùy chỉnh',
    badge: 'Tùy chỉnh',
    desc: 'DeepSeek, Groq, OpenRouter, Together, Ollama...',
    defaultUrl: '',
    keyPlaceholder: 'Dán mã API Key tương ứng với dịch vụ tại đây...',
    urlPlaceholder: 'Nhập địa chỉ URL gọi AI (ví dụ: https://api.deepseek.com/v1)...',
    helpText: 'Tương thích tiêu chuẩn OpenAI API: hỗ trợ DeepSeek, Groq, OpenRouter, Mistral, Ollama cục bộ hoặc máy chủ proxy tùy chỉnh.',
  },
];

const POPULAR_OTHER_PROVIDERS: PopularProviderOption[] = [
  {
    id: 'custom',
    name: 'Tùy chỉnh URL (tự do nhập địa chỉ URL)',
    url: '',
    note: 'Tự nhập địa chỉ URL gọi AI bất kỳ',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek API',
    url: 'https://api.deepseek.com/v1',
    note: 'Mô hình lập luận DeepSeek-R1 và V3 chuyên sâu',
  },
  {
    id: 'groq',
    name: 'Groq Cloud',
    url: 'https://api.groq.com/openai/v1',
    note: 'Tốc độ xử lý siêu nhanh độ trễ cực thấp LPU',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter AI',
    url: 'https://openrouter.ai/api/v1',
    note: 'Cổng định tuyến kết nối hàng trăm mô hình toàn cầu',
  },
  {
    id: 'together',
    name: 'Together AI',
    url: 'https://api.together.xyz/v1',
    note: 'Hạ tầng AI mã nguồn mở hiệu năng cao',
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    url: 'https://api.mistral.ai/v1',
    note: 'Mô hình châu Âu chất lượng cao Mistral Large / Codestral',
  },
  {
    id: 'ollama',
    name: 'Ollama (Local AI)',
    url: 'http://localhost:11434/v1',
    note: 'Chạy AI nội bộ không tốn phí trên máy tính cá nhân',
  },
];

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
  isOpen,
  onClose,
  apiKey,
  provider,
  baseUrl = '',
  onSaveApiKey,
  isKeyInvalid,
  errorMessage,
}) => {
  const [selectedProvider, setSelectedProvider] = useState<ApiProvider>(() => {
    return provider || 'openai';
  });
  const [inputKey, setInputKey] = useState(apiKey);
  const [inputBaseUrl, setInputBaseUrl] = useState<string>(baseUrl || '');
  const [selectedPopularPreset, setSelectedPopularPreset] = useState<string>('custom');
  
  const [showKey, setShowKey] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState<{
    type: 'idle' | 'success' | 'error';
    message?: string;
  }>({
    type: isKeyInvalid ? 'error' : 'idle',
    message: isKeyInvalid ? errorMessage || 'Khóa API không hợp lệ hoặc đã hết hạn.' : undefined,
  });

  // Đồng bộ khi modal được mở hoặc prop thay đổi
  useEffect(() => {
    setInputKey(apiKey);
    setSelectedProvider(provider || 'openai');
    if (baseUrl !== undefined) {
      setInputBaseUrl(baseUrl);
      const matched = POPULAR_OTHER_PROVIDERS.find((p) => p.url === baseUrl && p.url !== '');
      if (matched) {
        setSelectedPopularPreset(matched.id);
      } else {
        setSelectedPopularPreset('custom');
      }
    }
  }, [apiKey, provider, baseUrl, isOpen]);

  useEffect(() => {
    if (isKeyInvalid) {
      setVerifyStatus({
        type: 'error',
        message: errorMessage || 'Khóa API không hợp lệ hoặc đã hết hạn.',
      });
    }
  }, [isKeyInvalid, errorMessage]);

  if (!isOpen) return null;

  const currentProviderConfig = PROVIDER_OPTIONS.find((p) => p.id === selectedProvider) || PROVIDER_OPTIONS[0];

  const handleProviderChange = (newProvider: ApiProvider) => {
    setSelectedProvider(newProvider);
    setVerifyStatus({ type: 'idle' });
    setInputBaseUrl('');
    setSelectedPopularPreset('custom');
  };

  const handlePopularPresetChange = (presetId: string) => {
    setSelectedPopularPreset(presetId);
    const found = POPULAR_OTHER_PROVIDERS.find((p) => p.id === presetId);
    if (found) {
      setInputBaseUrl(found.url);
    }
  };

  const canVerify = Boolean(inputKey.trim());

  const handleVerify = async () => {
    if (!canVerify) return;
    setIsVerifying(true);
    setVerifyStatus({ type: 'idle' });

    try {
      const res = await fetch('/api/verify-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          apiKey: inputKey.trim(),
          provider: selectedProvider,
          baseUrl: inputBaseUrl.trim(),
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setVerifyStatus({
          type: 'success',
          message: data.message || `Kết nối thành công với ${currentProviderConfig.name}! Khóa API hợp lệ.`,
        });
      } else {
        setVerifyStatus({
          type: 'error',
          message: data.error || 'Khóa API hoặc địa chỉ URL không hợp lệ.',
        });
      }
    } catch (e: any) {
      setVerifyStatus({
        type: 'error',
        message: e?.message || 'Không thể kết nối đến máy chủ để kiểm tra.',
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSave = () => {
    onSaveApiKey(inputKey.trim(), selectedProvider, inputBaseUrl.trim());
    onClose();
  };

  const handleClearKey = () => {
    setInputKey('');
    setVerifyStatus({ type: 'idle' });
  };

  const handleClearUrl = () => {
    setInputBaseUrl('');
    setSelectedPopularPreset('custom');
    setVerifyStatus({ type: 'idle' });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="w-full max-w-2xl bg-white border border-neutral-300 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-neutral-900 max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-neutral-200 bg-neutral-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-neutral-900 text-white shadow-xs">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg text-neutral-900">
                Cài Đặt Khóa API & Cổng Kết Nối AI
              </h3>
              <p className="text-xs text-neutral-500 font-medium mt-0.5">
                Hỗ trợ OpenAI, Google AI Studio, Claude (Anthropic), 9Router & Cổng khác
              </p>
            </div>
          </div>
          {!isKeyInvalid && (
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-6 overflow-y-auto">
          {/* Section 1: Chọn Nhà Cung Cấp */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="font-bold text-sm sm:text-base text-neutral-900 flex items-center gap-1.5">
                <span>1. Chọn Nhà Cung Cấp API:</span>
              </label>
              <span className="text-[11px] font-semibold text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded-md border border-neutral-200">
                5 Nhà cung cấp
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
              {PROVIDER_OPTIONS.map((item) => {
                const isSelected = selectedProvider === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleProviderChange(item.id)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'border-neutral-900 bg-neutral-100/90 shadow-sm ring-1 ring-neutral-900/10'
                        : 'border-neutral-200 bg-white hover:bg-neutral-50 hover:border-neutral-400'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            isSelected ? 'bg-neutral-900 text-white' : 'bg-neutral-200 text-neutral-800'
                          }`}>
                            {item.badge}
                          </span>
                        </div>
                        <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                          isSelected ? 'border-neutral-900 bg-neutral-900' : 'border-neutral-300'
                        }`}>
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                      </div>
                      <div className="font-bold text-xs sm:text-sm text-neutral-900 truncate">
                        {item.name}
                      </div>
                    </div>
                    <p className="text-[11px] text-neutral-500 font-medium line-clamp-1 mt-1.5">
                      {item.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: Địa chỉ URL gọi AI (API Endpoint URL) */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label htmlFor="baseUrlInput" className="font-bold text-sm sm:text-base text-neutral-900 flex items-center gap-1.5">
                <span>2. Địa chỉ URL Endpoint ({currentProviderConfig.badge}):</span>
              </label>
              {inputBaseUrl && (
                <button
                  type="button"
                  onClick={handleClearUrl}
                  className="text-xs text-neutral-600 hover:text-neutral-900 font-medium underline cursor-pointer"
                >
                  Xóa trống ô URL
                </button>
              )}
            </div>

            {/* Nếu ở mục "Khác / Tùy chỉnh": Hiển thị menu chọn nhanh nhà cung cấp phổ biến */}
            {selectedProvider === 'other' && (
              <div className="space-y-1.5 bg-neutral-50 p-2.5 rounded-xl border border-neutral-200">
                <div className="flex items-center justify-between text-xs font-semibold text-neutral-700">
                  <span className="flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-neutral-500" />
                    <span>Chọn nhanh mẫu máy chủ AI phổ biến:</span>
                  </span>
                  <span className="text-[11px] text-neutral-500 font-normal">Tự điền URL tương ứng</span>
                </div>
                <div className="relative">
                  <select
                    value={selectedPopularPreset}
                    onChange={(e) => handlePopularPresetChange(e.target.value)}
                    className="w-full pl-3 pr-8 py-2 bg-white border border-neutral-300 rounded-lg text-xs font-semibold text-neutral-900 focus:outline-none focus:border-neutral-800 appearance-none cursor-pointer shadow-xs"
                  >
                    {POPULAR_OTHER_PROVIDERS.map((item) => (
                      <option key={item.id} value={item.id} className="text-neutral-900 py-1">
                        {item.name} {item.url ? `— (${item.url})` : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-neutral-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            )}

            {/* Ô nhập link URL (để trống mặc định sẽ dùng URL chuẩn của nhà cung cấp) */}
            <div className="relative">
              <input
                id="baseUrlInput"
                type="text"
                value={inputBaseUrl}
                onChange={(e) => {
                  const val = e.target.value;
                  setInputBaseUrl(val);
                  if (selectedProvider === 'other') {
                    const matched = POPULAR_OTHER_PROVIDERS.find((p) => p.url === val.trim() && p.url !== '');
                    setSelectedPopularPreset(matched ? matched.id : 'custom');
                  }
                }}
                placeholder={currentProviderConfig.urlPlaceholder}
                className="w-full px-3.5 py-2.5 bg-white border border-neutral-300 rounded-xl text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-neutral-900 font-mono shadow-xs font-medium"
              />
            </div>

            <p className="text-xs text-neutral-600 font-medium leading-relaxed">
              {currentProviderConfig.defaultUrl 
                ? `Mặc định sẽ gọi về ${currentProviderConfig.defaultUrl}. Bạn có thể để trống ô này hoặc nhập URL máy chủ proxy/cổng trung gian nếu cần.`
                : 'Bạn có thể để trống ô này để dùng cấu hình mặc định hoặc nhập địa chỉ URL tùy chỉnh.'}
            </p>
          </div>

          {/* Section 3: Mã Khóa API Key */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="apiKeyInput" className="font-bold text-sm sm:text-base text-neutral-900 flex items-center gap-1.5">
                <span>3. Mã Khóa API Key ({currentProviderConfig.name}):</span>
                {inputKey.trim() && (
                  <span className="text-emerald-700 font-semibold text-xs flex items-center gap-1 ml-1.5 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-300">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Đã nhập
                  </span>
                )}
              </label>
            </div>

            <div className="relative">
              <input
                id="apiKeyInput"
                type={showKey ? 'text' : 'password'}
                value={inputKey}
                onChange={(e) => {
                  setInputKey(e.target.value);
                  setVerifyStatus({ type: 'idle' });
                }}
                placeholder={currentProviderConfig.keyPlaceholder}
                className="w-full pl-3.5 pr-20 py-2.5 bg-white border border-neutral-300 rounded-xl text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-neutral-900 font-mono shadow-xs font-medium"
              />
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="p-1.5 text-neutral-500 hover:text-neutral-900 transition-colors cursor-pointer"
                  title={showKey ? 'Ẩn khóa' : 'Hiện khóa'}
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                {inputKey && (
                  <button
                    type="button"
                    onClick={handleClearKey}
                    className="p-1.5 text-neutral-500 hover:text-red-600 transition-colors cursor-pointer"
                    title="Xóa khóa"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            
            <p className="text-xs text-neutral-600 font-medium">
              {currentProviderConfig.helpText}
            </p>
          </div>

          {/* Verification Status Feedback */}
          {verifyStatus.type !== 'idle' && (
            <div
              className={`p-3.5 rounded-xl text-xs sm:text-sm font-medium flex items-start gap-2.5 leading-relaxed ${
                verifyStatus.type === 'success'
                  ? 'bg-emerald-50 text-emerald-900 border border-emerald-300'
                  : 'bg-red-50 text-red-900 border border-red-300'
              }`}
            >
              {verifyStatus.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
              )}
              <div className="flex-1">{verifyStatus.message}</div>
            </div>
          )}

          {/* Security Note */}
          <div className="flex items-center gap-2 text-xs text-neutral-600 font-medium pt-1">
            <ShieldCheck className="w-4 h-4 shrink-0 text-neutral-500" />
            <span>Khóa API và cấu hình được lưu trữ cục bộ bảo mật trên trình duyệt (localStorage), không lưu trên máy chủ chung.</span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-neutral-200 bg-neutral-50 shrink-0">
          <button
            type="button"
            onClick={handleVerify}
            disabled={isVerifying || !canVerify}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-neutral-200 hover:bg-neutral-300 text-neutral-900 text-xs sm:text-sm font-bold transition-colors disabled:opacity-40 cursor-pointer shadow-xs disabled:cursor-not-allowed"
            title={canVerify ? 'Kiểm tra kết nối với API' : 'Vui lòng nhập API Key để kiểm tra kết nối'}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isVerifying ? 'animate-spin' : ''}`} />
            <span>{isVerifying ? 'Đang kiểm tra...' : 'Kiểm tra kết nối'}</span>
          </button>

          <div className="flex items-center gap-2.5">
            {!isKeyInvalid && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-neutral-700 hover:text-neutral-900 text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
              >
                Đóng
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white text-xs sm:text-sm font-bold transition-colors cursor-pointer shadow-xs"
            >
              Lưu cấu hình
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
