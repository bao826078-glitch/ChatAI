export type ApiProvider = 'openai' | 'google' | 'claude' | '9router' | 'other';

export interface Message {
  id: string;
  sender: 'user' | 'ai'; // Người gửi: Người dùng hoặc AI
  role: 'user' | 'model'; // tương thích API backend
  content: string;
  timestamp: number; // Thời gian gửi tin nhắn (ms)
  modelUsed?: string;
  isStreaming?: boolean;
  error?: boolean;
  errorType?: string;
  estimatedTokens?: number;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
  model: string;
  systemInstruction?: string;
  provider?: ApiProvider;
  baseUrl?: string;
}

export interface ModelOption {
  id: string;
  name: string;
  badge: string;
  description: string;
  provider?: ApiProvider;
}

export interface PopularProviderOption {
  id: string;
  name: string;
  url: string;
  note: string;
}

export interface DailyTokenStat {
  date: string; // YYYY-MM-DD
  displayDate: string; // DD/MM
  tokens: number;
  conversations: number;
  messages: number;
  costUsd: number;
}

export interface MonthlyStats {
  monthKey: string; // YYYY-MM
  monthLabel: string; // e.g. "Tháng 10/2026"
  totalTokens: number;
  totalConversations: number;
  totalMessages: number;
  estimatedCostUsd: number;
  estimatedCostVnd: number;
  dailyData: DailyTokenStat[];
}

export interface MonthSummary {
  monthKey: string;
  monthLabel: string;
  tokens: number;
  conversations: number;
  messages: number;
  costUsd: number;
  costVnd: number;
}
