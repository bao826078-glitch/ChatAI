import { Conversation, MonthlyStats, DailyTokenStat, MonthSummary, AppLanguage } from '../types';
import { estimateTokens } from './tokenEstimator';

// Average estimated pricing: ~$0.25 per 1,000,000 tokens
const USD_PER_TOKEN = 0.00000025;
const USD_TO_VND_RATE = 25400;

const ANALYTICS_STORAGE_KEY = 'chat_ai_analytics_logs';

export interface StoredDailyRecord {
  date: string; // YYYY-MM-DD
  monthKey: string; // YYYY-MM
  tokens: number;
  conversations: string[];
  messagesCount: number;
}

// Retrieve complete analytics history logs automatically saved in localStorage
export function getStoredAnalyticsLogs(): Record<string, StoredDailyRecord> {
  try {
    const raw = localStorage.getItem(ANALYTICS_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Error reading analytics logs:', e);
  }
  return {};
}

// Automatically persist analytics logs to localStorage
export function saveAnalyticsLogs(logs: Record<string, StoredDailyRecord>): void {
  try {
    localStorage.setItem(ANALYTICS_STORAGE_KEY, JSON.stringify(logs));
  } catch (e) {
    console.error('Error auto-saving analytics logs:', e);
  }
}

// Automatically record token consumption when sending or receiving messages
export function recordTokenUsage(params: {
  tokens: number;
  conversationId: string;
  timestamp?: number;
}): void {
  if (params.tokens <= 0) return;

  const dateObj = new Date(params.timestamp || Date.now());
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');

  const dateKey = `${year}-${month}-${day}`;
  const monthKey = `${year}-${month}`;

  const currentLogs = getStoredAnalyticsLogs();
  const existing = currentLogs[dateKey] || {
    date: dateKey,
    monthKey,
    tokens: 0,
    conversations: [],
    messagesCount: 0,
  };

  existing.tokens += params.tokens;
  existing.messagesCount += 1;
  if (!existing.conversations.includes(params.conversationId)) {
    existing.conversations.push(params.conversationId);
  }

  currentLogs[dateKey] = existing;
  saveAnalyticsLogs(currentLogs);
}

// Automatically sync all conversation history into permanent analytics logs
// Ensures stats are preserved even if a user clears or deletes chats later
export function syncConversationsWithHistory(conversations: Conversation[]): void {
  const currentLogs = getStoredAnalyticsLogs();
  let hasChanges = false;

  conversations.forEach((conv) => {
    conv.messages?.forEach((msg) => {
      if (!msg.timestamp) return;
      const tokens = msg.estimatedTokens || estimateTokens(msg.content);
      if (tokens <= 0) return;

      const d = new Date(msg.timestamp);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateKey = `${year}-${month}-${day}`;
      const monthKey = `${year}-${month}`;

      if (!currentLogs[dateKey]) {
        currentLogs[dateKey] = {
          date: dateKey,
          monthKey,
          tokens,
          conversations: [conv.id],
          messagesCount: 1,
        };
        hasChanges = true;
      }
    });
  });

  if (hasChanges) {
    saveAnalyticsLogs(currentLogs);
  }
}

// Format month label according to active language ('en' -> October 2026, 'vi' -> Tháng 10/2026)
export function formatMonthLabel(monthKeyOrStr: string, language: AppLanguage = 'en'): string {
  if (!monthKeyOrStr) return '';
  let year = '';
  let month = '';

  const matchKey = monthKeyOrStr.match(/^(\d{4})-(\d{1,2})$/);
  if (matchKey) {
    year = matchKey[1];
    month = matchKey[2].padStart(2, '0');
  } else {
    const matchSlash = monthKeyOrStr.match(/(\d{1,2})\/(\d{4})/);
    if (matchSlash) {
      month = matchSlash[1].padStart(2, '0');
      year = matchSlash[2];
    }
  }

  if (!year || !month) return monthKeyOrStr;

  if (language === 'vi') {
    return `Tháng ${month}/${year}`;
  }

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const mIndex = parseInt(month, 10) - 1;
  const monthName = monthNames[mIndex] || month;
  return `${monthName} ${year}`;
}

// Retrieve a list of N recent months with localized labels
export function getRecentMonthsList(count: number = 6, language: AppLanguage = 'en'): { key: string; label: string; isCurrent: boolean }[] {
  const result: { key: string; label: string; isCurrent: boolean }[] = [];
  const now = new Date();

  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const key = `${year}-${month}`;
    const label = formatMonthLabel(key, language);
    result.push({
      key,
      label,
      isCurrent: i === 0,
    });
  }

  return result;
}

