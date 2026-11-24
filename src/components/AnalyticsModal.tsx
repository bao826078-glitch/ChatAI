import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  BarChart3,
  Coins,
  MessageSquare,
  DollarSign,
  TrendingUp,
  Calendar,
  Layers,
  Lock,
  History,
  KeyRound,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import { AppLanguage, LicenseInfo, TokenUsageRecord } from '../types';
import { formatMonthLabel, getRecentMonthsList } from '../utils/analytics';
import { formatTokenCount } from '../utils/tokenEstimator';
import { translations, translateErrorCode } from '../utils/i18n';
import { apiFetch } from '../utils/api';

interface AnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: AppLanguage;
  license: LicenseInfo;
  onOpenLicenseSettings: () => void;
}

export const AnalyticsModal: React.FC<AnalyticsModalProps> = ({
  isOpen,
  onClose,
  language,
  license,
  onOpenLicenseSettings,
}) => {
  const t = translations[language] || translations.en;
  const recentMonths = useMemo(() => getRecentMonthsList(6, language), [language]);
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>(recentMonths[0]?.key || '');
  const [viewMode, setViewMode] = useState<'overview' | 'compare' | 'history'>('overview');
  const [activeMetric, setActiveMetric] = useState<'tokens' | 'conversations' | 'both'>('tokens');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dbStats, setDbStats] = useState<any>(null);
  const [dbSummary, setDbSummary] = useState<any[]>([]);

  // History state
  const [historyRecords, setHistoryRecords] = useState<TokenUsageRecord[]>([]);
  const [historyTotalCount, setHistoryTotalCount] = useState(0);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [historyProviderFilter, setHistoryProviderFilter] = useState('all');
  const [historyModelFilter, setHistoryModelFilter] = useState('all');
  const [historyLoading, setHistoryLoading] = useState(false);

  const hasAccess =
    license.plan === 'community' &&
    license.status === 'active' &&
    license.entitlements.usageAnalytics &&
    license.entitlements.tokenHistory;

  useEffect(() => {
    if (!isOpen || !hasAccess) return;

    let cancelled = false;
    setLoading(true);
    setErrorMsg(null);

    Promise.all([
      apiFetch(`/api/analytics/monthly?month=${encodeURIComponent(selectedMonthKey)}`).then((r) => r.json()),
      apiFetch('/api/analytics/summary?count=6').then((r) => r.json()),
    ])
      .then(([monthlyRes, summaryRes]) => {
        if (cancelled) return;
        if (!monthlyRes.ok) {
          setErrorMsg(translateErrorCode(language, monthlyRes.errorCode, monthlyRes.error));
          return;
        }
        setDbStats(monthlyRes);
        if (summaryRes.ok && Array.isArray(summaryRes.summary)) {
          setDbSummary(summaryRes.summary);
        }
      })
      .catch((err: any) => {
        if (!cancelled) setErrorMsg(err?.message || 'Failed to load analytics.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, hasAccess, selectedMonthKey, language]);

  useEffect(() => {
    if (!isOpen || !hasAccess || viewMode !== 'history') return;

    let cancelled = false;
    setHistoryLoading(true);

    const params = new URLSearchParams({
      limit: '20',
      offset: String(historyOffset),
      provider: historyProviderFilter,
      model: historyModelFilter,
    });

    apiFetch(`/api/analytics/history?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.ok) {
          setHistoryRecords(data.records || []);
          setHistoryTotalCount(data.totalCount || 0);
        } else {
          setErrorMsg(translateErrorCode(language, data.errorCode, data.error));
        }
      })
      .catch((err: any) => {
        if (!cancelled) setErrorMsg(err?.message || 'Failed to load history.');
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, hasAccess, viewMode, historyOffset, historyProviderFilter, historyModelFilter, language]);

  const multiMonthSummary = useMemo(() => {
    return dbSummary.map((item: any) => ({
      ...item,
      monthLabel: formatMonthLabel(item.monthKey || item.monthLabel, language),
    }));
  }, [dbSummary, language]);

  if (!isOpen) return null;

  const stats = dbStats || {
    monthKey: selectedMonthKey,
    totalTokens: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalRequests: 0,
    totalConversations: 0,
    totalMessages: 0,
    estimatedCostUsd: 0,
    estimatedCostVnd: 0,
    dailyData: [],
    byProvider: {},
    byModel: {},
  };

  const formattedMonthLabel = formatMonthLabel(selectedMonthKey, language);
  const providerKeys = Object.keys(stats.byProvider || {});
  const modelKeys = Object.keys(stats.byModel || {});

  const CustomDailyTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="p-3 rounded-xl bg-white dark:bg-[#16161b] border border-neutral-300 dark:border-neutral-700 shadow-xl text-xs space-y-1.5">
          <p className="font-semibold text-neutral-900 dark:text-white border-b border-neutral-200 dark:border-neutral-800 pb-1">
            {data.displayDate} ({data.date})
          </p>
          <div className="flex items-center justify-between gap-5">
            <span className="text-neutral-500 dark:text-neutral-400">{t.totalTokensCard}:</span>
            <span className="font-mono font-semibold tabular-nums">{data.tokens.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between gap-5">
            <span className="text-neutral-500 dark:text-neutral-400">{t.metricConversations}:</span>
            <span className="font-mono font-semibold tabular-nums">{data.messages}</span>
          </div>
          <div className="flex items-center justify-between gap-5">
            <span className="text-neutral-500 dark:text-neutral-400">{t.costCard}:</span>
            <span className="font-mono font-semibold tabular-nums">${data.costUsd}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  const CustomMultiMonthTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="p-3 rounded-xl bg-white dark:bg-[#16161b] border border-neutral-300 dark:border-neutral-700 shadow-xl text-xs space-y-1.5">
          <p className="font-semibold text-neutral-900 dark:text-white border-b border-neutral-200 dark:border-neutral-800 pb-1">
            {formatMonthLabel(data.monthKey || data.monthLabel, language)}
          </p>
          <div className="flex items-center justify-between gap-5">
            <span className="text-neutral-500 dark:text-neutral-400">{t.totalTokensCard}:</span>
            <span className="font-mono font-semibold tabular-nums">{data.tokens.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between gap-5">
            <span className="text-neutral-500 dark:text-neutral-400">{t.totalRequestsCard}:</span>
            <span className="font-mono font-semibold tabular-nums">{data.messages}</span>
          </div>
          <div className="flex items-center justify-between gap-5">
            <span className="text-neutral-500 dark:text-neutral-400">{t.costCard}:</span>
            <span className="font-mono font-semibold tabular-nums">${data.costUsd}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-5 bg-black/70 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl bg-white dark:bg-[#111114] border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-neutral-900 dark:text-neutral-100 max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#151519] shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-950">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base sm:text-lg">{t.analyticsModalTitle}</h3>
                <span className="text-xs text-neutral-500 dark:text-neutral-400">· {t.analyticsAutoSaved}</span>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{t.analyticsSubtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/70 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            title={t.closeBtn}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-5">
          {!hasAccess ? (
            /* Free Plan Locked State */
            <div className="py-12 px-4 max-w-lg mx-auto text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6" />
              </div>
              <h4 className="text-lg font-semibold">{t.analyticsLockedTitle}</h4>
              <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                {t.analyticsLockedDesc}
              </p>
              <div className="pt-2 flex justify-center">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenLicenseSettings();
                  }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-950 text-xs sm:text-sm font-semibold cursor-pointer whitespace-nowrap"
                >
                  <KeyRound className="w-4 h-4" />
                  <span>{t.upgradeCommunityBtn}</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Controls Bar */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3 rounded-xl bg-neutral-50 dark:bg-[#151519] border border-neutral-200 dark:border-neutral-800">
                <div className="flex items-center gap-1 p-1 rounded-lg bg-neutral-200/70 dark:bg-neutral-800/80 w-fit overflow-x-auto">
                  <button
                    type="button"
                    onClick={() => setViewMode('overview')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      viewMode === 'overview'
                        ? 'bg-white dark:bg-[#111114] text-neutral-900 dark:text-white shadow-xs'
                        : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                    }`}
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{t.tabOverview}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('compare')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      viewMode === 'compare'
                        ? 'bg-white dark:bg-[#111114] text-neutral-900 dark:text-white shadow-xs'
                        : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>{t.tabCompare}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('history')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      viewMode === 'history'
                        ? 'bg-white dark:bg-[#111114] text-neutral-900 dark:text-white shadow-xs'
                        : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                    }`}
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>{t.tabHistory}</span>
                  </button>
                </div>

                {viewMode === 'overview' && (
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
                    <span className="text-xs text-neutral-500 dark:text-neutral-400 font-medium shrink-0 mr-1">
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
                              ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-950 border-neutral-900 dark:border-white'
                              : 'bg-white dark:bg-[#0d0d10] text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                          }`}
                        >
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {errorMsg && (
                <div className="p-3.5 rounded-xl border border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {loading && viewMode !== 'history' ? (
                <div className="py-16 flex items-center justify-center text-xs text-neutral-500 gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{t.loadingText}</span>
                </div>
              ) : viewMode === 'overview' ? (
                <>
                  {/* 5 KPI Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div className="p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#151519]">
                      <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400 mb-1">
                        <span>{t.totalRequestsCard}</span>
                        <MessageSquare className="w-3.5 h-3.5" />
                      </div>
                      <div className="text-lg sm:text-xl font-bold font-mono tabular-nums">
                        {(stats.totalRequests || stats.totalMessages || 0).toLocaleString()}
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#151519]">
                      <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400 mb-1">
                        <span>{t.promptTokensCard}</span>
                        <Coins className="w-3.5 h-3.5" />
                      </div>
                      <div className="text-lg sm:text-xl font-bold font-mono tabular-nums">
                        {(stats.totalInputTokens || 0).toLocaleString()}
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#151519]">
                      <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400 mb-1">
                        <span>{t.completionTokensCard}</span>
                        <Coins className="w-3.5 h-3.5" />
                      </div>
                      <div className="text-lg sm:text-xl font-bold font-mono tabular-nums">
                        {(stats.totalOutputTokens || 0).toLocaleString()}
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#151519]">
                      <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400 mb-1">
                        <span>{t.totalTokensCard}</span>
                        <Coins className="w-3.5 h-3.5" />
                      </div>
                      <div className="text-lg sm:text-xl font-bold font-mono tabular-nums">
                        {(stats.totalTokens || 0).toLocaleString()}
                      </div>
                      <span className="text-[11px] text-neutral-500 font-mono">
                        ~{formatTokenCount(stats.totalTokens || 0)}
                      </span>
                    </div>

                    <div className="col-span-2 sm:col-span-1 p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#151519]">
                      <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400 mb-1">
                        <span>{t.costCard}</span>
                        <DollarSign className="w-3.5 h-3.5" />
                      </div>
                      <div className="text-lg sm:text-xl font-bold font-mono tabular-nums">
                        ${stats.estimatedCostUsd || 0}
                      </div>
                      <span className="text-[11px] text-neutral-500 font-mono">
                        ≈ {(stats.estimatedCostVnd || 0).toLocaleString('vi-VN')} đ
                      </span>
                    </div>
                  </div>

                  {/* Daily Usage Chart */}
                  <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-sm font-semibold">
                        <TrendingUp className="w-4 h-4" />
                        <span>
                          {t.tokensChartTitle} {formattedMonthLabel}
                        </span>
                      </div>

                      <div className="flex items-center p-0.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs font-medium">
                        {(['tokens', 'conversations', 'both'] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setActiveMetric(m)}
                            className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                              activeMetric === m
                                ? 'bg-white dark:bg-[#111114] text-neutral-900 dark:text-white font-semibold'
                                : 'text-neutral-600 dark:text-neutral-400'
                            }`}
                          >
                            {m === 'tokens' ? t.metricTokens : m === 'conversations' ? t.metricConversations : t.metricBoth}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="w-full h-64 p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-[#0d0d10]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats.dailyData || []} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#52525b33" vertical={false} />
                          <XAxis dataKey="displayDate" stroke="#71717a" fontSize={10} tickLine={false} />
                          <YAxis
                            stroke="#71717a"
                            fontSize={10}
                            tickLine={false}
                            tickFormatter={(val) => (val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val)}
                          />
                          <Tooltip content={<CustomDailyTooltip />} />
                          <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }} />
                          {(activeMetric === 'tokens' || activeMetric === 'both') && (
                            <Bar dataKey="tokens" name={t.metricTokens} fill="#6366f1" radius={[3, 3, 0, 0]} maxBarSize={24} />
                          )}
                          {(activeMetric === 'conversations' || activeMetric === 'both') && (
                            <Bar dataKey="messages" name={t.metricConversations} fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={24} />
                          )}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Provider & Model Breakdowns */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
                      <div className="px-4 py-2.5 bg-neutral-50 dark:bg-[#151519] border-b border-neutral-200 dark:border-neutral-800 text-xs font-semibold">
                        {t.byProviderTitle}
                      </div>
                      {providerKeys.length === 0 ? (
                        <div className="p-4 text-xs text-neutral-500">{t.historyEmpty}</div>
                      ) : (
                        <div className="divide-y divide-neutral-200 dark:divide-neutral-800 text-xs">
                          {providerKeys.map((pKey) => {
                            const row = stats.byProvider[pKey];
                            return (
                              <div key={pKey} className="px-4 py-2.5 flex items-center justify-between gap-3">
                                <span className="font-medium truncate">{pKey}</span>
                                <span className="font-mono tabular-nums text-neutral-600 dark:text-neutral-300 shrink-0">
                                  {row.tokens.toLocaleString()} {t.tokensCount} · {row.requests} reqs
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
                      <div className="px-4 py-2.5 bg-neutral-50 dark:bg-[#151519] border-b border-neutral-200 dark:border-neutral-800 text-xs font-semibold">
                        {t.byModelTitle}
                      </div>
                      {modelKeys.length === 0 ? (
                        <div className="p-4 text-xs text-neutral-500">{t.historyEmpty}</div>
                      ) : (
                        <div className="divide-y divide-neutral-200 dark:divide-neutral-800 text-xs max-h-56 overflow-y-auto">
                          {modelKeys.map((mKey) => {
                            const row = stats.byModel[mKey];
                            return (
                              <div key={mKey} className="px-4 py-2.5 flex items-center justify-between gap-3">
                                <span className="font-mono truncate">{mKey}</span>
                                <span className="font-mono tabular-nums text-neutral-600 dark:text-neutral-300 shrink-0">
                                  {row.tokens.toLocaleString()} {t.tokensCount} · {row.requests} reqs
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : viewMode === 'compare' ? (
                /* 6-Month Comparison */
                <div className="space-y-5">
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold">{t.multiMonthChartTitle}</h4>
                    <div className="w-full h-64 p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-[#0d0d10]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={[...multiMonthSummary].reverse()} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#52525b33" vertical={false} />
                          <XAxis dataKey="monthLabel" stroke="#71717a" fontSize={11} tickLine={false} />
                          <YAxis
                            stroke="#71717a"
                            fontSize={11}
                            tickLine={false}
                            tickFormatter={(val) => (val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val)}
                          />
                          <Tooltip content={<CustomMultiMonthTooltip />} />
                          <Bar dataKey="tokens" name={t.metricTokens} fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={44} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-neutral-50 dark:bg-[#151519] text-neutral-600 dark:text-neutral-300 border-b border-neutral-200 dark:border-neutral-800">
                        <tr>
                          <th className="px-4 py-2.5">{t.colMonth}</th>
                          <th className="px-4 py-2.5 text-right">{t.colTokens}</th>
                          <th className="px-4 py-2.5 text-right">{t.colInteractions}</th>
                          <th className="px-4 py-2.5 text-right">{t.colCostUsd}</th>
                          <th className="px-4 py-2.5 text-right">{t.colCostVnd}</th>
                          <th className="px-4 py-2.5 text-center">{t.colAction}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                        {multiMonthSummary.map((row) => (
                          <tr key={row.monthKey} className="hover:bg-neutral-50 dark:hover:bg-[#151519]">
                            <td className="px-4 py-2.5 font-medium">{row.monthLabel}</td>
                            <td className="px-4 py-2.5 text-right font-mono tabular-nums">{row.tokens.toLocaleString()}</td>
                            <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                              {row.messages} / {row.conversations}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono tabular-nums">${row.costUsd}</td>
                            <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                              {row.costVnd.toLocaleString('vi-VN')} đ
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedMonthKey(row.monthKey);
                                  setViewMode('overview');
                                }}
                                className="underline cursor-pointer"
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
              ) : (
                /* Token Usage History Table */
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <select
                      value={historyProviderFilter}
                      onChange={(e) => {
                        setHistoryOffset(0);
                        setHistoryProviderFilter(e.target.value);
                      }}
                      className="px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#0c0c0f] text-xs"
                    >
                      <option value="all">{t.historyFilterProvider}</option>
                      {providerKeys.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>

                    <select
                      value={historyModelFilter}
                      onChange={(e) => {
                        setHistoryOffset(0);
                        setHistoryModelFilter(e.target.value);
                      }}
                      className="px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#0c0c0f] text-xs"
                    >
                      <option value="all">{t.historyFilterModel}</option>
                      {modelKeys.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>

                  {historyLoading ? (
                    <div className="py-12 flex items-center justify-center text-xs text-neutral-500 gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{t.loadingText}</span>
                    </div>
                  ) : historyRecords.length === 0 ? (
                    <div className="p-8 rounded-xl border border-dashed border-neutral-300 dark:border-neutral-800 text-center text-xs text-neutral-500">
                      {t.historyEmpty}
                    </div>
                  ) : (
                    <>
                      <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-neutral-50 dark:bg-[#151519] text-neutral-600 dark:text-neutral-300 border-b border-neutral-200 dark:border-neutral-800">
                            <tr>
                              <th className="px-3 py-2.5">{t.colTime}</th>
                              <th className="px-3 py-2.5">{t.colConversation}</th>
                              <th className="px-3 py-2.5">{t.colProvider}</th>
                              <th className="px-3 py-2.5">{t.colModel}</th>
                              <th className="px-3 py-2.5 text-right">{t.colPromptTokens}</th>
                              <th className="px-3 py-2.5 text-right">{t.colCompletionTokens}</th>
                              <th className="px-3 py-2.5 text-right">{t.colTotalTokens}</th>
                              <th className="px-3 py-2.5">{t.colSource}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                            {historyRecords.map((rec) => (
                              <tr key={rec.id} className="hover:bg-neutral-50 dark:hover:bg-[#151519]">
                                <td className="px-3 py-2 font-mono tabular-nums whitespace-nowrap text-neutral-500 dark:text-neutral-400">
                                  {new Date(rec.created_at).toLocaleString()}
                                </td>
                                <td className="px-3 py-2 max-w-[180px] truncate">
                                  {rec.conversation_title || rec.conversation_id || '—'}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap">{rec.provider}</td>
                                <td className="px-3 py-2 font-mono whitespace-nowrap">{rec.model}</td>
                                <td className="px-3 py-2 text-right font-mono tabular-nums">
                                  {rec.input_tokens.toLocaleString()}
                                </td>
                                <td className="px-3 py-2 text-right font-mono tabular-nums">
                                  {rec.output_tokens.toLocaleString()}
                                </td>
                                <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold">
                                  {rec.total_tokens.toLocaleString()}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap text-neutral-500 dark:text-neutral-400">
                                  {rec.usage_source === 'provider' ? t.sourceProvider : t.sourceEstimated}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="flex items-center justify-between text-xs text-neutral-500">
                        <span className="font-mono tabular-nums">
                          {historyOffset + 1}–{Math.min(historyOffset + 20, historyTotalCount)} / {historyTotalCount}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={historyOffset === 0}
                            onClick={() => setHistoryOffset(Math.max(0, historyOffset - 20))}
                            className="px-3 py-1 rounded-lg border border-neutral-300 dark:border-neutral-700 disabled:opacity-40 cursor-pointer"
                          >
                            {t.prevPage}
                          </button>
                          <button
                            type="button"
                            disabled={historyOffset + 20 >= historyTotalCount}
                            onClick={() => setHistoryOffset(historyOffset + 20)}
                            className="px-3 py-1 rounded-lg border border-neutral-300 dark:border-neutral-700 disabled:opacity-40 cursor-pointer"
                          >
                            {t.nextPage}
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-3.5 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#151519] shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-950 text-xs sm:text-sm font-semibold cursor-pointer"
          >
            {t.closeBtn}
          </button>
        </div>
      </div>
    </div>
  );
};
