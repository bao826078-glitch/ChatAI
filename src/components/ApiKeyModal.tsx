import React, { useState, useEffect, useMemo } from 'react';
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
  Globe, 
  ChevronDown 
} from 'lucide-react';
import { ApiProvider, PopularProviderOption, AppLanguage } from '../types';

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
  language?: AppLanguage;
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

export const getProviderOptions = (lang: AppLanguage = 'en'): ProviderItem[] => [
  {
    id: 'openai',
    name: 'OpenAI (ChatGPT)',
    badge: 'OpenAI',
    desc: 'GPT-4o, GPT-4o-mini, o1, o3-mini...',
    defaultUrl: 'https://api.openai.com/v1',
    keyPlaceholder: lang === 'vi' 
      ? 'Dán mã OpenAI API Key (sk-...) tại đây...' 
      : 'Paste OpenAI API Key (sk-...) here...',
    urlPlaceholder: lang === 'vi' 
      ? 'https://api.openai.com/v1 (Để trống dùng URL mặc định)' 
      : 'https://api.openai.com/v1 (Leave empty for default URL)',
    helpText: lang === 'vi' 
      ? 'Sử dụng API Key từ OpenAI Platform (platform.openai.com) để truy cập GPT-4o, GPT-4o-mini, o1, o3-mini.' 
      : 'Use API Key from OpenAI Platform (platform.openai.com) to access GPT-4o, GPT-4o-mini, o1, o3-mini.',
  },
  {
    id: 'google',
    name: 'Google (AI Studio)',
    badge: 'Google',
    desc: 'Gemini 3.8 Flash, 3.7 Flash, Flash Latest...',
    defaultUrl: '',
    keyPlaceholder: lang === 'vi' 
      ? 'Dán mã Google API Key (AIzaSy...) tại đây...' 
      : 'Paste Google API Key (AIzaSy...) here...',
    urlPlaceholder: lang === 'vi' 
      ? 'Tự động kết nối Google Generative AI (Không cần nhập URL)' 
      : 'Auto-connects to Google Generative AI (No URL required)',
    helpText: lang === 'vi' 
      ? 'Sử dụng API Key từ Google AI Studio (aistudio.google.com) với hạn mức miễn phí cao và tốc độ siêu nhanh.' 
      : 'Use API Key from Google AI Studio (aistudio.google.com) with generous free tier and ultra-fast speed.',
  },
  {
    id: 'claude',
    name: 'Claude (Anthropic)',
    badge: 'Claude',
    desc: 'Claude 3.5 Sonnet, 3.5 Haiku, Opus...',
    defaultUrl: 'https://api.anthropic.com/v1',
    keyPlaceholder: lang === 'vi' 
      ? 'Dán mã Anthropic API Key (sk-ant-...) tại đây...' 
      : 'Paste Anthropic API Key (sk-ant-...) here...',
    urlPlaceholder: lang === 'vi' 
      ? 'https://api.anthropic.com/v1 (Để trống dùng URL mặc định)' 
      : 'https://api.anthropic.com/v1 (Leave empty for default URL)',
    helpText: lang === 'vi' 
      ? 'Sử dụng API Key từ Anthropic Console (console.anthropic.com) để kết nối Claude 3.5 Sonnet và Claude 3.5 Haiku.' 
      : 'Use API Key from Anthropic Console (console.anthropic.com) to connect Claude 3.5 Sonnet and Haiku.',
  },
  {
    id: '9router',
    name: '9Router',
    badge: '9Router',
    desc: lang === 'vi' ? 'Cổng AI thông minh đa mô hình' : 'Smart multi-model AI routing gateway',
    defaultUrl: 'http://localhost/v1',
    keyPlaceholder: lang === 'vi' 
      ? 'Dán mã API Key 9Router tại đây...' 
      : 'Paste 9Router API Key here...',
    urlPlaceholder: lang === 'vi' 
      ? 'http://localhost/v1 (Để trống dùng URL mặc định)' 
      : 'http://localhost/v1 (Leave empty for default URL)',
    helpText: lang === 'vi' 
      ? 'Cổng định tuyến AI tích hợp 9Router cung cấp nhiều mô hình linh hoạt với một API Key duy nhất.' 
      : 'Integrated 9Router gateway provides multiple flexible models with a single API Key.',
  },
  {
    id: 'other',
    name: lang === 'vi' ? 'Khác / Tùy chỉnh' : 'Other / Custom',
    badge: lang === 'vi' ? 'Tùy chỉnh' : 'Custom',
    desc: 'DeepSeek, Groq, OpenRouter, Together, Ollama...',
    defaultUrl: '',
    keyPlaceholder: lang === 'vi' 
      ? 'Dán mã API Key tương ứng với dịch vụ tại đây...' 
      : 'Paste service API Key here...',
    urlPlaceholder: lang === 'vi' 
      ? 'Nhập địa chỉ URL gọi AI (ví dụ: https://api.deepseek.com/v1)...' 
      : 'Enter AI endpoint URL (e.g. https://api.deepseek.com/v1)...',
    helpText: lang === 'vi' 
      ? 'Tương thích tiêu chuẩn OpenAI API: hỗ trợ DeepSeek, Groq, OpenRouter, Mistral, Ollama cục bộ hoặc máy chủ proxy tùy chỉnh.' 
      : 'OpenAI-compatible standard: supports DeepSeek, Groq, OpenRouter, Mistral, local Ollama or custom proxy servers.',
  },
];