// Calculate detailed monthly statistics for a target month (combines permanent logs + active chats)
export function calculateMonthlyStats(
  conversations: Conversation[],
  targetMonthKey?: string,
  language: AppLanguage = 'en'
): MonthlyStats {
  const now = new Date();
  const activeMonthKey = targetMonthKey || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [yearStr, monthStr] = activeMonthKey.split('-');
  const targetYear = parseInt(yearStr, 10);
  const targetMonthIndex = parseInt(monthStr, 10) - 1;

  // Retrieve auto-saved permanent history logs
  const storedLogs = getStoredAnalyticsLogs();

  // Determine total days in selected month
  const daysInMonth = new Date(targetYear, targetMonthIndex + 1, 0).getDate();
  const dailyMap = new Map<string, { tokens: number; conversations: Set<string>; messagesCount: number }>();

  // Initialize all days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    const dayKey = `${activeMonthKey}-${String(day).padStart(2, '0')}`;
    dailyMap.set(dayKey, { tokens: 0, conversations: new Set(), messagesCount: 0 });
  }

  // Populate data from permanent storage
  Object.values(storedLogs).forEach((record) => {
    if (record.monthKey === activeMonthKey && dailyMap.has(record.date)) {
      const item = dailyMap.get(record.date)!;
      item.tokens = Math.max(item.tokens, record.tokens);
      item.messagesCount = Math.max(item.messagesCount, record.messagesCount);
      record.conversations.forEach((cId) => item.conversations.add(cId));
    }
  });

  // Merge in-memory data from current active conversations
  let totalTokensMonth = 0;
  let totalMessagesMonth = 0;
  const conversationsMonth = new Set<string>();

  conversations.forEach((conv) => {
    const convDate = new Date(conv.updatedAt || conv.createdAt);
    if (convDate.getFullYear() === targetYear && convDate.getMonth() === targetMonthIndex) {
      conversationsMonth.add(conv.id);
    }

    conv.messages?.forEach((msg) => {
      const msgDate = new Date(msg.timestamp);
      if (msgDate.getFullYear() === targetYear && msgDate.getMonth() === targetMonthIndex) {
        const tokens = msg.estimatedTokens || estimateTokens(msg.content);
        const dayKey = `${activeMonthKey}-${String(msgDate.getDate()).padStart(2, '0')}`;

        totalTokensMonth += tokens;
        totalMessagesMonth += 1;
        conversationsMonth.add(conv.id);

        if (dailyMap.has(dayKey)) {
          const item = dailyMap.get(dayKey)!;
          item.tokens = Math.max(item.tokens, tokens);
          item.conversations.add(conv.id);
          item.messagesCount += 1;
        }
      }
    });
  });

  // Aggregate daily records
  const dailyData: DailyTokenStat[] = Array.from(dailyMap.entries()).map(([key, value]) => {
    const parts = key.split('-');
    const displayDate = `${parts[2]}/${parts[1]}`;
    const costUsd = Number((value.tokens * USD_PER_TOKEN).toFixed(4));

    return {
      date: key,
      displayDate,
      tokens: value.tokens,
      conversations: value.conversations.size,
      messages: value.messagesCount,
      costUsd,
    };
  });

  // Calculate overall aggregates
  const aggregatedTokens = Math.max(
    totalTokensMonth,
    dailyData.reduce((sum, d) => sum + d.tokens, 0)
  );

  const aggregatedMessages = Math.max(
    totalMessagesMonth,
    dailyData.reduce((sum, d) => sum + d.messages, 0)
  );

  const estimatedCostUsd = Number((aggregatedTokens * USD_PER_TOKEN).toFixed(4));
  const estimatedCostVnd = Math.round(estimatedCostUsd * USD_TO_VND_RATE);

  const monthLabel = formatMonthLabel(activeMonthKey, language);

  return {
    monthKey: activeMonthKey,
    monthLabel,
    totalTokens: aggregatedTokens,
    totalConversations: Math.max(conversationsMonth.size, new Set(dailyData.filter(d => d.tokens > 0).map(d => d.date)).size),
    totalMessages: aggregatedMessages,
    estimatedCostUsd,
    estimatedCostVnd,
    dailyData,
  };
}

// Multi-month comparison summary for recent months
export function calculateRecentMonthsSummary(
  conversations: Conversation[],
  count: number = 6,
  language: AppLanguage = 'en'
): MonthSummary[] {
  const months = getRecentMonthsList(count, language);
  return months.map((m) => {
    const stats = calculateMonthlyStats(conversations, m.key, language);
    return {
      monthKey: m.key,
      monthLabel: m.label,
      tokens: stats.totalTokens,
      conversations: stats.totalConversations,
      messages: stats.totalMessages,
      costUsd: stats.estimatedCostUsd,
      costVnd: stats.estimatedCostVnd,
    };
  });
}
