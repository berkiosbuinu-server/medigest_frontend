// modules/stats/views/Dashboard.tsx
/**
 * Tableau de bord
 * - Consomme uniquement /api/v1/dashboard (currency-summary)
 * - Une section de cartes par devise ayant des données
 * - Cartes : Ventes, Dépenses, Bénéfices, Dettes, Retours
 * - S'adapte à la branche active de l'utilisateur
 * - Vérifie l'abonnement avant d'afficher l'annonce « Mode lecture seule »
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Building2,
  CreditCard,
  LayoutDashboard,
  RefreshCw,
  RotateCcw,
  ShoppingBag,
  TrendingUp,
  Wallet,
} from 'lucide-react';

import { useAuthStore } from '@/store/useAuthStore';
import { usePharmacy } from '@/contexts/PharmacyContext';
import { useSubscription } from '@/hooks/useSubscription';
import { ExpiryWarningBanner } from '@/components/ExpiryWarningBanner';
import dashboardService, {
  CurrencyBucket,
  CurrencySummaryResponse,
} from '@/services/dashboardService';

// ===================================================================
// TYPES
// ===================================================================

type Period = 'today' | 'month';

type ReadOnlyReason = 'expired' | 'trial_ended' | 'inactive' | 'none';

interface CardDef {
  id: string;
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactElement;
  iconClass: string;
  href: string;
}

// ===================================================================
// UTILITAIRES
// ===================================================================

const CURRENCY_SYMBOLS: Record<string, string> = {
  FC: 'FC',
  CDF: 'FC',
  USD: '$',
  EUR: '€',
  GNF: 'FG',
  XOF: 'FCFA',
};

const CURRENCY_LABELS: Record<string, string> = {
  FC: 'Franc congolais',
  CDF: 'Franc congolais',
  USD: 'Dollar américain',
  EUR: 'Euro',
  GNF: 'Franc guinéen',
  XOF: 'Franc CFA',
};

const DECIMAL_CURRENCIES = new Set(['USD', 'EUR']);

function formatAmount(value: number, currency: string): string {
  const decimals = DECIMAL_CURRENCIES.has(currency) ? 2 : 0;
  const number = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number.isFinite(value) ? value : 0);
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency;
  return `${number} ${symbol}`;
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getRange(period: Period): { start: string; end: string } {
  const now = new Date();
  const end = toIsoDate(now);
  if (period === 'today') return { start: end, end };
  return { start: toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1)), end };
}

function hasData(b: CurrencyBucket): boolean {
  return (
    b.sales_count > 0 ||
    b.expenses_count > 0 ||
    b.debts_count > 0 ||
    b.returns_count > 0 ||
    b.sales_amount !== 0 ||
    b.expenses_amount !== 0 ||
    b.debts_amount !== 0 ||
    b.returns_amount !== 0 ||
    b.profit !== 0
  );
}

function plural(n: number, singular: string, pluralForm: string): string {
  return `${n} ${n > 1 ? pluralForm : singular}`;
}

function formatLongDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Erreur lors du chargement des données';
}

function buildCards(currency: string, b: CurrencyBucket, period: Period): CardDef[] {
  const margin = b.revenue > 0 ? Math.round((b.profit / b.revenue) * 1000) / 10 : null;
  const salesLabel = period === 'today' ? "Ventes d'aujourd'hui" : 'Ventes du mois';

  return [
    {
      id: 'sales',
      title: salesLabel,
      value: formatAmount(b.sales_amount, currency),
      subtitle: plural(b.sales_count, 'vente', 'ventes'),
      icon: <ShoppingBag size={20} />,
      iconClass: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
      href: '/historique',
    },
    {
      id: 'expenses',
      title: 'Dépenses',
      value: formatAmount(b.expenses_amount, currency),
      subtitle: plural(b.expenses_count, 'dépense', 'dépenses'),
      icon: <Wallet size={20} />,
      iconClass: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
      href: '/expenses',
    },
    {
      id: 'profit',
      title: 'Bénéfices',
      value: formatAmount(b.profit, currency),
      subtitle: margin !== null ? `Marge ${margin}%` : 'Aucune marge calculable',
      icon: <TrendingUp size={20} />,
      iconClass: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
      href: '/profits',
    },
    {
      id: 'debts',
      title: 'Dettes',
      value: formatAmount(b.debts_amount, currency),
      subtitle: `${plural(b.debts_count, 'dette', 'dettes')} (solde restant)`,
      icon: <CreditCard size={20} />,
      iconClass: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
      href: '/debts',
    },
    {
      id: 'returns',
      title: 'Retours',
      value: formatAmount(b.returns_amount, currency),
      subtitle: plural(b.returns_count, 'retour', 'retours'),
      icon: <RotateCcw size={20} />,
      iconClass: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
      href: '/returns',
    },
  ];
}

// ===================================================================
// ANNONCE « MODE LECTURE SEULE »
// ===================================================================

const READ_ONLY_MESSAGES: Record<ReadOnlyReason, (expiredOn: string | null) => string> = {
  expired: (date) =>
    `Votre abonnement a expiré${date ? ` le ${date}` : ''}. Vous ne pouvez pas modifier les données.`,
  trial_ended: () =>
    "Votre période d'essai est terminée. Vous ne pouvez pas modifier les données.",
  inactive: () => 'Votre abonnement est inactif. Vous ne pouvez pas modifier les données.',
  none: () => "Aucun abonnement actif n'a été trouvé. Vous ne pouvez pas modifier les données.",
};

const ReadOnlyBanner: React.FC<{
  reason: ReadOnlyReason;
  expiredOn: string | null;
  onRenew: () => void;
}> = ({ reason, expiredOn, onRenew }) => (
  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800/50 dark:bg-amber-900/20">
    <div className="flex items-start gap-3">
      <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-500" />
      <div>
        <p className="mb-1 text-sm font-bold text-amber-800 dark:text-amber-300">Mode lecture seule</p>
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {READ_ONLY_MESSAGES[reason](expiredOn)}
          <button
            type="button"
            onClick={onRenew}
            className="ml-2 font-bold text-amber-800 underline dark:text-amber-300"
          >
            Renouveler mon abonnement
          </button>
        </p>
      </div>
    </div>
  </div>
);

// ===================================================================
// COMPOSANTS D'AFFICHAGE
// ===================================================================

const StatCard: React.FC<{ card: CardDef; onOpen: (href: string) => void }> = ({ card, onOpen }) => (
  <div
    role="button"
    tabIndex={0}
    onClick={() => onOpen(card.href)}
    onKeyDown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onOpen(card.href);
      }
    }}
    className="cursor-pointer rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition-all hover:scale-[1.02] hover:shadow-md active:scale-[0.98] dark:border-slate-700 dark:bg-slate-800"
  >
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{card.title}</p>
        <p className="mt-1 truncate text-2xl font-black text-slate-800 dark:text-slate-200">{card.value}</p>
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{card.subtitle}</p>
      </div>
      <div className={`shrink-0 rounded-xl p-3 ${card.iconClass}`}>{card.icon}</div>
    </div>
  </div>
);

const SkeletonGrid: React.FC = () => (
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {Array.from({ length: 5 }).map((_, i) => (
      <div
        key={i}
        className="h-28 animate-pulse rounded-2xl border border-slate-100 bg-slate-100 dark:border-slate-700 dark:bg-slate-800"
      />
    ))}
  </div>
);

// ===================================================================
// COMPOSANT PRINCIPAL
// ===================================================================

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, isSuperAdmin } = useAuthStore();

  // Branche active : même source que le reste de l'application (PharmacyContext),
  // avec repli sur la branche mémorisée (localStorage) puis sur celle de l'utilisateur.
  const { currentBranch, currentPharmacy, isLoading: isLoadingBranch } = usePharmacy();

  const branchId = useMemo((): string | null => {
    const u = user as { branch_id?: string | null; active_branch_id?: string | null; branch_name?: string } | null;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem('active_branch_id');
    } catch {
      stored = null;
    }
    return currentBranch?.id || stored || u?.active_branch_id || u?.branch_id || null;
  }, [currentBranch, user]);

  const branchName =
    currentBranch?.name || (user as { branch_name?: string } | null)?.branch_name || null;
  const isMainBranch = Boolean(currentBranch?.is_main_branch);
  const parentPharmacyName = currentPharmacy?.name || null;

  const {
    subscription,
    isLoading: isLoadingSubscription,
    isReadOnly,
    isExpired,
    isTrial,
    error: subscriptionError,
  } = useSubscription();

  const [period, setPeriod] = useState<Period>('today');

  // ---------- Redirections ----------
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login', { replace: true });
      return;
    }
    if (typeof isSuperAdmin === 'function' && isSuperAdmin()) {
      navigate('/super-admin', { replace: true });
    }
  }, [isAuthenticated, isSuperAdmin, navigate]);

  // ---------- Abonnement : vérifié AVANT d'afficher l'annonce ----------
  const isSuperAdminUser = (user as { role?: string } | null)?.role === 'super_admin';

  // Tant que la réponse de l'API abonnement n'est pas arrivée, on ne décide de rien.
  const subscriptionChecked =
    !isLoadingSubscription && (Boolean(subscription) || Boolean(subscriptionError));

  const showReadOnlyBanner = subscriptionChecked && isReadOnly && !isSuperAdminUser;

  const readOnlyReason = useMemo((): ReadOnlyReason => {
    if (!subscription) return 'none';
    const isTrialPlan = isTrial || subscription.plan_name?.toLowerCase() === 'trial';
    if (isTrialPlan && isExpired) return 'trial_ended';
    if (subscription.end_date && isExpired) return 'expired';
    return 'inactive';
  }, [subscription, isTrial, isExpired]);

  const expiredOn = formatLongDate(subscription?.end_date);

  // ---------- Données : une seule source, /api/v1/dashboard/currency-summary ----------
  const range = useMemo(() => getRange(period), [period]);

  const {
    data,
    isLoading: isLoadingData,
    isFetching,
    error: dataError,
    refetch,
  } = useQuery<CurrencySummaryResponse>({
    queryKey: ['dashboard', 'currency-summary', branchId ?? 'all', range.start, range.end],
    queryFn: () =>
      dashboardService.getCurrencySummary({
        branch_id: branchId ?? undefined,
        start_date: range.start,
        end_date: range.end,
      }),
    enabled: Boolean(isAuthenticated) && !isLoadingBranch,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  // Devises ayant réellement des données (une section de cartes par devise)
  const currencySections = useMemo(() => {
    if (!data?.by_currency) return [];
    return Object.entries(data.by_currency)
      .filter(([, bucket]) => hasData(bucket))
      .map(([currency, bucket]) => ({ currency, cards: buildCards(currency, bucket, period) }));
  }, [data, period]);

  const handleOpen = useCallback((href: string) => navigate(href), [navigate]);
  const handleRenew = useCallback(() => navigate('/subscription'), [navigate]);

  const showSkeleton = isLoadingBranch || (isLoadingData && !data);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 pb-10 transition-colors sm:px-6 lg:px-8">
      {/* Annonce : uniquement une fois l'abonnement vérifié */}
      {showReadOnlyBanner && (
        <ReadOnlyBanner reason={readOnlyReason} expiredOn={expiredOn} onRenew={handleRenew} />
      )}

      <ExpiryWarningBanner />

      {/* En-tête */}
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
        <div className="space-y-2">
          <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight text-slate-800 dark:text-slate-200 sm:text-3xl">
            <LayoutDashboard className="text-blue-600 dark:text-blue-400" size={28} />
            Tableau de bord
          </h1>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Building2 size={16} className="text-blue-500 dark:text-blue-400" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {branchName || (branchId ? 'Branche active' : 'Toutes les branches')}
              </p>
              {isMainBranch && (
                <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                  Principale
                </span>
              )}
            </div>
            {parentPharmacyName && (
              <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                {parentPharmacyName}
              </span>
            )}
          </div>
        </div>

        <div className="flex w-full items-center gap-3 sm:w-auto">
          <div className="flex rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800">
            {([
              ['today', "Aujourd'hui"],
              ['month', 'Ce mois'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setPeriod(key)}
                className={`rounded-lg px-3 py-1.5 text-sm font-bold transition-colors ${
                  period === key
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
          >
            <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />
            Actualiser
          </button>
        </div>
      </div>

      {/* Contenu */}
      {showSkeleton ? (
        <SkeletonGrid />
      ) : dataError && !data ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-800/50 dark:bg-red-900/20">
          <AlertTriangle size={32} className="mx-auto mb-2 text-red-500" />
          <p className="text-sm font-medium text-red-700 dark:text-red-300">{getErrorMessage(dataError)}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
          >
            Réessayer
          </button>
        </div>
      ) : currencySections.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-800">
          <LayoutDashboard size={40} className="mx-auto mb-3 text-slate-400" />
          <p className="text-slate-600 dark:text-slate-300">
            Aucune donnée {period === 'today' ? "aujourd'hui" : 'ce mois-ci'} pour cette branche.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {currencySections.map(({ currency, cards }) => (
            <section key={currency} className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-black text-white dark:bg-slate-200 dark:text-slate-900">
                  {currency}
                </span>
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
                  {CURRENCY_LABELS[currency] ?? currency}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {cards.map((card) => (
                  <StatCard key={card.id} card={card} onOpen={handleOpen} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
