import React from 'react';
import { 
  Key, 
  Trash2, 
  AlertCircle, 
  HelpCircle, 
  PanelLeftClose, 
  PanelLeft, 
  BarChart3 
} from 'lucide-react';
import { ModelOption } from '../types';

interface HeaderProps {
  onToggleSidebar: () => void;
  isSidebarOpen?: boolean;
  title: string;
  selectedModel: string;
  models: ModelOption[];
  onOpenApiKeyModal: () => void;
  onOpenAnalyticsModal: () => void;
  hasCustomKey: boolean;
  hasDefaultKey: boolean;
  isKeyInvalid?: boolean;
  onClearCurrentChat: () => void;
  hasMessages: boolean;
  onOpenHelpModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onToggleSidebar,
  isSidebarOpen = true,
  title,
  selectedModel,
  models,
  onOpenApiKeyModal,
  onOpenAnalyticsModal,
  hasCustomKey,
  hasDefaultKey,
  isKeyInvalid,
  onClearCurrentChat,
  hasMessages,
  onOpenHelpModal,
}) => {
  const currentModelObj = models.find((m) => m.id === selectedModel);

  return (
    <header className="h-13 border-b border-neutral-200 bg-white px-3 sm:px-5 flex items-center justify-between z-20 shrink-0 transition-colors">
      {/* Left: Nút Ẩn / Hiện thanh bên ở góc dashboard */}
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={onToggleSidebar}
          className="p-1.5 rounded-lg text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition-colors cursor-pointer"
          title={isSidebarOpen ? 'Ẩn thanh bên (Dashboard)' : 'Hiện thanh bên (Dashboard)'}
        >
          {isSidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
        </button>

        <div className="flex items-center gap-2 min-w-0 ml-1">
          <h2 className="text-xs sm:text-sm font-semibold text-neutral-900 truncate max-w-[140px] sm:max-w-xs md:max-w-md">
            {title || 'Đoạn chat mới'}
          </h2>
          {models.length === 0 ? (
            <button
              onClick={onOpenApiKeyModal}
              className="hidden sm:inline-flex items-center gap-1.5 text-[11px] px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100 transition-colors cursor-pointer font-medium"
              title="Chưa có mô hình AI. Bấm để nhập API Key và nhận danh sách mô hình."
            >
              <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
              <span>Chưa có mô hình (cần API Key)</span>
            </button>
          ) : currentModelObj ? (
            <span className="hidden sm:inline-flex items-center text-[11px] px-2 py-0.5 rounded-md bg-neutral-100 text-neutral-700 border border-neutral-200 font-mono font-medium">
              {currentModelObj.name}
            </span>
          ) : null}
        </div>
      </div>

      {/* Right Tools */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Nút riêng biệt: Bảng Thống kê Token & Chi phí tháng */}
        <button
          onClick={onOpenAnalyticsModal}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-neutral-300 hover:bg-neutral-100 text-neutral-800 text-xs font-semibold transition-colors cursor-pointer shadow-xs"
          title="Mở bảng điều khiển thống kê token và chi phí các tháng gần nhất"
        >
          <BarChart3 className="w-3.5 h-3.5 text-neutral-600" />
          <span className="hidden sm:inline">Thống kê tháng</span>
          <span className="sm:hidden">Thống kê</span>
        </button>

        {/* API Key Modal Button */}
        <button
          onClick={onOpenApiKeyModal}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
            isKeyInvalid
              ? 'bg-red-50 border-red-300 text-red-600'
              : hasCustomKey
              ? 'bg-neutral-100 border-neutral-300 text-neutral-800 font-semibold'
              : 'bg-amber-50 border-amber-300 text-amber-800 font-semibold'
          }`}
          title="Cài đặt khóa API & URL gọi AI"
        >
          {isKeyInvalid ? (
            <AlertCircle className="w-3.5 h-3.5 text-red-500" />
          ) : (
            <Key className="w-3.5 h-3.5" />
          )}
          <span className="hidden sm:inline">
            {isKeyInvalid ? 'Khóa lỗi' : hasCustomKey ? 'Key cá nhân' : 'Cài đặt Key'}
          </span>
          <span className="sm:hidden">API Key</span>
        </button>

        {/* Clear Current Chat */}
        {hasMessages && (
          <button
            onClick={onClearCurrentChat}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-800 hover:bg-neutral-100 transition-colors cursor-pointer"
            title="Xóa nội dung đoạn chat hiện tại"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}

        {/* Help */}
        <button
          onClick={onOpenHelpModal}
          className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-800 hover:bg-neutral-100 transition-colors cursor-pointer"
          title="Thông tin, Hướng dẫn & Cách chạy npm"
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
