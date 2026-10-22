import React, { useState, useMemo } from 'react';
import { 
  X, 
  BarChart3, 
  Coins, 
  MessageSquare, 
  DollarSign, 
  TrendingUp, 
  Info,
  Calendar,
  Layers,
  CheckCircle2
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  CartesianGrid, 
  Legend 
} from 'recharts';
import { Conversation, AppLanguage } from '../types';
import { 
  calculateMonthlyStats, 
  getRecentMonthsList, 
  calculateRecentMonthsSummary,
  formatMonthLabel 
} from '../utils/analytics';
import { formatTokenCount } from '../utils/tokenEstimator';
import { translations } from '../utils/i18n';

interface AnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversations: Conversation[];
  language?: AppLanguage;
}

export const AnalyticsModal: React.FC<AnalyticsModalProps> = ({
  isOpen,
  onClose,
  conversations,
  language = 'en',
}) => {
  const t = translations[language] || translations.en;
  const recentMonths = useMemo(() => getRecentMonthsList(6, language), [language]);
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>(recentMonths[0]?.key || '');
  const [viewMode, setViewMode] = useState<'single' | 'compare'>('single');
  const [activeMetric, setActiveMetric] = useState<'tokens' | 'conversations' | 'both'>('tokens');

  // Fallback stats computed from current sessions
  const fallbackStats = useMemo(() => {
    return calculateMonthlyStats(conversations, selectedMonthKey, language);
  }, [conversations, selectedMonthKey, language]);

  const fallbackSummary = useMemo(() => {
    return calculateRecentMonthsSummary(conversations, 6, language);
  }, [conversations, language]);

  const [dbStats, setDbStats] = useState<any>(null);
  const [dbSummary, setDbSummary] = useState<any[] | null>(null);

  // Fetch true persisted analytics from SQLite backend
  React.useEffect(() => {
    if (!isOpen) return;
    fetch(`/api/analytics/monthly?month=${selectedMonthKey}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setDbStats(data);
      })
      .catch((e) => console.log('Analytics fetch note:', e));

    fetch('/api/analytics/summary')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && Array.isArray(data.summary)) setDbSummary(data.summary);
      })
      .catch((e) => console.log('Summary fetch note:', e));
  }, [isOpen, selectedMonthKey]);

  // Merge stats: prioritize SQLite persisted records if available
  const stats = useMemo(() => {
    const formattedMonth = formatMonthLabel(selectedMonthKey, language);
    if (dbStats && dbStats.totalTokens > 0) {
      return {
        ...fallbackStats,
        ...dbStats,
        monthLabel: formattedMonth,
        totalTokens: Math.max(dbStats.totalTokens, fallbackStats.totalTokens),
        totalMessages: Math.max(dbStats.totalMessages, fallbackStats.totalMessages),
        totalConversations: Math.max(dbStats.totalConversations, fallbackStats.totalConversations),
        estimatedCostUsd: Number((Math.max(dbStats.totalTokens, fallbackStats.totalTokens) * 0.00000025).toFixed(4)),
        estimatedCostVnd: Math.round(Number((Math.max(dbStats.totalTokens, fallbackStats.totalTokens) * 0.00000025).toFixed(4)) * 25400),
      };
    }
    return {
      ...fallbackStats,
      monthLabel: formattedMonth,
    };
  }, [dbStats, fallbackStats, selectedMonthKey, language]);

  const multiMonthSummary = useMemo(() => {
    const raw = (dbSummary && dbSummary.length > 0 && dbSummary.some((s) => s.tokens > 0))
      ? dbSummary
      : fallbackSummary;

    return raw.map((item: any) => ({
      ...item,
      monthLabel: formatMonthLabel(item.monthKey || item.monthLabel, language),
    }));
  }, [dbSummary, fallbackSummary, language]);

  if (!isOpen) return null;

  // Custom Recharts tooltip for single-month view
  const CustomDailyTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="p-3 rounded-xl bg-white border border-neutral-300 shadow-xl text-xs space-y-1.5 font-sans">
          <p className="font-bold text-sm text-neutral-900 border-b border-neutral-200 pb-1.5">
            {language === 'vi' ? 'Ngày' : 'Date'}: {data.displayDate} ({data.date})
          </p>
          <div className="flex items-center justify-between gap-5 text-neutral-700 font-medium">
            <span className="flex items-center gap-1.5">
              <Coins className="w-3.5 h-3.5 text-neutral-600" /> {language === 'vi' ? 'Token tiêu thụ:' : 'Tokens consumed:'}
            </span>
            <span className="font-mono font-bold text-neutral-900">
              {data.tokens.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-between gap-5 text-neutral-700 font-medium">
            <span className="flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-neutral-600" /> {language === 'vi' ? 'Tin nhắn / Lượt:' : 'Interactions:'}
            </span>
            <span className="font-mono font-bold text-neutral-900">
              {data.messages || data.conversations}
            </span>
          </div>
          <div className="flex items-center justify-between gap-5 text-neutral-700 font-medium">
            <span className="flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-neutral-600" /> {language === 'vi' ? 'Ước tính chi phí:' : 'Estimated cost:'}
            </span>
            <span className="font-mono font-bold text-neutral-900">
              ${data.costUsd}
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  // Custom Recharts tooltip for multi-month comparison
  const CustomMultiMonthTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="p-3 rounded-xl bg-white border border-neutral-300 shadow-xl text-xs space-y-1.5 font-sans">
          <p className="font-bold text-sm text-neutral-900 border-b border-neutral-200 pb-1.5">
            {formatMonthLabel(data.monthKey || data.monthLabel, language)}
          </p>
          <div className="flex items-center justify-between gap-5 text-neutral-700 font-medium">
            <span className="flex items-center gap-1.5">
              <Coins className="w-3.5 h-3.5 text-neutral-600" /> {language === 'vi' ? 'Tổng Token:' : 'Total Tokens:'}
            </span>
            <span className="font-mono font-bold text-neutral-900">
              {data.tokens.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-between gap-5 text-neutral-700 font-medium">
            <span className="flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-neutral-600" /> {language === 'vi' ? 'Tin nhắn:' : 'Messages:'}
            </span>
            <span className="font-mono font-bold text-neutral-900">
              {data.messages}
            </span>
          </div>
          <div className="flex items-center justify-between gap-5 text-neutral-700 font-medium">
            <span className="flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-neutral-600" /> {language === 'vi' ? 'Chi phí ước tính:' : 'Estimated cost:'}
            </span>
            <span className="font-mono font-bold text-neutral-900">
              ${data.costUsd} ({data.costVnd.toLocaleString('vi-VN')} đ)
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  const gridColor = '#e5e5e5';
  const textColor = '#525252';
  const tokenBarColor = '#171717';
  const convBarColor = '#737373';

  // Filter daily records for charting
  const chartData = stats.dailyData;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="w-full max-w-4xl bg-white border border-neutral-300 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-neutral-900 max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-neutral-200 bg-neutral-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-neutral-900 text-white shadow-xs">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-base sm:text-lg text-neutral-900">
                  {t.analyticsModalTitle}
                </h3>
                <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  {t.analyticsAutoSaved}
                </span>
              </div>
              <p className="text-xs text-neutral-500 font-medium mt-0.5">
                {t.analyticsSubtitle}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200 transition-colors cursor-pointer"
            title={t.closeBtn}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto">
          {/* Controls Bar: Month Selector & View Mode */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 rounded-xl bg-neutral-50 border border-neutral-200">
            {/* View Mode Toggle */}
            <div className="flex items-center gap-1.5 p-1 rounded-lg bg-neutral-200/80 w-fit">
              <button
                type="button"
                onClick={() => setViewMode('single')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  viewMode === 'single'
                    ? 'bg-white text-neutral-900 shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>{t.tabSingleMonth}</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('compare')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  viewMode === 'compare'
                    ? 'bg-white text-neutral-900 shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>{t.tabCompare}</span>
              </button>
            </div>

            {/* Month Selector Pills (active when viewMode === 'single') */}
            {viewMode === 'single' && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
                <span className="text-xs text-neutral-500 font-semibold shrink-0 mr-1">
                  {t.selectMonthLabel}
                </span>
                {recentMonths.map((m) => {
                  const isSelected = m.key === selectedMonthKey;
                  return (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => setSelectedMonthKey(m.key)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer border ${
                        isSelected
                          ? 'bg-neutral-900 text-white border-neutral-900 shadow-xs font-semibold'
                          : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-100 hover:border-neutral-300'
                      }`}
                    >
                      {m.label} {m.isCurrent ? t.currentMonthTag : ''}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* VIEW MODE 1: Single Month Detailed Breakdown */}
          {viewMode === 'single' && (
            <>
              {/* Stat Cards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {/* Stat 1: Total Tokens */}
                <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50 flex flex-col justify-between shadow-xs">
                  <div className="flex items-center justify-between text-neutral-500 text-xs font-semibold mb-1">
                    <span>{t.totalTokensCard} ({stats.monthLabel})</span>
                    <Coins className="w-4 h-4 text-neutral-700" />
                  </div>
                  <div className="text-xl sm:text-2xl font-bold font-mono text-neutral-900">
                    {stats.totalTokens.toLocaleString()}
                  </div>
                  <span className="text-xs text-neutral-500 font-medium mt-1">
                    ~{formatTokenCount(stats.totalTokens)} {t.tokensCount}
                  </span>
                </div>

                {/* Stat 2: Conversations & Messages */}
                <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50 flex flex-col justify-between shadow-xs">
                  <div className="flex items-center justify-between text-neutral-500 text-xs font-semibold mb-1">
                    <span>{t.interactionsCard}</span>
                    <MessageSquare className="w-4 h-4 text-neutral-700" />
                  </div>
                  <div className="text-xl sm:text-2xl font-bold font-mono text-neutral-900">
                    {stats.totalMessages || stats.totalConversations}
                  </div>
                  <span className="text-xs text-neutral-500 font-medium mt-1">
                    {stats.totalConversations} {language === 'vi' ? 'cuộc hội thoại' : 'conversations'}
                  </span>
                </div>

                {/* Stat 3: Estimated Cost */}
                <div className="col-span-2 sm:col-span-1 p-4 rounded-xl border border-neutral-200 bg-neutral-50 flex flex-col justify-between shadow-xs">
                  <div className="flex items-center justify-between text-neutral-500 text-xs font-semibold mb-1">
                    <span>{t.costCard}</span>
                    <DollarSign className="w-4 h-4 text-neutral-700" />
                  </div>
                  <div className="text-xl sm:text-2xl font-bold font-mono text-neutral-900">
                    ${stats.estimatedCostUsd}
                  </div>
                  <span className="text-xs text-neutral-600 mt-1 font-mono font-medium">
                    ≈ {stats.estimatedCostVnd.toLocaleString('vi-VN')} đ
                  </span>
                </div>
              </div>

              {/* Token Source & Breakdown Info */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-neutral-100 border border-neutral-200 text-xs">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-neutral-500 font-semibold">{t.tokenAnalysisTitle}</span>
                  <span className="font-mono text-neutral-800">
                    {t.tokenInput}: <strong>{(stats.totalInputTokens || 0).toLocaleString()}</strong>
                  </span>
                  <span className="font-mono text-neutral-800">
                    {t.tokenOutput}: <strong>{(stats.totalOutputTokens || 0).toLocaleString()}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="px-2 py-0.5 rounded-md bg-neutral-200 text-neutral-800 font-medium text-[11px]">
                    SQLite: data/chatai.db
                  </span>
                  {stats.bySource?.provider > 0 && (
                    <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-medium text-[11px]">
                      Provider: {stats.bySource.provider.toLocaleString()}
                    </span>
                  )}
                  {stats.bySource?.estimated > 0 && (
                    <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-medium text-[11px]">
                      {language === 'vi' ? 'Ước tính' : 'Estimated'}: {stats.bySource.estimated.toLocaleString()}
                    </span>
                  )}
                </div>
              </div>

              {/* Provider Breakdown */}
              {stats.byProvider && Object.keys(stats.byProvider).length > 0 && (
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="text-neutral-500 font-semibold">{t.byProviderTitle}</span>
                  {Object.entries(stats.byProvider).map(([pName, pData]: any) => (
                    <span key={pName} className="px-2.5 py-1 rounded-lg bg-neutral-50 border border-neutral-200 font-medium text-neutral-800 shadow-2xs">
                      <strong className="uppercase">{pName}</strong>: {pData.tokens.toLocaleString()} {t.tokensCount} ({pData.requests} reqs)
                    </span>
                  ))}
                </div>
              )}

              {/* Chart Section */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-neutral-900">
                    <TrendingUp className="w-4 h-4 text-neutral-700" />
                    <span>{t.tokensChartTitle} {stats.monthLabel}</span>
                  </div>

                  {/* Metric Filter Tabs */}
                  <div className="flex items-center p-0.5 rounded-lg bg-neutral-100 border border-neutral-200 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setActiveMetric('tokens')}
                      className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                        activeMetric === 'tokens'
                          ? 'bg-white text-neutral-900 shadow-xs font-bold'
                          : 'text-neutral-600 hover:text-neutral-900'
                      }`}
                    >
                      {t.metricTokens}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveMetric('conversations')}
                      className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                        activeMetric === 'conversations'
                          ? 'bg-white text-neutral-900 shadow-xs font-bold'
                          : 'text-neutral-600 hover:text-neutral-900'
                      }`}
                    >
                      {t.metricConversations}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveMetric('both')}
                      className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                        activeMetric === 'both'
                          ? 'bg-white text-neutral-900 shadow-xs font-bold'
                          : 'text-neutral-600 hover:text-neutral-900'
                      }`}
                    >
                      {t.metricBoth}
                    </button>
                  </div>
                </div>

                {/* Recharts BarChart */}
                <div className="w-full h-64 sm:h-72 min-h-[250px] p-3 rounded-xl border border-neutral-200 bg-neutral-50/50 shadow-inner">
                  <ResponsiveContainer width="100%" height="100%" minWidth={280} minHeight={240}>
                    <BarChart data={chartData} margin={{ top: 12, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                      <XAxis 
                        dataKey="displayDate" 
                        stroke={textColor} 
                        fontSize={10} 
                        tickLine={false} 
                        axisLine={{ stroke: gridColor }}
                      />
                      <YAxis 
                        stroke={textColor} 
                        fontSize={10} 
                        tickLine={false} 
                        axisLine={{ stroke: gridColor }}
                        tickFormatter={(val) => (val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val)}
                      />
                      <Tooltip content={<CustomDailyTooltip />} />
                      <Legend 
                        wrapperStyle={{ fontSize: '11px', paddingTop: '8px', fontWeight: 600 }}
                        formatter={(value) => (value === 'tokens' ? (language === 'vi' ? 'Token tiêu thụ' : 'Tokens consumed') : (language === 'vi' ? 'Số lượt tương tác' : 'Interactions'))}
                      />
                      
                      {(activeMetric === 'tokens' || activeMetric === 'both') && (
                        <Bar 
                          dataKey="tokens" 
                          name="tokens"
                          fill={tokenBarColor} 
                          radius={[3, 3, 0, 0]} 
                          maxBarSize={28}
                        />
                      )}

                      {(activeMetric === 'conversations' || activeMetric === 'both') && (
                        <Bar 
                          dataKey="messages" 
                          name="conversations"
                          fill={convBarColor} 
                          radius={[3, 3, 0, 0]} 
                          maxBarSize={28}
                        />
                      )}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}

          {/* VIEW MODE 2: Multi-Month Comparison (Last 6 Months) */}
          {viewMode === 'compare' && (
            <div className="space-y-5">
              {/* Comparative Multi-Month Chart */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-neutral-900">
                  <TrendingUp className="w-4 h-4 text-neutral-700" />
                  <span>{t.multiMonthChartTitle}</span>
                </div>

                <div className="w-full h-64 sm:h-72 min-h-[250px] p-3 rounded-xl border border-neutral-200 bg-neutral-50/50 shadow-inner">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[...multiMonthSummary].reverse()} margin={{ top: 12, right: 15, left: -5, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                      <XAxis 
                        dataKey="monthLabel" 
                        stroke={textColor} 
                        fontSize={11} 
                        tickLine={false} 
                        axisLine={{ stroke: gridColor }}
                      />
                      <YAxis 
                        stroke={textColor} 
                        fontSize={11} 
                        tickLine={false} 
                        axisLine={{ stroke: gridColor }}
                        tickFormatter={(val) => (val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val)}
                      />
                      <Tooltip content={<CustomMultiMonthTooltip />} />
                      <Bar 
                        dataKey="tokens" 
                        name={language === 'vi' ? 'Token tiêu thụ' : 'Tokens consumed'}
                        fill={tokenBarColor} 
                        radius={[4, 4, 0, 0]} 
                        maxBarSize={48}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Multi-Month Breakdown Table */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-neutral-800">
                  {t.multiMonthTableTitle}
                </h4>
                <div className="border border-neutral-200 rounded-xl overflow-hidden shadow-xs">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-neutral-100 text-neutral-700 font-semibold border-b border-neutral-200">
                      <tr>
                        <th className="px-3.5 py-2.5">{t.colMonth}</th>
                        <th className="px-3.5 py-2.5 text-right">{t.colTokens}</th>
                        <th className="px-3.5 py-2.5 text-right">{t.colInteractions}</th>
                        <th className="px-3.5 py-2.5 text-right">{t.colCostUsd}</th>
                        <th className="px-3.5 py-2.5 text-right">{t.colCostVnd}</th>
                        <th className="px-3.5 py-2.5 text-center">{t.colAction}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200">
                      {multiMonthSummary.map((row) => (
                        <tr 
                          key={row.monthKey} 
                          className={`hover:bg-neutral-50 transition-colors ${row.monthKey === selectedMonthKey ? 'bg-neutral-50/80 font-medium' : ''}`}
                        >
                          <td className="px-3.5 py-2.5 font-medium text-neutral-900 flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-neutral-400" />
                            {row.monthLabel}
                            {row.monthKey === recentMonths[0]?.key && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-neutral-200 text-neutral-700 font-normal">
                                {t.currentMonthTag}
                              </span>
                            )}
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-mono font-semibold text-neutral-900">
                            {row.tokens.toLocaleString()}
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-mono text-neutral-700">
                            {row.conversations} / {row.messages}
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-mono text-neutral-900">
                            ${row.costUsd}
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-mono text-neutral-700">
                            {row.costVnd.toLocaleString('vi-VN')} đ
                          </td>
                          <td className="px-3.5 py-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedMonthKey(row.monthKey);
                                setViewMode('single');
                              }}
                              className="px-2 py-1 rounded text-[11px] font-medium text-neutral-800 hover:bg-neutral-200 transition-colors underline cursor-pointer"
                            >
                              {t.actionViewDay}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Pricing & Auto-Save Note */}
          <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-neutral-100 border border-neutral-200 text-xs text-neutral-600 font-medium">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-neutral-500" />
            <div className="leading-relaxed">
              <strong className="text-neutral-900">{language === 'vi' ? 'Cơ chế lưu trữ SQLite & định mức:' : 'SQLite Persistence & Rates:'}</strong> {language === 'vi' ? 'Toàn bộ dữ liệu token theo ngày và tháng được lưu trữ bền vững trong cơ sở dữ liệu SQLite data/chatai.db. Chi phí ước tính chuẩn ~$0.25 cho mỗi 1.000.000 tokens.' : 'All token usage metrics by day and month are securely stored in the SQLite database at data/chatai.db. Estimated cost standard is ~$0.25 per 1,000,000 tokens.'}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-neutral-200 bg-neutral-50 shrink-0">
          <span className="text-xs text-neutral-500">
            {language === 'vi' ? 'Dữ liệu được cập nhật tức thời theo các cuộc trò chuyện' : 'Real-time metrics synced with chat conversations'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white text-xs sm:text-sm font-bold transition-colors cursor-pointer shadow-xs"
          >
            {t.closeBtn}
          </button>
        </div>
      </div>
    </div>
  );
};
