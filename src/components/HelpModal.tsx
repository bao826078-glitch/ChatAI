import React, { useState } from 'react';
import { 
  X, 
  Key, 
  ShieldCheck, 
  Server,
  BarChart3,
  Terminal,
  PackageCheck,
  Play
} from 'lucide-react';
import { AppLanguage } from '../types';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenApiKeyModal: () => void;
  onOpenAnalyticsModal?: () => void;
  language?: AppLanguage;
}

export const HelpModal: React.FC<HelpModalProps> = ({
  isOpen,
  onClose,
  onOpenApiKeyModal,
  onOpenAnalyticsModal,
  language = 'en',
}) => {
  const [activeTab, setActiveTab] = useState<'guide' | 'npm'>('npm');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="w-full max-w-xl bg-white border border-neutral-300 rounded-2xl shadow-xl overflow-hidden flex flex-col text-neutral-900 max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-200 bg-neutral-50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-neutral-900 text-white">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-neutral-900">
                {language === 'vi' ? 'Thông Tin Hệ Thống & Hướng Dẫn Chạy NPM' : 'System Information & NPM Guide'}
              </h3>
              <p className="text-xs text-neutral-500 font-medium">
                {language === 'vi' ? 'Cài đặt thư viện, cấu hình cổng AI và chạy phần mềm cục bộ' : 'Install dependencies, configure AI endpoints and run locally'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Toggle */}
        <div className="flex border-b border-neutral-200 px-5 pt-2 bg-neutral-50/50">
          <button
            type="button"
            onClick={() => setActiveTab('npm')}
            className={`pb-2 px-3 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === 'npm'
                ? 'border-neutral-900 text-neutral-900'
                : 'border-transparent text-neutral-500 hover:text-neutral-800'
            }`}
          >
            {language === 'vi' ? 'Cách cài đặt & chạy bằng NPM' : 'Setup & Run with NPM'}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('guide')}
            className={`pb-2 px-3 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === 'guide'
                ? 'border-neutral-900 text-neutral-900'
                : 'border-transparent text-neutral-500 hover:text-neutral-800'
            }`}
          >
            {language === 'vi' ? 'Tính năng & Kiến trúc' : 'Features & Architecture'}
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 overflow-y-auto text-xs text-neutral-700">
          {activeTab === 'npm' ? (
            <div className="space-y-4">
              {/* Step 1: Install */}
              <div className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50 space-y-2">
                <div className="flex items-center gap-2 font-bold text-neutral-900 text-xs sm:text-sm">
                  <PackageCheck className="w-4 h-4 text-emerald-600" />
                  <span>
                    {language === 'vi' 
                      ? 'Bước 1: Cài đặt phần mềm & thư viện (npm install)' 
                      : 'Step 1: Install software & dependencies (npm install)'}
                  </span>
                </div>
                <p className="text-neutral-600 leading-relaxed font-medium">
                  {language === 'vi' 
                    ? 'Mở Terminal (cmd hoặc PowerShell) tại thư mục dự án và chạy lệnh sau để tải toàn bộ các thư viện quan trọng:'
                    : 'Open Terminal (cmd or PowerShell) in the project root directory and run the following command to download all dependencies:'}
                </p>
                <div className="p-2.5 rounded-lg bg-neutral-900 text-neutral-100 font-mono text-xs select-all flex items-center justify-between">
                  <span>npm install</span>
                </div>
              </div>

              {/* Step 2: Run Dev Server */}
              <div className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50 space-y-2">
                <div className="flex items-center gap-2 font-bold text-neutral-900 text-xs sm:text-sm">
                  <Play className="w-4 h-4 text-neutral-800" />
                  <span>
                    {language === 'vi' 
                      ? 'Bước 2: Chạy ứng dụng phát triển (npm run dev)' 
                      : 'Step 2: Run development application (npm run dev)'}
                  </span>
                </div>
                <p className="text-neutral-600 leading-relaxed font-medium">
                  {language === 'vi' 
                    ? 'Sau khi cài xong thư viện, khởi động máy chủ bằng lệnh:' 
                    : 'After dependencies are installed, start the application server using:'}
                </p>
                <div className="p-2.5 rounded-lg bg-neutral-900 text-neutral-100 font-mono text-xs select-all flex items-center justify-between">
                  <span>npm run dev</span>
                </div>
                <p className="text-neutral-500 text-[11px]">
                  {language === 'vi' ? 'Máy chủ sẽ chạy tại cổng mặc định:' : 'The server will run on default port:'}{' '}
                  <code className="bg-neutral-200 px-1 py-0.5 rounded text-neutral-800 font-mono">http://localhost:8088</code>
                </p>
              </div>

              {/* Step 3: Important Libraries Overview */}
              <div className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50 space-y-2">
                <span className="font-bold text-neutral-900 text-xs block">
                  {language === 'vi' 
                    ? 'Các thư viện quan trọng cốt lõi đã được tích hợp chuẩn xác:' 
                    : 'Core integrated dependencies and technology stack:'}
                </span>
                <ul className="space-y-1.5 text-[11px] text-neutral-600 list-disc pl-4 leading-relaxed font-medium">
                  {language === 'vi' ? (
                    <>
                      <li><strong>express</strong> &amp; <strong>tsx</strong>: Máy chủ backend xử lý API endpoint, proxy bảo vệ khóa API và SSE streaming.</li>
                      <li><strong>recharts</strong>: Biểu đồ thanh trực quan hóa lượng token tiêu thụ và thống kê các tháng gần nhất.</li>
                      <li><strong>lucide-react</strong>: Hệ thống biểu tượng sắc nét, trực quan.</li>
                      <li><strong>marked</strong>: Trình phân giải cú pháp Markdown và mã lệnh lập trình.</li>
                      <li><strong>tailwindcss</strong>: Hệ thống giao diện hiện đại, tinh gọn theo chế độ sáng (light mode).</li>
                      <li><strong>@google/genai</strong>: Bộ SDK kết nối API trí tuệ nhân tạo.</li>
                    </>
                  ) : (
                    <>
                      <li><strong>express</strong> &amp; <strong>tsx</strong>: Backend server handling API endpoints, secure key proxy, and SSE streaming.</li>
                      <li><strong>recharts</strong>: Interactive charts visualizing token consumption and monthly analytics.</li>
                      <li><strong>lucide-react</strong>: Crisp, modern UI icons.</li>
                      <li><strong>marked</strong>: Markdown syntax parser and formatted code block rendering.</li>
                      <li><strong>tailwindcss</strong>: Modern, clean minimalist light-mode styling system.</li>
                      <li><strong>@google/genai</strong>: Official Google Generative AI SDK integration.</li>
                    </>
                  )}
                </ul>
              </div>
            </div>
          ) : (
            <div className="space-y-3.5">
              {/* Section 1 */}
              <div className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50 space-y-1.5">
                <span className="font-bold text-xs sm:text-sm text-neutral-900 flex items-center gap-1.5">
                  <Server className="w-4 h-4 text-neutral-600" />
                  <span>
                    {language === 'vi' 
                      ? 'Hỗ trợ OpenAI, Google, Claude, 9Router & Cổng khác' 
                      : 'Supports OpenAI, Google, Claude, 9Router & Custom Endpoints'}
                  </span>
                </span>
                <p className="text-neutral-600 leading-relaxed font-medium">
                  {language === 'vi' 
                    ? 'Kết nối trực tiếp với OpenAI (GPT-4o, o1, o3-mini), Google AI Studio (Gemini 3.8 Flash, 3.7 Flash, Flash Latest...), Claude (Claude 3.5 Sonnet/Haiku), 9Router hoặc các máy chủ AI chuẩn OpenAI như DeepSeek, Groq, OpenRouter, Mistral, Ollama.'
                    : 'Connect directly with OpenAI (GPT-4o, o1, o3-mini), Google AI Studio (Gemini 3.8 Flash, 3.7 Flash, Flash Latest...), Claude (Claude 3.5 Sonnet/Haiku), 9Router, or OpenAI-compatible gateways such as DeepSeek, Groq, OpenRouter, Mistral, Ollama.'}
                </p>
              </div>

              {/* Section 2 */}
              <div className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50 space-y-1.5">
                <span className="font-bold text-xs sm:text-sm text-neutral-900 flex items-center gap-1.5">
                  <BarChart3 className="w-4 h-4 text-neutral-600" />
                  <span>
                    {language === 'vi' 
                      ? 'Bảng thống kê Token & Chi phí các tháng gần nhất' 
                      : 'Token Analytics & Monthly Cost Tracking'}
                  </span>
                </span>
                <p className="text-neutral-600 leading-relaxed font-medium">
                  {language === 'vi' 
                    ? 'Hệ thống tự động lưu trữ và cho phép xem biểu đồ chi tiết từng ngày của các tháng gần nhất hoặc so sánh tổng thể 6 tháng gần nhất mà không cần bấm nút lưu thủ công.'
                    : 'Automatically tracks token consumption, message counts, and estimated costs with daily breakdowns and comprehensive 6-month comparisons.'}
                </p>
              </div>

              {/* Section 3 */}
              <div className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50 space-y-1.5">
                <span className="font-bold text-xs sm:text-sm text-neutral-900 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-neutral-600" />
                  <span>
                    {language === 'vi' 
                      ? 'Bảo mật cục bộ (Local Storage)' 
                      : 'Local Privacy & Storage'}
                  </span>
                </span>
                <p className="text-neutral-600 leading-relaxed font-medium">
                  {language === 'vi' 
                    ? 'Khóa API, địa chỉ URL và lịch sử đàm thoại được lưu trữ an toàn trên thiết bị trình duyệt và cơ sở dữ liệu SQLite của bạn.'
                    : 'API keys, custom endpoints, and conversations are safely stored in your browser\'s local storage and SQLite database.'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-neutral-200 bg-neutral-50 shrink-0">
          <button
            onClick={() => {
              onClose();
              onOpenApiKeyModal();
            }}
            className="text-xs font-bold underline text-neutral-800 hover:text-black cursor-pointer"
          >
            {language === 'vi' ? 'Cài đặt API Key & URL' : 'API Key & Provider Settings'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold transition-colors cursor-pointer shadow-xs"
          >
            {language === 'vi' ? 'Đóng' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
