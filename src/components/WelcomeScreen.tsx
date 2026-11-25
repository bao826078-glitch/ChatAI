import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Bot,
  X,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Layers,
  Cpu,
  Sliders,
  ShieldCheck,
  ArrowRight,
  Globe,
} from 'lucide-react';
import { AppLanguage, LicenseInfo } from '../types';
import { translations, translateErrorCode } from '../utils/i18n';

interface WelcomeScreenProps {
  language: AppLanguage;
  onLanguageChange: (lang: AppLanguage) => void;
  license: LicenseInfo;
  onActivateLicense: (key: string) => Promise<{ ok: boolean; license?: LicenseInfo; errorCode?: string; errorMessage?: string }>;
  onVerifyLicense: (key: string) => Promise<{ ok: boolean; activated?: boolean; license?: LicenseInfo; errorCode?: string; errorMessage?: string }>;
  onSkip: () => Promise<void>;
  onContinueToApp: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  language,
  onLanguageChange,
  license,
  onActivateLicense,
  onVerifyLicense,
  onSkip,
  onContinueToApp,
}) => {
  const t = translations[language] || translations.en;
  const [licenseKey, setLicenseKey] = useState('');
  const [isActivating, setIsActivating] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'idle' | 'success' | 'error';
    title?: string;
    message?: string;
  }>(() => {
    if (license.status === 'expired') {
      return {
        type: 'error',
        message: translateErrorCode(language, 'LICENSE_EXPIRED', license.lastError || undefined),
      };
    }
    if (license.status === 'revoked') {
      return {
        type: 'error',
        message: translateErrorCode(language, 'LICENSE_REVOKED', license.lastError || undefined),
      };
    }
    return { type: 'idle' };
  });

  const featureIcons = [Layers, Cpu, Sliders, ShieldCheck];

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!licenseKey.trim()) {
      setFeedback({ type: 'error', message: t.errorCodes.MISSING_LICENSE_KEY });
      return;
    }
    setIsActivating(true);
    setFeedback({ type: 'idle' });
    try {
      const res = await onActivateLicense(licenseKey.trim());
      if (res.ok) {
        setFeedback({
          type: 'success',
          title: t.licenseActivatedSuccessTitle,
          message: t.licenseActivatedSuccessDesc,
        });
      } else {
        setFeedback({
          type: 'error',
          message: translateErrorCode(language, res.errorCode, res.errorMessage),
        });
      }
    } finally {
      setIsActivating(false);
    }
  };

  const handleVerify = async () => {
    if (!licenseKey.trim()) {
      setFeedback({ type: 'error', message: t.errorCodes.MISSING_LICENSE_KEY });
      return;
    }
    setIsVerifying(true);
    setFeedback({ type: 'idle' });
    try {
      const res = await onVerifyLicense(licenseKey.trim());
      if (res.ok) {
        setFeedback({
          type: 'success',
          title: res.activated === false ? undefined : t.planCommunity,
          message:
            res.activated === false
              ? t.licenseVerifiedReadyToActivate
              : t.licenseVerifiedSuccessDesc,
        });
      } else {
        setFeedback({
          type: 'error',
          message: translateErrorCode(language, res.errorCode, res.errorMessage),
        });
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSkipClick = async () => {
    setIsSkipping(true);
    try {
      await onSkip();
    } finally {
      setIsSkipping(false);
    }
  };

  const isCommunityActive = license.plan === 'community' && license.status === 'active';

  return (
    <div className="relative min-h-screen w-full overflow-y-auto bg-neutral-50 dark:bg-[#09090b] text-neutral-900 dark:text-neutral-100 flex flex-col">
      {/* Subtle architectural radial gradient backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(120,120,140,0.12),_transparent_60%)] dark:bg-[radial-gradient(ellipse_at_top,_rgba(255,255,255,0.06),_transparent_55%)]"
      />

      {/* Top Navigation Row: Brand + Language Toggle + X Skip Button */}
      <header className="relative z-10 w-full max-w-5xl mx-auto px-5 sm:px-8 py-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-950 flex items-center justify-center shadow-xs">
            <Bot className="w-4 h-4" />
          </div>
          <span className="text-base font-bold tracking-tight whitespace-nowrap">ChatAI</span>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Language Switcher on Welcome Screen */}
          <div className="flex items-center p-0.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs">
            <Globe className="w-3.5 h-3.5 text-neutral-400 mx-1.5" />
            <button
              type="button"
              onClick={() => onLanguageChange('en')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                language === 'en'
                  ? 'bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 font-semibold'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => onLanguageChange('vi')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                language === 'vi'
                  ? 'bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 font-semibold'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              VI
            </button>
          </div>

          {/* X Skip Activation Button */}
          <button
            type="button"
            onClick={handleSkipClick}
            disabled={isSkipping}
            title={t.skipWelcomeTooltip}
            aria-label={t.skipWelcomeBtn}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <span>{t.skipWelcomeBtn}</span>
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="relative z-10 flex-1 w-full max-w-4xl mx-auto px-5 sm:px-8 pt-6 pb-14 flex flex-col justify-center">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="space-y-8"
        >
          {/* 5.1 Product Introduction */}
          <section className="text-center space-y-4 max-w-2xl mx-auto">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-950 shadow-sm mx-auto">
              <Bot className="w-7 h-7" />
            </div>

            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-neutral-950 dark:text-white [text-wrap:balance]">
              {t.welcomeHeroTitle}
            </h1>

            <p className="text-sm sm:text-base text-neutral-600 dark:text-neutral-400 leading-relaxed [text-wrap:balance]">
              {t.welcomeHeroSubtitle}
            </p>
          </section>

          {/* 4 Feature Highlights */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {t.welcomeFeatures.map((featureText, index) => {
              const Icon = featureIcons[index] || Layers;
              return (
                <div
                  key={index}
                  className="flex items-start gap-3.5 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#111114] transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-neutral-100 dark:bg-neutral-800/80 text-neutral-800 dark:text-neutral-200 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200 leading-snug pt-1">
                    {featureText}
                  </p>
                </div>
              );
            })}
          </section>

          {/* 5.2 License Activation Card (Directly below intro) */}
          <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#111114] p-6 sm:p-8 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-200 dark:border-neutral-800 pb-4">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-950 shrink-0">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-neutral-950 dark:text-white">
                    {t.licenseCardTitle}
                  </h2>
                  <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 mt-0.5">
                    {t.licenseCardDesc}
                  </p>
                </div>
              </div>

              <div className="text-xs text-neutral-500 dark:text-neutral-400 font-medium whitespace-nowrap shrink-0">
                {t.currentPlanLabel}:{' '}
                <span className="text-neutral-900 dark:text-white font-semibold">
                  {isCommunityActive ? t.planCommunity : t.planFree}
                </span>
              </div>
            </div>

            {!license.keygateConfigured && !isCommunityActive && (
              <div className="p-3.5 rounded-xl border border-amber-300/70 dark:border-amber-500/30 bg-amber-50/70 dark:bg-amber-950/25 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                <span>{t.keygateUnconfiguredNotice}</span>
              </div>
            )}

            {isCommunityActive ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl border border-emerald-300/80 dark:border-emerald-500/30 bg-emerald-50/70 dark:bg-emerald-950/25 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-semibold text-sm">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{t.licenseActivatedSuccessTitle}</span>
                  </div>
                  <p className="text-xs text-emerald-700 dark:text-emerald-300/90">
                    {t.licenseActivatedSuccessDesc}
                  </p>
                  <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-neutral-700 dark:text-neutral-300">
                    <div>
                      <span className="text-neutral-500 dark:text-neutral-400">{t.productNameLabel}: </span>
                      <span className="font-medium">{license.productName || 'ChatAI'}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500 dark:text-neutral-400">{t.licenseKeyLabel}: </span>
                      <span className="font-mono">{license.maskedKey}</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={onContinueToApp}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-neutral-900 dark:bg-white hover:bg-neutral-800 dark:hover:bg-neutral-200 text-white dark:text-neutral-950 text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <span>{t.continueToAppBtn}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleActivate} className="space-y-4">
                <div>
                  <input
                    type="text"
                    value={licenseKey}
                    onChange={(e) => {
                      setLicenseKey(e.target.value);
                      if (feedback.type !== 'idle') setFeedback({ type: 'idle' });
                    }}
                    placeholder={t.licensePlaceholder}
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full px-4 py-3 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-[#09090b] text-sm font-mono text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:border-neutral-900 dark:focus:border-neutral-300 transition-colors"
                  />
                </div>

                {feedback.type !== 'idle' && (
                  <div
                    className={`p-3.5 rounded-xl border text-xs sm:text-sm flex items-start gap-2.5 ${
                      feedback.type === 'success'
                        ? 'border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200'
                        : 'border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200'
                    }`}
                  >
                    {feedback.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
                    )}
                    <div className="space-y-0.5">
                      {feedback.title && <p className="font-semibold">{feedback.title}</p>}
                      <p>{feedback.message}</p>
                    </div>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="submit"
                      disabled={isActivating || isVerifying}
                      className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-neutral-900 dark:bg-white hover:bg-neutral-800 dark:hover:bg-neutral-200 text-white dark:text-neutral-950 text-xs sm:text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                    >
                      {isActivating && <Loader2 className="w-4 h-4 animate-spin" />}
                      <span>{isActivating ? t.activatingLicenseBtn : t.activateLicenseBtn}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleVerify}
                      disabled={isActivating || isVerifying}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200 text-xs sm:text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                    >
                      {isVerifying && <Loader2 className="w-4 h-4 animate-spin" />}
                      <span>{isVerifying ? t.verifyingLicenseBtn : t.verifyLicenseBtn}</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleSkipClick}
                    disabled={isSkipping}
                    className="text-xs font-medium text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 transition-colors cursor-pointer underline underline-offset-4 whitespace-nowrap text-center sm:text-right"
                  >
                    {t.skipWelcomeBtn} ({t.planFree})
                  </button>
                </div>
              </form>
            )}
          </section>
        </motion.div>
      </main>
    </div>
  );
};