export const getPopularOtherProviders = (lang: AppLanguage = 'en'): PopularProviderOption[] => [
  {
    id: 'custom',
    name: lang === 'vi' ? 'Tùy chỉnh URL (tự do nhập địa chỉ URL)' : 'Custom URL (freely enter custom endpoint)',
    url: '',
    note: lang === 'vi' ? 'Tự nhập địa chỉ URL gọi AI bất kỳ' : 'Enter any custom AI endpoint URL',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek API',
    url: 'https://api.deepseek.com/v1',
    note: lang === 'vi' ? 'Mô hình lập luận DeepSeek-R1 và V3 chuyên sâu' : 'DeepSeek-R1 and V3 advanced reasoning models',
  },
  {
    id: 'groq',
    name: 'Groq Cloud',
    url: 'https://api.groq.com/openai/v1',
    note: lang === 'vi' ? 'Tốc độ xử lý siêu nhanh độ trễ cực thấp LPU' : 'Ultra-fast low-latency LPU inference',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter AI',
    url: 'https://openrouter.ai/api/v1',
    note: lang === 'vi' ? 'Cổng định tuyến kết nối hàng trăm mô hình toàn cầu' : 'Unified routing gateway connecting hundreds of global models',
  },
  {
    id: 'together',
    name: 'Together AI',
    url: 'https://api.together.xyz/v1',
    note: lang === 'vi' ? 'Hạ tầng AI mã nguồn mở hiệu năng cao' : 'High-performance open-source AI infrastructure',
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    url: 'https://api.mistral.ai/v1',
    note: lang === 'vi' ? 'Mô hình châu Âu chất lượng cao Mistral Large / Codestral' : 'European AI: Mistral Large / Codestral models',
  },
  {
    id: 'ollama',
    name: 'Ollama (Local AI)',
    url: 'http://localhost:11434/v1',
    note: lang === 'vi' ? 'Chạy AI nội bộ không tốn phí trên máy tính cá nhân' : 'Run local AI models for free on your own computer',
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
  language = 'en',
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
    message: isKeyInvalid 
      ? errorMessage || (language === 'vi' ? 'Khóa API không hợp lệ hoặc đã hết hạn.' : 'API Key is invalid or expired.') 
      : undefined,
  });

  const providerOptions = useMemo(() => getProviderOptions(language), [language]);
  const popularProviders = useMemo(() => getPopularOtherProviders(language), [language]);
  const currentProviderConfig = providerOptions.find((p) => p.id === selectedProvider) || providerOptions[0];

  // Synchronize state when modal opens or props change
  useEffect(() => {
    setInputKey(apiKey);
    setSelectedProvider(provider || 'openai');
    if (baseUrl !== undefined) {
      setInputBaseUrl(baseUrl);
      const matched = popularProviders.find((p) => p.url === baseUrl && p.url !== '');
      if (matched) {
        setSelectedPopularPreset(matched.id);
      } else {
        setSelectedPopularPreset('custom');
      }
    }
  }, [apiKey, provider, baseUrl, isOpen, popularProviders]);

  useEffect(() => {
    if (isKeyInvalid) {
      setVerifyStatus({
        type: 'error',
        message: errorMessage || (language === 'vi' ? 'Khóa API không hợp lệ hoặc đã hết hạn.' : 'API Key is invalid or expired.'),
      });
    }
  }, [isKeyInvalid, errorMessage, language]);

  if (!isOpen) return null;

  const handleProviderChange = (newProvider: ApiProvider) => {
    setSelectedProvider(newProvider);
    setVerifyStatus({ type: 'idle' });
    setInputBaseUrl('');
    setSelectedPopularPreset('custom');
  };

  const handlePopularPresetChange = (presetId: string) => {
    setSelectedPopularPreset(presetId);
    const found = popularProviders.find((p) => p.id === presetId);
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
          message: data.message || (language === 'vi' 
            ? `Kết nối thành công với ${currentProviderConfig.name}! Khóa API hợp lệ.` 
            : `Connection to ${currentProviderConfig.name} succeeded! API Key is valid.`),
        });
      } else {
        setVerifyStatus({
          type: 'error',
          message: data.error || (language === 'vi' 
            ? 'Khóa API hoặc địa chỉ URL không hợp lệ.' 
            : 'Invalid API Key or endpoint URL.'),
        });
      }
    } catch (e: any) {
      setVerifyStatus({
        type: 'error',
        message: e?.message || (language === 'vi' 
          ? 'Không thể kết nối đến máy chủ để kiểm tra.' 
          : 'Could not connect to the server for verification.'),
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
                {language === 'vi' ? 'Cài Đặt Khóa API & Cổng Kết Nối AI' : 'API Key & AI Provider Settings'}
              </h3>
              <p className="text-xs text-neutral-500 font-medium mt-0.5">
                {language === 'vi' 
                  ? 'Hỗ trợ OpenAI, Google AI Studio, Claude (Anthropic), 9Router & Cổng khác' 
                  : 'Supports OpenAI, Google AI Studio, Claude (Anthropic), 9Router & Custom Endpoints'}
              </p>
            </div>
          </div>
          {!isKeyInvalid && (
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200 transition-colors cursor-pointer"
              title={language === 'vi' ? 'Đóng' : 'Close'}
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-6 overflow-y-auto">
          {/* Section 1: Choose AI Provider */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="font-bold text-sm sm:text-base text-neutral-900 flex items-center gap-1.5">
                <span>{language === 'vi' ? '1. Chọn Nhà Cung Cấp API:' : '1. Select API Provider:'}</span>
              </label>
              <span className="text-[11px] font-semibold text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded-md border border-neutral-200">
                {language === 'vi' ? `${providerOptions.length} Nhà cung cấp` : `${providerOptions.length} Providers`}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
              {providerOptions.map((item) => {
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

          {/* Section 2: AI Endpoint Base URL */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label htmlFor="baseUrlInput" className="font-bold text-sm sm:text-base text-neutral-900 flex items-center gap-1.5">
                <span>{language === 'vi' ? '2. Địa chỉ URL Endpoint' : '2. Endpoint Base URL'} ({currentProviderConfig.badge}):</span>
              </label>
              {inputBaseUrl && (
                <button
                  type="button"
                  onClick={handleClearUrl}
                  className="text-xs text-neutral-600 hover:text-neutral-900 font-medium underline cursor-pointer"
                >
                  {language === 'vi' ? 'Xóa trống ô URL' : 'Clear URL'}
                </button>
              )}
            </div>

            {/* Custom/Other Provider Preset Selection */}
            {selectedProvider === 'other' && (
              <div className="space-y-1.5 bg-neutral-50 p-2.5 rounded-xl border border-neutral-200">
                <div className="flex items-center justify-between text-xs font-semibold text-neutral-700">
                  <span className="flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-neutral-500" />
                    <span>{language === 'vi' ? 'Chọn nhanh mẫu máy chủ AI phổ biến:' : 'Quick-select popular AI provider:'}</span>
                  </span>
                  <span className="text-[11px] text-neutral-500 font-normal">
                    {language === 'vi' ? 'Tự điền URL tương ứng' : 'Auto-fills endpoint URL'}
                  </span>
                </div>
                <div className="relative">
                  <select
                    value={selectedPopularPreset}
                    onChange={(e) => handlePopularPresetChange(e.target.value)}
                    className="w-full pl-3 pr-8 py-2 bg-white border border-neutral-300 rounded-lg text-xs font-semibold text-neutral-900 focus:outline-none focus:border-neutral-800 appearance-none cursor-pointer shadow-xs"
                  >
                    {popularProviders.map((item) => (
                      <option key={item.id} value={item.id} className="text-neutral-900 py-1">
                        {item.name} {item.url ? `— (${item.url})` : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-neutral-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            )}

            {/* Base URL input field */}
            <div className="relative">
              <input
                id="baseUrlInput"
                type="text"
                value={inputBaseUrl}
                onChange={(e) => {
                  const val = e.target.value;
                  setInputBaseUrl(val);
                  if (selectedProvider === 'other') {
                    const matched = popularProviders.find((p) => p.url === val.trim() && p.url !== '');
                    setSelectedPopularPreset(matched ? matched.id : 'custom');
                  }
                }}
                placeholder={currentProviderConfig.urlPlaceholder}
                className="w-full px-3.5 py-2.5 bg-white border border-neutral-300 rounded-xl text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-neutral-900 font-mono shadow-xs font-medium"
              />
            </div>

            <p className="text-xs text-neutral-600 font-medium leading-relaxed">
              {currentProviderConfig.defaultUrl 
                ? (language === 'vi' 
                    ? `Mặc định sẽ gọi về ${currentProviderConfig.defaultUrl}. Bạn có thể để trống ô này hoặc nhập URL máy chủ proxy/cổng trung gian nếu cần.`
                    : `Defaults to ${currentProviderConfig.defaultUrl}. You may leave this blank or specify a custom proxy/gateway URL if needed.`)
                : (language === 'vi' 
                    ? 'Bạn có thể để trống ô này để dùng cấu hình mặc định hoặc nhập địa chỉ URL tùy chỉnh.'
                    : 'You may leave this blank to use default configuration or enter a custom endpoint URL.')}
            </p>
          </div>

          {/* Section 3: API Key */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="apiKeyInput" className="font-bold text-sm sm:text-base text-neutral-900 flex items-center gap-1.5">
                <span>{language === 'vi' ? '3. Mã Khóa API Key' : '3. API Key'} ({currentProviderConfig.name}):</span>
                {inputKey.trim() && (
                  <span className="text-emerald-700 font-semibold text-xs flex items-center gap-1 ml-1.5 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-300">
                    <CheckCircle2 className="w-3.5 h-3.5" /> {language === 'vi' ? 'Đã nhập' : 'Entered'}
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
                  title={showKey ? (language === 'vi' ? 'Ẩn khóa' : 'Hide key') : (language === 'vi' ? 'Hiện khóa' : 'Show key')}
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                {inputKey && (
                  <button
                    type="button"
                    onClick={handleClearKey}
                    className="p-1.5 text-neutral-500 hover:text-red-600 transition-colors cursor-pointer"
                    title={language === 'vi' ? 'Xóa khóa' : 'Clear key'}
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
            <span>
              {language === 'vi'
                ? 'Khóa API và cấu hình được lưu trữ cục bộ bảo mật trên trình duyệt (localStorage), không lưu trên máy chủ chung.'
                : 'API key and settings are securely stored locally in your browser (localStorage), never exposed to external servers.'}
            </span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-neutral-200 bg-neutral-50 shrink-0">
          <button
            type="button"
            onClick={handleVerify}
            disabled={isVerifying || !canVerify}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-neutral-200 hover:bg-neutral-300 text-neutral-900 text-xs sm:text-sm font-bold transition-colors disabled:opacity-40 cursor-pointer shadow-xs disabled:cursor-not-allowed"
            title={canVerify 
              ? (language === 'vi' ? 'Kiểm tra kết nối với API' : 'Verify connection with API') 
              : (language === 'vi' ? 'Vui lòng nhập API Key để kiểm tra kết nối' : 'Please enter an API Key to verify connection')}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isVerifying ? 'animate-spin' : ''}`} />
            <span>
              {isVerifying 
                ? (language === 'vi' ? 'Đang kiểm tra...' : 'Verifying...') 
                : (language === 'vi' ? 'Kiểm tra kết nối' : 'Verify Connection')}
            </span>
          </button>

          <div className="flex items-center gap-2.5">
            {!isKeyInvalid && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-neutral-700 hover:text-neutral-900 text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
              >
                {language === 'vi' ? 'Đóng' : 'Close'}
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white text-xs sm:text-sm font-bold transition-colors cursor-pointer shadow-xs"
            >
              {language === 'vi' ? 'Lưu cấu hình' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
