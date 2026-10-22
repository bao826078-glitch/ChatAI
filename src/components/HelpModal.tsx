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
                  <span>Bước 1: Cài đặt phần mềm & thư viện (npm install)</span>
                </div>
                <p className="text-neutral-600 leading-relaxed font-medium">
                  Mở Terminal (cmd hoặc PowerShell) tại thư mục dự án và chạy lệnh sau để tải toàn bộ các thư viện quan trọng:
                </p>
                <div className="p-2.5 rounded-lg bg-neutral-900 text-neutral-100 font-mono text-xs select-all flex items-center justify-between">
                  <span>npm install</span>
                </div>
              </div>

              {/* Step 2: Run Dev Server */}
              <div className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50 space-y-2">
                <div className="flex items-center gap-2 font-bold text-neutral-900 text-xs sm:text-sm">
                  <Play className="w-4 h-4 text-neutral-800" />
                  <span>Bước 2: Chạy ứng dụng phát triển (npm run dev)</span>
                </div>
                <p className="text-neutral-600 leading-relaxed font-medium">
                  Sau khi cài xong thư viện, khởi động máy chủ bằng lệnh:
                </p>
                <div className="p-2.5 rounded-lg bg-neutral-900 text-neutral-100 font-mono text-xs select-all flex items-center justify-between">
                  <span>npm run dev</span>
                </div>
                <p className="text-neutral-500 text-[11px]">
                  Máy chủ sẽ chạy tại cổng mặc định: <code className="bg-neutral-200 px-1 py-0.5 rounded text-neutral-800 font-mono">http://localhost:8088</code>
                </p>
              </div>

              {/* Step 3: Important Libraries Overview */}
              <div className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50 space-y-2">
                <span className="font-bold text-neutral-900 text-xs block">
                  Các thư viện quan trọng cốt lõi đã được tích hợp chuẩn xác:
                </span>
                <ul className="space-y-1.5 text-[11px] text-neutral-600 list-disc pl-4 leading-relaxed font-medium">
                  <li><strong>express</strong> &amp; <strong>tsx</strong>: Máy chủ backend xử lý API endpoint, proxy bảo vệ khóa API và SSE streaming.</li>
                  <li><strong>recharts</strong>: Biểu đồ thanh trực quan hóa lượng token tiêu thụ và thống kê các tháng gần nhất.</li>
                  <li><strong>lucide-react</strong>: Hệ thống biểu tượng sắc nét, trực quan.</li>
                  <li><strong>marked</strong>: Trình phân giải cú pháp Markdown và mã lệnh lập trình.</li>
                  <li><strong>tailwindcss</strong>: Hệ thống giao diện hiện đại, tinh gọn theo chế độ sáng (light mode).</li>
                  <li><strong>@google/genai</strong>: Bộ SDK kết nối API trí tuệ nhân tạo.</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="space-y-3.5">
              {/* Section 1 */}
              <div className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50 space-y-1.5">
                <span className="font-bold text-xs sm:text-sm text-neutral-900 flex items-center gap-1.5">
                  <Server className="w-4 h-4 text-neutral-600" />
                  <span>Hỗ trợ OpenAI, Google, Claude, 9Router & Cổng khác</span>
                </span>
                <p className="text-neutral-600 leading-relaxed font-medium">
                  Kết nối trực tiếp với <strong>OpenAI</strong> (GPT-4o, o1, o3-mini), <strong>Google AI Studio</strong> (Gemini 3.8 Flash, 3.7 Flash, Flash Latest...), <strong>Claude</strong> (Claude 3.5 Sonnet/Haiku), <strong>9Router</strong> hoặc các máy chủ AI chuẩn OpenAI như DeepSeek, Groq, OpenRouter, Mistral, Ollama.
                </p>
              </div>

              {/* Section 2 */}
              <div className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50 space-y-1.5">
                <span className="font-bold text-xs sm:text-sm text-neutral-900 flex items-center gap-1.5">
                  <BarChart3 className="w-4 h-4 text-neutral-600" />
                  <span>Bảng thống kê Token & Chi phí các tháng gần nhất</span>
                </span>
                <p className="text-neutral-600 leading-relaxed font-medium">
                  Hệ thống tự động lưu trữ và cho phép xem biểu đồ chi tiết từng ngày của các tháng gần nhất hoặc so sánh tổng thể 6 tháng gần nhất mà không cần bấm nút lưu thủ công.
                </p>
              </div>

              {/* Section 3 */}
              <div className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50 space-y-1.5">
                <span className="font-bold text-xs sm:text-sm text-neutral-900 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-neutral-600" />
                  <span>Bảo mật cục bộ (Local Storage)</span>
                </span>
                <p className="text-neutral-600 leading-relaxed font-medium">
                  Khóa API, địa chỉ URL và lịch sử đàm thoại được lưu trữ an toàn trên thiết bị trình duyệt của bạn.
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
