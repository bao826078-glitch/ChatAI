export type ApiProvider = 'openai' | 'google' | 'claude' | '9router' | 'other';
export type AppLanguage = 'en' | 'vi';
export type AppTheme = 'dark' | 'light';
export type PlanTier = 'free' | 'community';
export type LicenseStatusType =
  | 'not_activated'
  | 'active'
  | 'expired'
  | 'revoked'
  | 'invalid'
  | 'error';

export type SettingsTab = 'providers' | 'models' | 'language' | 'general' | 'license' | 'security';

export type MasterKeyHealthStatus = 'ready' | 'missing' | 'corrupted' | 'mismatch' | 'permission_warning';

export interface MasterKeyStatus {
  status: MasterKeyHealthStatus;
  activeKeyVersion: number;
  availableVersions: number[];
  fingerprint: string;
  keyFilePath: string;
  secretsDir: string;
  filePermissions: string | null;
  permissionsSecure: boolean;
  encryptedProvidersCount: number;
  hasEncryptedLicense: boolean;
  lastRotationAt: string | null;
  errorCode?: string;
  errorMessage?: string;
}

export interface Message {
  id: string;
  sender: 'user' | 'ai';
  role: 'user' | 'model';
  content: string;
  timestamp: number;
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
  providerId?: string;
  baseUrl?: string;
}

export interface ModelOption {
  id: string;
  name: string;
  badge: string;
  description: string;
  provider?: ApiProvider;
  providerId?: string;
  isCustom?: boolean;
}

export interface CustomModelConfig {
  id: string;
  provider_id: string;
  model_id: string;
  display_name: string;
  is_default: number;
  created_at: string;
}

export interface ProviderConfig {
  id: string;
  name: string;
  type: ApiProvider;
  baseUrl: string;
  apiEndpoint: string;
  hasApiKey: boolean;
  keyMask: string;
  isDefault: boolean;
  status: 'unverified' | 'connected' | 'error';
  lastCheckedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PopularProviderOption {
  id: string;
  name: string;
  url: string;
  note: string;
}

export interface LicenseEntitlements {
  usageAnalytics: boolean;
  tokenHistory: boolean;
  customModels: boolean;
  dailyChatLimit?: number;
  dailyTokenLimit?: number;
  raw?: Record<string, any>;
}

export interface LicenseInfo {
  plan: PlanTier;
  status: LicenseStatusType;
  maskedKey: string;
  productId: string;
  productName: string;
  planName: string;
  entitlements: LicenseEntitlements;
  activatedAt: string | null;
  expiresAt: string | null;
  lastVerifiedAt: string | null;
  cacheExpiresAt: string | null;
  graceDays: number;
  lastError: string | null;
  keygateConfigured: boolean;
  usingCachedVerification: boolean;
}

export interface QuotaInfo {
  plan: PlanTier;
  dateKey: string;
  chatLimit: number;
  chatUsed: number;
  chatRemaining: number;
  tokenLimit: number;
  tokenUsed: number;
  tokenRemaining: number;
  nearLimit: boolean;
  limitReached: boolean;
  resetAt: string;
}

export interface TokenUsageRecord {
  id: string;
  conversation_id: string | null;
  conversation_title?: string | null;
  message_id: string | null;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  usage_source: 'provider' | 'estimated';
  status: 'success' | 'error' | 'aborted';
  created_at: string;
}

export interface DailyTokenStat {
  date: string;
  displayDate: string;
  tokens: number;
  inputTokens?: number;
  outputTokens?: number;
  conversations: number;
  messages: number;
  costUsd: number;
}

export interface MonthlyStats {
  monthKey: string;
  monthLabel: string;
  totalTokens: number;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  totalRequests?: number;
  totalConversations: number;
  totalMessages: number;
  estimatedCostUsd: number;
  estimatedCostVnd: number;
  dailyData: DailyTokenStat[];
  byProvider?: Record<string, { tokens: number; inputTokens?: number; outputTokens?: number; requests: number }>;
  byModel?: Record<string, { tokens: number; inputTokens?: number; outputTokens?: number; requests: number; provider?: string }>;
  bySource?: Record<string, number>;
}

export interface MonthSummary {
  monthKey: string;
  monthLabel: string;
  tokens: number;
  inputTokens?: number;
  outputTokens?: number;
  conversations: number;
  messages: number;
  costUsd: number;
  costVnd: number;
}
