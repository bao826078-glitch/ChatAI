import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Server,
  Cpu,
  Globe,
  Sliders,
  KeyRound,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Eye,
  EyeOff,
  ShieldCheck,
  Sun,
  Moon,
  Check,
  Loader2,
  Download,
  Upload,
  RotateCw,
  AlertTriangle,
} from 'lucide-react';
import {
  ApiProvider,
  AppLanguage,
  AppTheme,
  CustomModelConfig,
  LicenseInfo,
  MasterKeyStatus,
  ModelOption,
  PopularProviderOption,
  ProviderConfig,
  QuotaInfo,
  SettingsTab,
} from '../types';
import { translations, translateErrorCode } from '../utils/i18n';
import { apiFetch } from '../utils/api';

interface SettingsModalProps {
  isOpen: boolean;
  initialTab?: SettingsTab;
  onClose: () => void;
  language: AppLanguage;
  onLanguageChange: (lang: AppLanguage) => void;
  theme: AppTheme;
  onThemeChange: (theme: AppTheme) => void;
  providers: ProviderConfig[];
  activeProviderId: string;
  onSelectActiveProvider: (providerId: string) => Promise<void>;
  onCreateProvider: (payload: {
    name: string;
    type: ApiProvider;
    baseUrl: string;
    apiEndpoint: string;
    apiKey: string;
    isDefault: boolean;
  }) => Promise<{ ok: boolean; error?: string }>;
  onUpdateProvider: (
    id: string,
    payload: {
      name?: string;
      type?: ApiProvider;
      baseUrl?: string;
      apiEndpoint?: string;
      apiKey?: string;
      isDefault?: boolean;
    }
  ) => Promise<{ ok: boolean; error?: string }>;
  onDeleteProvider: (id: string) => Promise<{ ok: boolean; error?: string }>;
  onTestProvider: (id: string) => Promise<{ ok: boolean; message?: string; error?: string }>;
  models: ModelOption[];
  customModels: CustomModelConfig[];
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
  onRefreshModels: (providerId?: string) => Promise<{ ok: boolean; error?: string; count?: number }>;
  isFetchingModels: boolean;
  onAddCustomModel: (payload: { providerId: string; modelId: string; displayName?: string; isDefault?: boolean }) => Promise<{ ok: boolean; error?: string }>;
  onDeleteCustomModel: (id: string) => Promise<void>;
  temperature: number;
  onChangeTemperature: (val: number) => void;
  systemInstruction: string;
  onChangeSystemInstruction: (val: string) => void;
  sendOnEnter: boolean;
  onChangeSendOnEnter: (val: boolean) => void;
  compactMode: boolean;
  onChangeCompactMode: (val: boolean) => void;
  license: LicenseInfo;
  quota: QuotaInfo;
  onActivateLicense: (key: string) => Promise<{ ok: boolean; errorCode?: string; errorMessage?: string }>;
  onVerifyLicense: (key?: string) => Promise<{ ok: boolean; activated?: boolean; errorCode?: string; errorMessage?: string }>;
  onDeactivateLicense: () => Promise<{ ok: boolean; warning?: string; error?: string }>;
  keyStatus: MasterKeyStatus | null;
  onRefreshKeyStatus: () => Promise<void>;
  onBackupMasterKey: (passphrase: string) => Promise<{ ok: boolean; backupContent?: string; filename?: string; error?: string }>;
  onRestoreMasterKey: (backupContent: string, passphrase?: string) => Promise<{ ok: boolean; error?: string }>;
  onRotateMasterKey: () => Promise<{ ok: boolean; oldVersion?: number; newVersion?: number; reencryptedCount?: number; error?: string }>;
}

