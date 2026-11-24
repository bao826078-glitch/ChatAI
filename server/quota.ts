import { dbManager, PlanTier } from './db.ts';
import { PublicLicenseInfo } from './keygate.ts';

export interface QuotaStatus {
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

function parseLimit(envVal: string | undefined, fallback: number): number {
  const parsed = Number(envVal);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export class QuotaService {
  // Synchronous in-memory reservation counters keyed by YYYY-MM-DD to prevent concurrent
  // requests from racing past the daily quota limit before the upstream AI call finishes.
  private inFlightRequests = new Map<string, number>();

  private getTodayDateKey(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private getNextResetIso(): string {
    const now = new Date();
    const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
    return tomorrow.toISOString();
  }

  public getLimitsForLicense(license: PublicLicenseInfo): { chatLimit: number; tokenLimit: number } {
    if (license.plan === 'community') {
      const defaultCommunityChats = parseLimit(process.env.COMMUNITY_DAILY_CHAT_LIMIT, 1000);
      const defaultCommunityTokens = parseLimit(process.env.COMMUNITY_DAILY_TOKEN_LIMIT, 2000000);
      return {
        chatLimit: license.entitlements.dailyChatLimit || defaultCommunityChats,
        tokenLimit: license.entitlements.dailyTokenLimit || defaultCommunityTokens,
      };
    }

    return {
      chatLimit: parseLimit(process.env.FREE_DAILY_CHAT_LIMIT, 20),
      tokenLimit: parseLimit(process.env.FREE_DAILY_TOKEN_LIMIT, 50000),
    };
  }

  public getQuotaStatus(license: PublicLicenseInfo): QuotaStatus {
    const dateKey = this.getTodayDateKey();
    const counter = dbManager.getUsageCounter(dateKey);
    const { chatLimit, tokenLimit } = this.getLimitsForLicense(license);
    const inFlight = this.inFlightRequests.get(dateKey) || 0;

    const chatUsed = counter.requests_used + inFlight;
    const tokenUsed = counter.tokens_used;
    const chatRemaining = Math.max(0, chatLimit - chatUsed);
    const tokenRemaining = Math.max(0, tokenLimit - tokenUsed);

    const chatRatio = chatLimit > 0 ? chatUsed / chatLimit : 0;
    const tokenRatio = tokenLimit > 0 ? tokenUsed / tokenLimit : 0;

    return {
      plan: license.plan,
      dateKey,
      chatLimit,
      chatUsed,
      chatRemaining,
      tokenLimit,
      tokenUsed,
      tokenRemaining,
      nearLimit: (chatRatio >= 0.8 || tokenRatio >= 0.8) && chatRemaining > 0 && tokenRemaining > 0,
      limitReached: chatRemaining <= 0 || tokenRemaining <= 0,
      resetAt: this.getNextResetIso(),
    };
  }

  /**
   * Atomically reserves 1 chat request slot synchronously before initiating upstream AI fetch.
   * Returns a release/commit handle so concurrent bursts cannot exceed the configured limit.
   */
  public reserveRequest(license: PublicLicenseInfo): {
    allowed: boolean;
    quota: QuotaStatus;
    dateKey: string;
    reason?: 'CHAT_LIMIT_REACHED' | 'TOKEN_LIMIT_REACHED';
  } {
    const dateKey = this.getTodayDateKey();
    const counter = dbManager.getUsageCounter(dateKey);
    const { chatLimit, tokenLimit } = this.getLimitsForLicense(license);
    const inFlight = this.inFlightRequests.get(dateKey) || 0;

    const effectiveRequests = counter.requests_used + inFlight;
    if (effectiveRequests >= chatLimit) {
      return {
        allowed: false,
        dateKey,
        reason: 'CHAT_LIMIT_REACHED',
        quota: this.getQuotaStatus(license),
      };
    }

    if (counter.tokens_used >= tokenLimit) {
      return {
        allowed: false,
        dateKey,
        reason: 'TOKEN_LIMIT_REACHED',
        quota: this.getQuotaStatus(license),
      };
    }

    // Reserve synchronously in memory and persist increment immediately
    this.inFlightRequests.set(dateKey, inFlight + 1);
    dbManager.setUsageCounter(dateKey, license.plan, counter.requests_used + 1, counter.tokens_used);
    this.inFlightRequests.set(dateKey, Math.max(0, (this.inFlightRequests.get(dateKey) || 1) - 1));

    return {
      allowed: true,
      dateKey,
      quota: this.getQuotaStatus(license),
    };
  }

  public refundFailedRequest(dateKey: string, plan: PlanTier): void {
    const counter = dbManager.getUsageCounter(dateKey);
    dbManager.setUsageCounter(dateKey, plan, Math.max(0, counter.requests_used - 1), counter.tokens_used);
  }

  public addTokensUsed(dateKey: string, plan: PlanTier, totalTokens: number): QuotaStatus {
    const counter = dbManager.getUsageCounter(dateKey);
    const nextTokens = counter.tokens_used + Math.max(0, Math.floor(totalTokens));
    dbManager.setUsageCounter(dateKey, plan, counter.requests_used, nextTokens);
    return {
      plan,
      dateKey,
      chatLimit: 0,
      chatUsed: counter.requests_used,
      chatRemaining: 0,
      tokenLimit: 0,
      tokenUsed: nextTokens,
      tokenRemaining: 0,
      nearLimit: false,
      limitReached: false,
      resetAt: this.getNextResetIso(),
    };
  }
}

export const quotaService = new QuotaService();