const getPopularOtherProviders = (lang: AppLanguage): PopularProviderOption[] => [
  { id: 'custom', name: lang === 'vi' ? 'Tùy chỉnh URL' : 'Custom URL', url: '', note: '' },
  { id: 'deepseek', name: 'DeepSeek API', url: 'https://api.deepseek.com/v1', note: 'DeepSeek-R1 / V3' },
  { id: 'groq', name: 'Groq Cloud', url: 'https://api.groq.com/openai/v1', note: 'Llama / Mixtral LPU' },
  { id: 'openrouter', name: 'OpenRouter AI', url: 'https://openrouter.ai/api/v1', note: 'Multi-model gateway' },
  { id: 'together', name: 'Together AI', url: 'https://api.together.xyz/v1', note: 'Open models' },
  { id: 'mistral', name: 'Mistral AI', url: 'https://api.mistral.ai/v1', note: 'Mistral / Codestral' },
  { id: 'ollama', name: 'Ollama (Local)', url: 'http://localhost:11434/v1', note: 'Local inference' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  initialTab = 'providers',
  onClose,
  language,
  onLanguageChange,
  theme,
  onThemeChange,
  providers,
  activeProviderId,
  onSelectActiveProvider,
  onCreateProvider,
  onUpdateProvider,
  onDeleteProvider,
  onTestProvider,
  models,
  customModels,
  selectedModel,
  onSelectModel,
  onRefreshModels,
  isFetchingModels,
  onAddCustomModel,
  onDeleteCustomModel,
  temperature,
  onChangeTemperature,
  systemInstruction,
  onChangeSystemInstruction,
  sendOnEnter,
  onChangeSendOnEnter,
  compactMode,
  onChangeCompactMode,
  license,
  quota,
  onActivateLicense,
  onVerifyLicense,
  onDeactivateLicense,
  keyStatus,
  onRefreshKeyStatus,
  onBackupMasterKey,
  onRestoreMasterKey,
  onRotateMasterKey,
}) => {
  const t = translations[language] || translations.en;
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

  // Provider form state
  const [showProviderForm, setShowProviderForm] = useState(false);
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [provName, setProvName] = useState('');
  const [provType, setProvType] = useState<ApiProvider>('openai');
  const [provBaseUrl, setProvBaseUrl] = useState('');
  const [provEndpoint, setProvEndpoint] = useState('');
  const [provKey, setProvKey] = useState('');
  const [provDefault, setProvDefault] = useState(true);
  const [showProvKey, setShowProvKey] = useState(false);
  const [provSaving, setProvSaving] = useState(false);
  const [testingFormConn, setTestingFormConn] = useState(false);
  const [provFeedback, setProvFeedback] = useState<{ type: 'idle' | 'success' | 'error'; msg?: string }>({ type: 'idle' });
  const [testingId, setTestingId] = useState<string | null>(null);
  const [confirmDeleteProviderId, setConfirmDeleteProviderId] = useState<string | null>(null);

  // Custom model state
  const [modelProviderId, setModelProviderId] = useState<string>(activeProviderId || providers[0]?.id || '');
  const [customModelId, setCustomModelId] = useState('');
  const [customModelName, setCustomModelName] = useState('');
  const [modelSearch, setModelSearch] = useState('');
  const [modelFeedback, setModelFeedback] = useState<{ type: 'idle' | 'success' | 'error'; msg?: string }>({ type: 'idle' });

  // License state
  const [licenseInput, setLicenseInput] = useState('');
  const [licenseLoading, setLicenseLoading] = useState<'idle' | 'activating' | 'verifying' | 'deactivating'>('idle');
  const [licenseFeedback, setLicenseFeedback] = useState<{ type: 'idle' | 'success' | 'error'; msg?: string }>({ type: 'idle' });
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  // Security & Master Key state
  const [backupPassphrase, setBackupPassphrase] = useState('');
  const [restoreContent, setRestoreContent] = useState('');
  const [restorePassphrase, setRestorePassphrase] = useState('');
  const [securityLoading, setSecurityLoading] = useState<'idle' | 'backup' | 'restore' | 'rotate'>('idle');
  const [securityFeedback, setSecurityFeedback] = useState<{ type: 'idle' | 'success' | 'error'; msg?: string }>({ type: 'idle' });
  const [confirmRotate, setConfirmRotate] = useState(false);

  const popularPresets = useMemo(() => getPopularOtherProviders(language), [language]);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setProvFeedback({ type: 'idle' });
      setModelFeedback({ type: 'idle' });
      setLicenseFeedback({ type: 'idle' });
      setSecurityFeedback({ type: 'idle' });
      setConfirmDeleteProviderId(null);
      setConfirmDeactivate(false);
      setConfirmRotate(false);
      void onRefreshKeyStatus();
    }
  }, [isOpen, initialTab, onRefreshKeyStatus]);

  useEffect(() => {
    if (activeProviderId) {
      setModelProviderId(activeProviderId);
    } else if (providers.length > 0 && (!modelProviderId || !providers.some((p) => p.id === modelProviderId))) {
      setModelProviderId(providers[0].id);
    } else if (providers.length === 0 && modelProviderId) {
      setModelProviderId('');
    }
  }, [activeProviderId, providers, modelProviderId]);

  if (!isOpen) return null;

  const openAddProvider = () => {
    setEditingProviderId(null);
    setProvName('');
    setProvType('openai');
    setProvBaseUrl('');
    setProvEndpoint('');
    setProvKey('');
    setProvDefault(providers.length === 0);
    setShowProvKey(false);
    setProvFeedback({ type: 'idle' });
    setShowProviderForm(true);
  };

  const openEditProvider = (p: ProviderConfig) => {
    setEditingProviderId(p.id);
    setProvName(p.name);
    setProvType(p.type);
    setProvBaseUrl(p.baseUrl || '');
    setProvEndpoint(p.apiEndpoint || '');
    setProvKey('');
    setProvDefault(p.isDefault);
    setShowProvKey(false);
    setProvFeedback({ type: 'idle' });
    setShowProviderForm(true);
  };

  const handleSaveProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!provName.trim()) {
      setProvFeedback({ type: 'error', msg: language === 'vi' ? 'Vui lòng nhập tên nhà cung cấp.' : 'Provider name is required.' });
      return;
    }
    setProvSaving(true);
    setProvFeedback({ type: 'idle' });
    try {
      const cleanBaseUrl = provBaseUrl.replace(/\s+/g, '');
      const cleanEndpoint = provEndpoint.replace(/\s+/g, '');
      const cleanKey = provKey.replace(/[\r\n\t]+/g, '').trim();
      const result = editingProviderId
        ? await onUpdateProvider(editingProviderId, {
            name: provName.trim(),
            type: provType,
            baseUrl: cleanBaseUrl,
            apiEndpoint: cleanEndpoint,
            apiKey: cleanKey || undefined,
            isDefault: provDefault,
          })
        : await onCreateProvider({
            name: provName.trim(),
            type: provType,
            baseUrl: cleanBaseUrl,
            apiEndpoint: cleanEndpoint,
            apiKey: cleanKey,
            isDefault: provDefault,
          });

      if (result.ok) {
        setShowProviderForm(false);
        setProvFeedback({
          type: 'success',
          msg: language === 'vi' ? 'Đã lưu cấu hình nhà cung cấp.' : 'Provider configuration saved.',
        });
      } else {
        setProvFeedback({ type: 'error', msg: result.error || 'Failed to save provider.' });
      }
    } finally {
      setProvSaving(false);
    }
  };

  const handleTestProviderClick = async (id: string) => {
    setTestingId(id);
    setProvFeedback({ type: 'idle' });
    try {
      const res = await onTestProvider(id);
      setProvFeedback({
        type: res.ok ? 'success' : 'error',
        msg: res.ok ? (res.message || t.statusConnected) : (res.error || t.statusError),
      });
    } finally {
      setTestingId(null);
    }
  };

  const handleTestFormConnection = async () => {
    setTestingFormConn(true);
    setProvFeedback({ type: 'idle' });
    try {
      const cleanBaseUrl = provBaseUrl.replace(/\s+/g, '');
      const cleanEndpoint = provEndpoint.replace(/\s+/g, '');
      const cleanKey = provKey.replace(/[\r\n\t]+/g, '').trim();
      const res = await apiFetch('/api/verify-key', {
        method: 'POST',
        body: JSON.stringify({
          providerId: editingProviderId || undefined,
          provider: provType,
          baseUrl: cleanBaseUrl,
          apiEndpoint: cleanEndpoint,
          apiKey: cleanKey,
        }),
      });
      const data = await res.json();
      setProvFeedback({
        type: data.ok ? 'success' : 'error',
        msg: data.ok ? (data.message || t.statusConnected) : (data.error || t.statusError),
      });
    } catch (err: any) {
      setProvFeedback({
        type: 'error',
        msg: err?.message || t.statusError,
      });
    } finally {
      setTestingFormConn(false);
    }
  };

  const handleAddCustomModelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modelProviderId || !customModelId.trim()) return;
    const res = await onAddCustomModel({
      providerId: modelProviderId,
      modelId: customModelId.trim(),
      displayName: customModelName.trim() || customModelId.trim(),
      isDefault: false,
    });
    if (res.ok) {
      setCustomModelId('');
      setCustomModelName('');
      setModelFeedback({
        type: 'success',
        msg: language === 'vi' ? 'Đã thêm mô hình tùy chỉnh.' : 'Custom model added.',
      });
      await onRefreshModels(modelProviderId);
    } else {
      setModelFeedback({ type: 'error', msg: res.error || 'Failed to add model.' });
    }
  };

  const handleActivateLicenseClick = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!licenseInput.trim()) {
      setLicenseFeedback({ type: 'error', msg: t.errorCodes.MISSING_LICENSE_KEY });
      return;
    }
    setLicenseLoading('activating');
    setLicenseFeedback({ type: 'idle' });
    try {
      const res = await onActivateLicense(licenseInput.trim());
      if (res.ok) {
        setLicenseInput('');
        setLicenseFeedback({ type: 'success', msg: t.licenseActivatedSuccessDesc });
      } else {
        setLicenseFeedback({
          type: 'error',
          msg: translateErrorCode(language, res.errorCode, res.errorMessage),
        });
      }
    } finally {
      setLicenseLoading('idle');
    }
  };

  const handleVerifyLicenseClick = async () => {
    setLicenseLoading('verifying');
    setLicenseFeedback({ type: 'idle' });
    try {
      const res = await onVerifyLicense(licenseInput.trim() || undefined);
      if (res.ok) {
        setLicenseFeedback({
          type: 'success',
          msg:
            res.activated === false
              ? t.licenseVerifiedReadyToActivate
              : t.licenseVerifiedSuccessDesc,
        });
      } else {
        setLicenseFeedback({
          type: 'error',
          msg: translateErrorCode(language, res.errorCode, res.errorMessage),
        });
      }
    } finally {
      setLicenseLoading('idle');
    }
  };

  const handleDeactivateLicenseClick = async () => {
    setConfirmDeactivate(false);
    setLicenseLoading('deactivating');
    setLicenseFeedback({ type: 'idle' });
    try {
      const res = await onDeactivateLicense();
      if (res.ok) {
        setLicenseInput('');
        setLicenseFeedback({
          type: 'success',
          msg: res.warning || (language === 'vi' ? 'Đã hủy kích hoạt và chuyển về gói Free.' : 'License deactivated. Switched to Free plan.'),
        });
      } else {
        setLicenseFeedback({
          type: 'error',
          msg: res.error || (language === 'vi' ? 'Không thể hủy kích hoạt bản quyền.' : 'Failed to deactivate license.'),
        });
      }
    } catch (err: any) {
      setLicenseFeedback({
        type: 'error',
        msg: err?.message || (language === 'vi' ? 'Không thể hủy kích hoạt bản quyền.' : 'Failed to deactivate license.'),
      });
    } finally {
      setLicenseLoading('idle');
    }
  };

  const handleBackupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSecurityLoading('backup');
    setSecurityFeedback({ type: 'idle' });
    try {
      const res = await onBackupMasterKey(backupPassphrase);
      if (res.ok && res.backupContent) {
        const blob = new Blob([res.backupContent], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = res.filename || 'chatai-master-key.backup.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setBackupPassphrase('');
        setSecurityFeedback({ type: 'success', msg: t.backupSuccessMsg });
      } else {
        setSecurityFeedback({ type: 'error', msg: res.error || 'Backup failed.' });
      }
    } finally {
      setSecurityLoading('idle');
    }
  };

  const handleRestoreFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setRestoreContent(reader.result);
      }
    };
    reader.readAsText(file);
  };

  const handleRestoreSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSecurityLoading('restore');
    setSecurityFeedback({ type: 'idle' });
    try {
      const res = await onRestoreMasterKey(restoreContent, restorePassphrase || undefined);
      if (res.ok) {
        setRestoreContent('');
        setRestorePassphrase('');
        setSecurityFeedback({ type: 'success', msg: t.restoreSuccessMsg });
      } else {
        setSecurityFeedback({ type: 'error', msg: res.error || 'Restore failed.' });
      }
    } finally {
      setSecurityLoading('idle');
    }
  };

  const handleRotateKeyClick = async () => {
    setConfirmRotate(false);
    setSecurityLoading('rotate');
    setSecurityFeedback({ type: 'idle' });
    try {
      const res = await onRotateMasterKey();
      if (res.ok) {
        setSecurityFeedback({
          type: 'success',
          msg: `${t.rotateSuccessMsg} (v${res.oldVersion} → v${res.newVersion}, ${res.reencryptedCount ?? 0} secrets)`,
        });
      } else {
        setSecurityFeedback({ type: 'error', msg: res.error || 'Rotation failed.' });
      }
    } finally {
      setSecurityLoading('idle');
    }
  };

  const tabs: { id: SettingsTab; label: string; icon: any; hasAlert?: boolean }[] = [
    { id: 'providers', label: t.tabProviders, icon: Server },
    { id: 'models', label: t.tabModels, icon: Cpu },
    { id: 'language', label: t.tabLanguage, icon: Globe },
    { id: 'general', label: t.tabGeneral, icon: Sliders },
    { id: 'license', label: t.tabLicense, icon: KeyRound },
    {
      id: 'security',
      label: t.tabSecurity,
      icon: ShieldCheck,
      hasAlert: Boolean(keyStatus && keyStatus.status !== 'ready'),
    },
  ];

  const presets = [
    { name: t.presetGeneral, prompt: t.presetGeneralPrompt },
    { name: t.presetCoding, prompt: t.presetCodingPrompt },
    { name: t.presetTranslator, prompt: t.presetTranslatorPrompt },
    { name: t.presetWriter, prompt: t.presetWriterPrompt },
  ];

  const filteredModels = models.filter((m) => {
    if (!modelSearch.trim()) return true;
    const q = modelSearch.toLowerCase();
    return m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q);
  });

  const licenseStatusLabel = (() => {
    if (license.plan === 'community' && license.status === 'active') return t.statusActive;
    if (license.status === 'expired') return t.statusExpired;
    if (license.status === 'revoked') return t.statusRevoked;
    if (license.status === 'invalid') return t.statusInvalid;
    if (license.status === 'error') return t.statusErrorLicense;
    return t.statusNotActivated;
  })();

  const isCommunity = license.plan === 'community' && license.status === 'active';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-5 bg-black/70 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl h-[90vh] max-h-[820px] bg-white dark:bg-[#111114] border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-neutral-900 dark:text-neutral-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#151519] shrink-0">
          <div>
            <h2 className="text-base sm:text-lg font-bold tracking-tight">{t.settingsTitle}</h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{t.settingsSubtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/70 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            title={t.closeBtn}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Layout: Left Navigation + Right Content */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0">
          {/* Navigation Sidebar */}
          <nav className="md:w-60 border-b md:border-b-0 md:border-r border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-[#0d0d10] p-2.5 flex md:flex-col gap-1 overflow-x-auto shrink-0">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 text-left ${
                    isActive
                      ? 'bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-950 font-semibold'
                      : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200/60 dark:hover:bg-neutral-800/70 hover:text-neutral-900 dark:hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1">{tab.label}</span>
                  {tab.hasAlert && (
                    <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Main Tab Content */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-6">
            {/* ==================== TAB 1: PROVIDERS ==================== */}
            {activeTab === 'providers' && (
              <div className="space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold">{t.providersHeading}</h3>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{t.providersDesc}</p>
                  </div>
                  <button
                    type="button"
                    onClick={openAddProvider}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-neutral-900 dark:bg-white hover:bg-neutral-800 dark:hover:bg-neutral-200 text-white dark:text-neutral-950 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{t.addProviderBtn}</span>
                  </button>
                </div>

                {keyStatus && keyStatus.status !== 'ready' && (
                  <div className="p-3.5 rounded-xl border border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{keyStatus.errorMessage || t.masterKeyAlertBanner}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('security')}
                      className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold whitespace-nowrap cursor-pointer self-start sm:self-center"
                    >
                      {t.tabSecurity}
                    </button>
                  </div>
                )}

                {provFeedback.type !== 'idle' && (
                  <div
                    className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                      provFeedback.type === 'success'
                        ? 'border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200'
                        : 'border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200'
                    }`}
                  >
                    {provFeedback.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    )}
                    <span>{provFeedback.msg}</span>
                  </div>
                )}

                {/* Add / Edit Provider Form */}
                {showProviderForm && (
                  <form
                    onSubmit={handleSaveProvider}
                    className="p-5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-[#16161b] space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold">
                        {editingProviderId ? t.editProviderTitle : t.newProviderTitle}
                      </h4>
                      <button
                        type="button"
                        onClick={() => setShowProviderForm(false)}
                        className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white cursor-pointer"
                      >
                        {t.cancelBtn}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">
                          {t.providerNameLabel}
                        </label>
                        <input
                          type="text"
                          value={provName}
                          onChange={(e) => setProvName(e.target.value)}
                          placeholder={t.providerNamePlaceholder}
                          className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#0c0c0f] text-xs sm:text-sm focus:outline-none focus:border-neutral-900 dark:focus:border-neutral-300"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">
                          {t.providerTypeLabel}
                        </label>
                        <select
                          value={provType}
                          onChange={(e) => {
                            const nextType = e.target.value as ApiProvider;
                            setProvType(nextType);
                            if (!provName.trim()) {
                              const labelMap: Record<ApiProvider, string> = {
                                openai: 'OpenAI',
                                google: 'Google Gemini',
                                claude: 'Anthropic Claude',
                                '9router': '9Router',
                                other: 'Custom OpenAI',
                              };
                              setProvName(labelMap[nextType]);
                            }
                          }}
                          className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#0c0c0f] text-xs sm:text-sm focus:outline-none"
                        >
                          <option value="openai">OpenAI</option>
                          <option value="google">Google AI Studio (Gemini)</option>
                          <option value="claude">Anthropic Claude</option>
                          <option value="9router">9Router</option>
                          <option value="other">Other / OpenAI-Compatible</option>
                        </select>
                      </div>
                    </div>

                    {provType === 'other' && (
                      <div>
                        <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">
                          {t.providerPresetLabel}
                        </label>
                        <select
                          onChange={(e) => {
                            const found = popularPresets.find((p) => p.id === e.target.value);
                            if (found) {
                              setProvBaseUrl(found.url);
                              if (!provName.trim() && found.id !== 'custom') setProvName(found.name);
                            }
                          }}
                          className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#0c0c0f] text-xs"
                        >
                          {popularPresets.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} {p.url ? `(${p.url})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">
                          {t.providerBaseUrlLabel}
                        </label>
                        <input
                          type="text"
                          value={provBaseUrl}
                          onChange={(e) => setProvBaseUrl(e.target.value.replace(/\s+/g, ''))}
                          placeholder={t.providerBaseUrlPlaceholder}
                          autoComplete="off"
                          spellCheck={false}
                          className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#0c0c0f] text-xs font-mono focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">
                          {t.providerEndpointLabel}
                        </label>
                        <input
                          type="text"
                          value={provEndpoint}
                          onChange={(e) => setProvEndpoint(e.target.value.replace(/\s+/g, ''))}
                          placeholder={t.providerEndpointPlaceholder}
                          autoComplete="off"
                          spellCheck={false}
                          className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#0c0c0f] text-xs font-mono focus:outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">
                        {t.providerApiKeyLabel}
                      </label>
                      <div className="relative">
                        <input
                          type={showProvKey ? 'text' : 'password'}
                          value={provKey}
                          onChange={(e) => setProvKey(e.target.value)}
                          placeholder={t.providerApiKeyPlaceholder}
                          className="w-full pl-3 pr-10 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#0c0c0f] text-xs font-mono focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowProvKey(!showProvKey)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
                        >
                          {showProvKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <label className="flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={provDefault}
                        onChange={(e) => setProvDefault(e.target.checked)}
                        className="rounded border-neutral-400"
                      />
                      <span>{t.providerDefaultToggle}</span>
                    </label>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => void handleTestFormConnection()}
                        disabled={
                          testingFormConn ||
                          provSaving ||
                          (!provKey.trim() && !(editingProviderId ? providers.find((p) => p.id === editingProviderId)?.hasApiKey : false))
                        }
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-xs font-medium cursor-pointer disabled:opacity-40"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${testingFormConn ? 'animate-spin' : ''}`} />
                        <span>{testingFormConn ? t.testingConnectionBtn : t.testConnectionBtn}</span>
                      </button>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setShowProviderForm(false)}
                          className="px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 text-xs font-medium cursor-pointer"
                        >
                          {t.cancelBtn}
                        </button>
                        <button
                          type="submit"
                          disabled={provSaving}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-950 text-xs font-semibold cursor-pointer disabled:opacity-50"
                        >
                          {provSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          <span>{t.saveBtn}</span>
                        </button>
                      </div>
                    </div>
                  </form>
                )}

                {/* Saved Providers List */}
                {providers.length === 0 ? (
                  <div className="p-8 rounded-xl border border-dashed border-neutral-300 dark:border-neutral-800 text-center space-y-2">
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">{t.noProvidersEmpty}</p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {(() => {
                      const effectiveActiveId =
                        activeProviderId || providers.find((x) => x.isDefault)?.id || providers[0]?.id || '';
                      return providers.map((p) => {
                      const isActive = p.id === effectiveActiveId;
                      const isTesting = testingId === p.id;
                      return (
                        <div
                          key={p.id}
                          className={`p-4 rounded-xl border transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                            isActive
                              ? 'border-neutral-900 dark:border-neutral-300 bg-neutral-50 dark:bg-[#17171c]'
                              : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#111114]'
                          }`}
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-neutral-900 dark:text-white truncate">
                                {p.name}
                              </span>
                              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                                · {p.type.toUpperCase()}
                              </span>
                              {isActive && (
                                <span className="text-xs font-semibold text-neutral-900 dark:text-white">
                                  · {t.activeBadge}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 flex-wrap text-xs text-neutral-500 dark:text-neutral-400 font-mono">
                              <span>{p.hasApiKey ? p.keyMask : t.noKeyYet}</span>
                              {p.baseUrl && <span>· {p.baseUrl}{p.apiEndpoint || ''}</span>}
                              {!p.baseUrl && p.apiEndpoint && <span>· {p.apiEndpoint}</span>}
                            </div>

                            <div className="flex items-center gap-1.5 text-xs">
                              {p.status === 'connected' ? (
                                <span className="text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1 font-medium">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  {t.statusConnected}
                                </span>
                              ) : p.status === 'error' ? (
                                <span className="text-red-600 dark:text-red-400 inline-flex items-center gap-1 font-medium">
                                  <AlertCircle className="w-3.5 h-3.5" />
                                  {t.statusError}{p.lastError ? `: ${p.lastError}` : ''}
                                </span>
                              ) : (
                                <span className="text-neutral-500 dark:text-neutral-400">{t.statusUnverified}</span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                            {!isActive && (
                              <button
                                type="button"
                                onClick={() => onSelectActiveProvider(p.id)}
                                className="px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-xs font-medium cursor-pointer whitespace-nowrap"
                              >
                                {t.setActiveBtn}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleTestProviderClick(p.id)}
                              disabled={isTesting || !p.hasApiKey}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-xs font-medium cursor-pointer disabled:opacity-40 whitespace-nowrap"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                              <span>{isTesting ? t.testingConnectionBtn : t.testConnectionBtn}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditProvider(p)}
                              className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 hover:text-neutral-900 dark:hover:text-white cursor-pointer"
                              title={t.editBtn}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            {confirmDeleteProviderId === p.id ? (
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    setConfirmDeleteProviderId(null);
                                    await onDeleteProvider(p.id);
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer"
                                >
                                  {t.confirmBtn}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteProviderId(null)}
                                  className="px-2.5 py-1 rounded-lg border border-neutral-300 dark:border-neutral-700 text-xs font-medium cursor-pointer"
                                >
                                  {t.cancelBtn}
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteProviderId(p.id)}
                                className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:bg-red-50 dark:hover:bg-red-950/40 text-neutral-500 hover:text-red-600 cursor-pointer"
                                title={t.deleteBtn}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    });
                    })()}
                  </div>
                )}

                <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400 pt-1">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>{t.keyEncryptedNotice}</span>
                </div>
              </div>
            )}

            {/* ==================== TAB 2: AI MODELS ==================== */}
            {activeTab === 'models' && (
              <div className="space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold">{t.modelsHeading}</h3>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{t.modelsDesc}</p>
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      setModelFeedback({ type: 'idle' });
                      const res = await onRefreshModels(modelProviderId);
                      if (res && !res.ok && res.error) {
                        setModelFeedback({ type: 'error', msg: res.error });
                      }
                    }}
                    disabled={isFetchingModels || !modelProviderId}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-xs font-semibold cursor-pointer disabled:opacity-40 whitespace-nowrap shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isFetchingModels ? 'animate-spin' : ''}`} />
                    <span>{isFetchingModels ? t.fetchingModelsBtn : t.fetchModelsBtn}</span>
                  </button>
                </div>

                {/* Provider Selector + Search */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                      {t.selectProviderForModels}
                    </label>
                    <select
                      value={modelProviderId}
                      onChange={async (e) => {
                        const nextId = e.target.value;
                        setModelProviderId(nextId);
                        await onSelectActiveProvider(nextId);
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#0c0c0f] text-xs sm:text-sm"
                    >
                      {providers.length === 0 ? (
                        <option value="">{t.noProviderConfigured}</option>
                      ) : (
                        providers.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.type})
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                      {t.defaultModelLabel}
                    </label>
                    <input
                      type="text"
                      value={modelSearch}
                      onChange={(e) => setModelSearch(e.target.value)}
                      placeholder={selectedModel || 'Filter models...'}
                      className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#0c0c0f] text-xs sm:text-sm"
                    />
                  </div>
                </div>

                {modelFeedback.type !== 'idle' && (
                  <div
                    className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                      modelFeedback.type === 'success'
                        ? 'border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200'
                        : 'border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200'
                    }`}
                  >
                    <span>{modelFeedback.msg}</span>
                  </div>
                )}

                {/* Add Custom Model */}
                {providers.length > 0 && (
                  <form
                    onSubmit={handleAddCustomModelSubmit}
                    className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#151519] space-y-3"
                  >
                    <h4 className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                      {t.addCustomModelTitle}
                    </h4>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={customModelId}
                        onChange={(e) => setCustomModelId(e.target.value)}
                        placeholder={t.customModelIdPlaceholder}
                        className="flex-1 px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#0c0c0f] text-xs font-mono"
                      />
                      <input
                        type="text"
                        value={customModelName}
                        onChange={(e) => setCustomModelName(e.target.value)}
                        placeholder={t.customModelNamePlaceholder}
                        className="sm:w-44 px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#0c0c0f] text-xs"
                      />
                      <button
                        type="submit"
                        disabled={!customModelId.trim()}
                        className="px-4 py-2 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-950 text-xs font-semibold cursor-pointer disabled:opacity-40 whitespace-nowrap"
                      >
                        {t.addCustomModelBtn}
                      </button>
                    </div>
                  </form>
                )}

                {/* Model List */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
                    <span>
                      {t.availableModelsCount}: <strong className="tabular-nums text-neutral-900 dark:text-white">{filteredModels.length}</strong>
                    </span>
                    {selectedModel && (
                      <span className="font-mono text-neutral-700 dark:text-neutral-300">
                        {t.activeBadge}: {selectedModel}
                      </span>
                    )}
                  </div>

                  {filteredModels.length === 0 ? (
                    <div className="p-6 rounded-xl border border-dashed border-neutral-300 dark:border-neutral-800 text-center text-xs text-neutral-500 dark:text-neutral-400">
                      {t.noModelsInSettings}
                    </div>
                  ) : (
                    <div className="max-h-72 overflow-y-auto border border-neutral-200 dark:border-neutral-800 rounded-xl divide-y divide-neutral-200 dark:divide-neutral-800">
                      {filteredModels.map((m) => {
                        const isSelected = m.id === selectedModel;
                        const customRecord = customModels.find((cm) => cm.model_id === m.id);
                        return (
                          <div
                            key={`${m.provider || ''}-${m.id}`}
                            className={`px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs ${
                              isSelected ? 'bg-neutral-100 dark:bg-[#19191f]' : 'hover:bg-neutral-50 dark:hover:bg-[#151519]'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="font-mono font-medium text-neutral-900 dark:text-white truncate">
                                {m.name}
                              </div>
                              <div className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                                {m.id} · {m.badge}
                                {m.isCustom ? ` · ${t.customTag}` : ''}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {isSelected ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-950 text-xs font-semibold whitespace-nowrap">
                                  <Check className="w-3 h-3" />
                                  {t.defaultTag}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => onSelectModel(m.id)}
                                  className="px-3 py-1 rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-200/70 dark:hover:bg-neutral-800 text-xs font-medium cursor-pointer whitespace-nowrap"
                                >
                                  {t.useModelBtn}
                                </button>
                              )}
                              {customRecord && (
                                <button
                                  type="button"
                                  onClick={() => onDeleteCustomModel(customRecord.id)}
                                  className="p-1.5 rounded-lg text-neutral-400 hover:text-red-500 cursor-pointer"
                                  title={t.deleteBtn}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ==================== TAB 3: LANGUAGE ==================== */}
            {activeTab === 'language' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-base font-semibold">{t.languageHeading}</h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{t.languageDesc}</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <button
                    type="button"
                    onClick={() => onLanguageChange('en')}
                    className={`p-4 rounded-xl border text-left transition-colors cursor-pointer space-y-1.5 ${
                      language === 'en'
                        ? 'border-neutral-900 dark:border-white bg-neutral-100 dark:bg-[#19191f]'
                        : 'border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-[#151519]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{t.langEnglishName}</span>
                      {language === 'en' && <CheckCircle2 className="w-4 h-4 text-neutral-900 dark:text-white" />}
                    </div>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">{t.langEnglishDesc}</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => onLanguageChange('vi')}
                    className={`p-4 rounded-xl border text-left transition-colors cursor-pointer space-y-1.5 ${
                      language === 'vi'
                        ? 'border-neutral-900 dark:border-white bg-neutral-100 dark:bg-[#19191f]'
                        : 'border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-[#151519]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{t.langVietnameseName}</span>
                      {language === 'vi' && <CheckCircle2 className="w-4 h-4 text-neutral-900 dark:text-white" />}
                    </div>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">{t.langVietnameseDesc}</p>
                  </button>
                </div>
              </div>
            )}

            {/* ==================== TAB 4: GENERAL ==================== */}
            {activeTab === 'general' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-semibold">{t.generalHeading}</h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{t.generalDesc}</p>
                </div>

                {/* Theme Selector */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    {t.themeLabel}
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => onThemeChange('dark')}
                      className={`p-3.5 rounded-xl border text-left transition-colors cursor-pointer flex items-start gap-3 ${
                        theme === 'dark'
                          ? 'border-neutral-900 dark:border-white bg-neutral-100 dark:bg-[#19191f]'
                          : 'border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-[#151519]'
                      }`}
                    >
                      <Moon className="w-4 h-4 mt-0.5 shrink-0" />
                      <div>
                        <div className="text-xs font-semibold">{t.themeDark}</div>
                        <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">{t.themeDarkDesc}</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => onThemeChange('light')}
                      className={`p-3.5 rounded-xl border text-left transition-colors cursor-pointer flex items-start gap-3 ${
                        theme === 'light'
                          ? 'border-neutral-900 dark:border-white bg-neutral-100 dark:bg-[#19191f]'
                          : 'border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-[#151519]'
                      }`}
                    >
                      <Sun className="w-4 h-4 mt-0.5 shrink-0" />
                      <div>
                        <div className="text-xs font-semibold">{t.themeLight}</div>
                        <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">{t.themeLightDesc}</div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Temperature */}
                <div className="space-y-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-neutral-700 dark:text-neutral-300">{t.creativityTitle}</span>
                    <span className="font-mono font-bold tabular-nums">{temperature}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={temperature}
                    onChange={(e) => onChangeTemperature(parseFloat(e.target.value))}
                    className="w-full accent-neutral-900 dark:accent-white cursor-pointer"
                  />
                  <div className="flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400">
                    <button type="button" onClick={() => onChangeTemperature(0.2)} className="hover:underline cursor-pointer">
                      {t.preciseTemp}
                    </button>
                    <button type="button" onClick={() => onChangeTemperature(0.7)} className="hover:underline cursor-pointer">
                      {t.balancedTemp}
                    </button>
                    <button type="button" onClick={() => onChangeTemperature(1.0)} className="hover:underline cursor-pointer">
                      {t.creativeTemp}
                    </button>
                  </div>
                </div>

                {/* System Prompt */}
                <div className="space-y-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    {t.systemPromptTitle}
                  </label>
                  <textarea
                    rows={3}
                    value={systemInstruction}
                    onChange={(e) => onChangeSystemInstruction(e.target.value)}
                    placeholder={t.systemPromptPlaceholder}
                    className="w-full p-3 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#0c0c0f] text-xs sm:text-sm focus:outline-none resize-none"
                  />
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                      {t.quickPresetsLabel}
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      {presets.map((p, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => onChangeSystemInstruction(p.prompt)}
                          className="px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#16161b] hover:bg-neutral-100 dark:hover:bg-neutral-800 text-xs font-medium truncate text-left cursor-pointer"
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Behavior Toggles */}
                <div className="space-y-2.5 pt-2 border-t border-neutral-200 dark:border-neutral-800">
                  <label className="flex items-center justify-between text-xs cursor-pointer">
                    <span>{t.sendOnEnterLabel}</span>
                    <input
                      type="checkbox"
                      checked={sendOnEnter}
                      onChange={(e) => onChangeSendOnEnter(e.target.checked)}
                      className="rounded border-neutral-400"
                    />
                  </label>
                  <label className="flex items-center justify-between text-xs cursor-pointer">
                    <span>{t.compactModeLabel}</span>
                    <input
                      type="checkbox"
                      checked={compactMode}
                      onChange={(e) => onChangeCompactMode(e.target.checked)}
                      className="rounded border-neutral-400"
                    />
                  </label>
                </div>
              </div>
            )}

            {/* ==================== TAB 5: LICENSE & SUBSCRIPTION (FREE & COMMUNITY ONLY) ==================== */}
            {activeTab === 'license' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-base font-semibold">{t.licenseHeading}</h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{t.licenseDesc}</p>
                </div>

                {/* Strictly Two Plans Summary: Free & Community */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div
                    className={`p-4 rounded-xl border ${
                      !isCommunity
                        ? 'border-neutral-900 dark:border-white bg-neutral-100/70 dark:bg-[#19191f]'
                        : 'border-neutral-200 dark:border-neutral-800 opacity-75'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold">{t.freePlanSummaryTitle}</span>
                      {!isCommunity && (
                        <span className="text-xs font-semibold text-neutral-900 dark:text-white">{t.activeBadge}</span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                      {t.freePlanSummaryDesc}
                    </p>
                  </div>

                  <div
                    className={`p-4 rounded-xl border ${
                      isCommunity
                        ? 'border-emerald-500/70 bg-emerald-50/50 dark:bg-emerald-950/20'
                        : 'border-neutral-200 dark:border-neutral-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold">{t.communityPlanSummaryTitle}</span>
                      {isCommunity && (
                        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{t.activeBadge}</span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                      {t.communityPlanSummaryDesc}
                    </p>
                  </div>
                </div>

                {/* Active Plan & Quota Details */}
                <div className="p-4 sm:p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#151519] space-y-3 text-xs">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div>
                      <span className="text-neutral-500 dark:text-neutral-400 block">{t.currentPlanLabel}</span>
                      <span className="font-semibold text-sm text-neutral-900 dark:text-white">
                        {isCommunity ? t.planCommunity : t.planFree}
                      </span>
                    </div>
                    <div>
                      <span className="text-neutral-500 dark:text-neutral-400 block">{t.licenseStatusLabel}</span>
                      <span
                        className={`font-semibold text-sm ${
                          isCommunity
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : license.status === 'expired' || license.status === 'revoked'
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-neutral-800 dark:text-neutral-200'
                        }`}
                      >
                        {licenseStatusLabel}
                      </span>
                    </div>
                    <div>
                      <span className="text-neutral-500 dark:text-neutral-400 block">{t.usageLimitLabel}</span>
                      <span className="font-mono font-semibold tabular-nums">
                        {quota.chatLimit.toLocaleString()} {t.chatsPerDayUnit}
                      </span>
                    </div>

                    <div>
                      <span className="text-neutral-500 dark:text-neutral-400 block">{t.usedQuotaLabel}</span>
                      <span className="font-mono font-semibold tabular-nums">
                        {quota.chatUsed.toLocaleString()} / {quota.chatLimit.toLocaleString()} · {quota.tokenUsed.toLocaleString()} {t.tokensCount}
                      </span>
                    </div>
                    <div>
                      <span className="text-neutral-500 dark:text-neutral-400 block">{t.remainingQuotaLabel}</span>
                      <span className="font-mono font-semibold tabular-nums">
                        {quota.chatRemaining.toLocaleString()} {t.chatsPerDayUnit} · {quota.tokenRemaining.toLocaleString()} {t.tokensCount}
                      </span>
                    </div>

                    {isCommunity && (
                      <>
                        <div>
                          <span className="text-neutral-500 dark:text-neutral-400 block">{t.licenseKeyLabel}</span>
                          <span className="font-mono font-medium">{license.maskedKey}</span>
                        </div>
                        <div>
                          <span className="text-neutral-500 dark:text-neutral-400 block">{t.productNameLabel}</span>
                          <span className="font-medium">{license.productName || 'ChatAI'}</span>
                        </div>
                        <div>
                          <span className="text-neutral-500 dark:text-neutral-400 block">{t.activationDateLabel}</span>
                          <span className="font-mono tabular-nums">
                            {license.activatedAt ? new Date(license.activatedAt).toLocaleDateString() : '—'}
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  {isCommunity && (
                    <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 space-y-1.5">
                      <span className="text-neutral-500 dark:text-neutral-400 font-medium block">{t.entitlementsLabel}</span>
                      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
                        <span>
                          {t.entitlementAnalytics}:{' '}
                          <strong>{license.entitlements.usageAnalytics ? t.enabledLabel : t.lockedLabel}</strong>
                        </span>
                        <span>
                          {t.entitlementHistory}:{' '}
                          <strong>{license.entitlements.tokenHistory ? t.enabledLabel : t.lockedLabel}</strong>
                        </span>
                        <span>
                          {t.entitlementCustomModels}:{' '}
                          <strong>{license.entitlements.customModels ? t.enabledLabel : t.lockedLabel}</strong>
                        </span>
                      </div>
                    </div>
                  )}

                  {license.usingCachedVerification && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">{t.cachedStatusNotice}</p>
                  )}
                </div>

                {!license.keygateConfigured && (
                  <div className="p-3.5 rounded-xl border border-amber-300/70 dark:border-amber-500/30 bg-amber-50/70 dark:bg-amber-950/25 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{t.keygateUnconfiguredNotice}</span>
                  </div>
                )}

                {licenseFeedback.type !== 'idle' && (
                  <div
                    className={`p-3.5 rounded-xl border text-xs flex items-start gap-2 ${
                      licenseFeedback.type === 'success'
                        ? 'border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200'
                        : 'border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200'
                    }`}
                  >
                    {licenseFeedback.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    )}
                    <span>{licenseFeedback.msg}</span>
                  </div>
                )}

                {/* License Actions */}
                {!isCommunity ? (
                  <form onSubmit={handleActivateLicenseClick} className="space-y-3">
                    <input
                      type="text"
                      value={licenseInput}
                      onChange={(e) => setLicenseInput(e.target.value)}
                      placeholder={t.licensePlaceholder}
                      autoComplete="off"
                      spellCheck={false}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#0c0c0f] text-sm font-mono focus:outline-none"
                    />
                    <div className="flex flex-wrap gap-2.5">
                      <button
                        type="submit"
                        disabled={licenseLoading !== 'idle'}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-950 text-xs font-semibold cursor-pointer disabled:opacity-50 whitespace-nowrap"
                      >
                        {licenseLoading === 'activating' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        <span>{licenseLoading === 'activating' ? t.activatingLicenseBtn : t.activateLicenseBtn}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleVerifyLicenseClick}
                        disabled={licenseLoading !== 'idle'}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-xs font-semibold cursor-pointer disabled:opacity-50 whitespace-nowrap"
                      >
                        {licenseLoading === 'verifying' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        <span>{licenseLoading === 'verifying' ? t.verifyingLicenseBtn : t.verifyLicenseBtn}</span>
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2.5">
                      <button
                        type="button"
                        onClick={handleVerifyLicenseClick}
                        disabled={licenseLoading !== 'idle'}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-xs font-semibold cursor-pointer disabled:opacity-50 whitespace-nowrap"
                      >
                        {licenseLoading === 'verifying' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        <span>{licenseLoading === 'verifying' ? t.verifyingLicenseBtn : t.verifyLicenseBtn}</span>
                      </button>
                      {!confirmDeactivate && (
                        <button
                          type="button"
                          onClick={() => setConfirmDeactivate(true)}
                          disabled={licenseLoading !== 'idle'}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-red-300 dark:border-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 text-xs font-semibold cursor-pointer disabled:opacity-50 whitespace-nowrap"
                        >
                          {licenseLoading === 'deactivating' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          <span>{licenseLoading === 'deactivating' ? t.deactivatingLicenseBtn : t.deactivateLicenseBtn}</span>
                        </button>
                      )}
                    </div>

                    {confirmDeactivate && (
                      <div className="p-3.5 rounded-xl border border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-950/25 text-xs space-y-2.5">
                        <p className="text-red-800 dark:text-red-200 leading-relaxed">{t.confirmDeactivateLicense}</p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleDeactivateLicenseClick()}
                            disabled={licenseLoading !== 'idle'}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold cursor-pointer disabled:opacity-50"
                          >
                            {licenseLoading === 'deactivating' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            <span>{t.confirmBtn}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeactivate(false)}
                            disabled={licenseLoading !== 'idle'}
                            className="px-3.5 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#0c0c0f] font-medium cursor-pointer"
                          >
                            {t.cancelBtn}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ==================== TAB 6: SECURITY & MASTER KEY ==================== */}
            {activeTab === 'security' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-base font-semibold">{t.securityHeading}</h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{t.securityDesc}</p>
                </div>

                {/* Master Key Health Card */}
                {keyStatus && (
                  <div
                    className={`p-4 sm:p-5 rounded-xl border space-y-3 text-xs ${
                      keyStatus.status === 'ready'
                        ? 'border-emerald-300/80 dark:border-emerald-500/35 bg-emerald-50/40 dark:bg-emerald-950/15'
                        : 'border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-950/25'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 font-semibold text-sm">
                        {keyStatus.status === 'ready' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
                        )}
                        <span>
                          {keyStatus.status === 'ready'
                            ? t.masterKeyStatusReady
                            : keyStatus.status === 'missing'
                            ? t.masterKeyStatusMissing
                            : keyStatus.status === 'corrupted'
                            ? t.masterKeyStatusCorrupted
                            : t.masterKeyStatusMismatch}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => void onRefreshKeyStatus()}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-xs font-medium cursor-pointer"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Refresh</span>
                      </button>
                    </div>

                    {keyStatus.errorMessage && keyStatus.status !== 'ready' && (
                      <p className="text-red-700 dark:text-red-300 leading-relaxed">{keyStatus.errorMessage}</p>
                    )}

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                      <div>
                        <span className="text-neutral-500 dark:text-neutral-400 block">{t.keyVersionLabel}</span>
                        <span className="font-mono font-semibold">
                          {keyStatus.activeKeyVersion > 0 ? `v${keyStatus.activeKeyVersion}` : '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-neutral-500 dark:text-neutral-400 block">{t.keyFingerprintLabel}</span>
                        <span className="font-mono font-semibold">{keyStatus.fingerprint || '—'}</span>
                      </div>
                      <div>
                        <span className="text-neutral-500 dark:text-neutral-400 block">{t.keyPermissionsLabel}</span>
                        <span className="font-mono font-semibold">{keyStatus.filePermissions || '—'}</span>
                      </div>
                      <div>
                        <span className="text-neutral-500 dark:text-neutral-400 block">{t.encryptedItemsLabel}</span>
                        <span className="font-mono font-semibold">
                          {keyStatus.encryptedProvidersCount} {t.encryptedProvidersUnit}
                          {keyStatus.hasEncryptedLicense ? ` + ${t.licenseKeyProtectedLabel}` : ''}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-neutral-200/70 dark:border-neutral-800/70 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <span className="text-neutral-500 dark:text-neutral-400 block">{t.keyStorageLocationLabel}</span>
                        <span className="font-mono text-[11px] break-all">{keyStatus.keyFilePath}</span>
                      </div>
                      <div>
                        <span className="text-neutral-500 dark:text-neutral-400 block">{t.keyLastRotatedLabel}</span>
                        <span className="font-mono text-[11px]">
                          {keyStatus.lastRotationAt ? new Date(keyStatus.lastRotationAt).toLocaleString() : t.neverRotatedLabel}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {securityFeedback.type !== 'idle' && (
                  <div
                    className={`p-3.5 rounded-xl border text-xs flex items-start gap-2 ${
                      securityFeedback.type === 'success'
                        ? 'border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200'
                        : 'border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200'
                    }`}
                  >
                    {securityFeedback.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    )}
                    <span>{securityFeedback.msg}</span>
                  </div>
                )}

                {/* Backup Master Key */}
                <form
                  onSubmit={handleBackupSubmit}
                  className="p-4 sm:p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#151519] space-y-3"
                >
                  <div>
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <Download className="w-4 h-4" />
                      <span>{t.backupKeyTitle}</span>
                    </h4>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 leading-relaxed">
                      {t.backupKeyDesc}
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <input
                      type="password"
                      value={backupPassphrase}
                      onChange={(e) => setBackupPassphrase(e.target.value)}
                      placeholder={t.backupPassphrasePlaceholder}
                      minLength={8}
                      required
                      disabled={!keyStatus || keyStatus.status !== 'ready'}
                      className="flex-1 px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#0c0c0f] text-xs focus:outline-none disabled:opacity-50"
                    />
                    <button
                      type="submit"
                      disabled={securityLoading !== 'idle' || !keyStatus || keyStatus.status !== 'ready'}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-950 text-xs font-semibold cursor-pointer disabled:opacity-40 whitespace-nowrap"
                    >
                      {securityLoading === 'backup' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                      <span>{securityLoading === 'backup' ? t.backingUpBtn : t.downloadBackupBtn}</span>
                    </button>
                  </div>
                </form>

                {/* Restore Master Key */}
                <form
                  onSubmit={handleRestoreSubmit}
                  className="p-4 sm:p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#151519] space-y-3"
                >
                  <div>
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <Upload className="w-4 h-4" />
                      <span>{t.restoreKeyTitle}</span>
                    </h4>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 leading-relaxed">
                      {t.restoreKeyDesc}
                    </p>
                  </div>
                  <div className="space-y-2.5">
                    <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#0c0c0f] text-xs font-medium cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800">
                      <Upload className="w-3.5 h-3.5" />
                      <span>{t.restoreFileLabel}</span>
                      <input
                        type="file"
                        accept=".json,.key,.txt"
                        onChange={handleRestoreFileChange}
                        className="hidden"
                      />
                    </label>
                    <textarea
                      rows={3}
                      value={restoreContent}
                      onChange={(e) => setRestoreContent(e.target.value)}
                      placeholder={t.restorePastePlaceholder}
                      className="w-full p-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#0c0c0f] text-[11px] font-mono focus:outline-none resize-none"
                    />
                    <div className="flex flex-col sm:flex-row gap-2.5">
                      <input
                        type="password"
                        value={restorePassphrase}
                        onChange={(e) => setRestorePassphrase(e.target.value)}
                        placeholder={t.restorePassphrasePlaceholder}
                        className="flex-1 px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#0c0c0f] text-xs focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={securityLoading !== 'idle' || !restoreContent.trim()}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#0c0c0f] hover:bg-neutral-100 dark:hover:bg-neutral-800 text-xs font-semibold cursor-pointer disabled:opacity-40 whitespace-nowrap"
                      >
                        {securityLoading === 'restore' ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Upload className="w-3.5 h-3.5" />
                        )}
                        <span>{securityLoading === 'restore' ? t.restoringKeyBtn : t.restoreKeyBtn}</span>
                      </button>
                    </div>
                  </div>
                </form>

                {/* Rotate Master Key */}
                <div className="p-4 sm:p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#151519] space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <RotateCw className="w-4 h-4" />
                        <span>{t.rotateKeyTitle}</span>
                      </h4>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                        {t.rotateKeyDesc}
                      </p>
                    </div>
                    {!confirmRotate && (
                      <button
                        type="button"
                        onClick={() => setConfirmRotate(true)}
                        disabled={securityLoading !== 'idle' || !keyStatus || keyStatus.status !== 'ready'}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-xs font-semibold cursor-pointer disabled:opacity-40 whitespace-nowrap shrink-0"
                      >
                        <RotateCw className={`w-3.5 h-3.5 ${securityLoading === 'rotate' ? 'animate-spin' : ''}`} />
                        <span>{securityLoading === 'rotate' ? t.rotatingKeyBtn : t.rotateKeyBtn}</span>
                      </button>
                    )}
                  </div>

                  {confirmRotate && (
                    <div className="p-3 rounded-lg border border-amber-300 dark:border-amber-500/40 bg-amber-50/70 dark:bg-amber-950/25 text-xs space-y-2">
                      <p className="text-amber-900 dark:text-amber-200 leading-relaxed">{t.rotateKeyConfirm}</p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleRotateKeyClick()}
                          disabled={securityLoading !== 'idle'}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-950 font-semibold cursor-pointer disabled:opacity-50"
                        >
                          {securityLoading === 'rotate' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          <span>{t.confirmBtn}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmRotate(false)}
                          disabled={securityLoading !== 'idle'}
                          className="px-3.5 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#0c0c0f] font-medium cursor-pointer"
                        >
                          {t.cancelBtn}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
