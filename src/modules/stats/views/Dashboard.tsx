// modules/stats/views/Dashboard.tsx
/**
 * Tableau de bord
 * - Données : GET /api/v1/dashboard/currency-summary (une section de cartes par devise)
 * - Abonnement : GET /api/v1/dashboard/subscription-status (abonnement de la branche active)
 * - Clic sur une carte : ouvre DashboardDetailScreen (/dashboard/detail/:type)
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Building2,
  ChevronRight,
  CreditCard,
  LayoutDashboard,
  RefreshCw,
  RotateCcw,
  ShoppingBag,
  TrendingUp,
  Wallet,
} from 'lucide-react';

import { useAuthStore } from '@/store/useAuthStore';
import { ExpiryWarningBanner } from '@/components/ExpiryWarningBanner';
import dashboardService, {
  BranchSubscriptionReason,
  BranchSubscriptionStatus,
  CurrencyBucket,
  CurrencySummaryResponse,
} from '@/services/dashboardService';
import { useDashboardBranch } from '@/modules/stats/useDashboardBranch';
import {
  CURRENCY_LABELS,
  DetailType,
  Period,
  formatAmount,
  formatLongDate,
  getErrorMessage,
  getRange,
  plural,
} from '@/modules/stats/dashboardUtils';

// ===================================================================
// TYPES
// ===================================================================

interface CardDef {
  type: DetailType;
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactElement;
  iconClass: string;
}

// ===================================================================
// UTILITAIRES
// ===================================================================

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

function buildCards(currency: string, b: CurrencyBucket, period: Period): CardDef[] {
  const margin = b.revenue > 0 ? Math.round((b.profit / b.revenue) * 1000) / 10 : null;

  return [
    {
      type: 'sales',
      title: period === 'today' ? "Ventes d'aujourd'hui" : 'Ventes du mois',
      value: formatAmount(b.sales_amount, currency),
      subtitle: plural(b.sales_count, 'vente', 'ventes'),
      icon: <ShoppingBag size={20} />,
      iconClass: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    },
    {
      type: 'expenses',
      title: 'Dépenses',
      value: formatAmount(b.expenses_amount, currency),
      subtitle: plural(b.expenses_count, 'dépense', 'dépenses'),
      icon: <Wallet size={20} />,
      iconClass: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
    },
    {
      type: 'profit',
      title: 'Bénéfices',
      value: formatAmount(b.profit, currency),
      subtitle: margin !== null ? `Marge ${margin}%` : 'Aucune marge calculable',
      icon: <TrendingUp size={20} />,
      iconClass: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
    },
    {
      type: 'debts',
      title: 'Dettes',
      value: formatAmount(b.debts_amount, currency),
      subtitle: `${plural(b.debts_count, 'dette', 'dettes')} (solde restant)`,
      icon: <CreditCard size={20} />,
      iconClass: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
    },
    {
      type: 'returns',
      title: 'Retours',
      value: formatAmount(b.returns_amount, currency),
      subtitle: plural(b.returns_count, 'retour', 'retours'),
      icon: <RotateCcw size={20} />,
      iconClass: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
    },
  ];
}

// ===================================================================
// ANNONCE « MODE LECTURE SEULE »
// ===================================================================

const READ_ONLY_MESSAGES: Record<
  NonNullable<BranchSubscriptionReason>,
  (expiredOn: string | null) => string
> = {
  expired: (date) =>
    `L'abonnement de cette branche a expiré${date ? ` le ${date}` : ''}. Vous ne pouvez pas modifier les données.`,
  trial_ended: () =>
    "La période d'essai de cette branche est terminée. Vous ne pouvez pas modifier les données.",
  suspended: () =>
    "L'abonnement de cette branche est suspendu. Vous ne pouvez pas modifier les données.",
  cancelled: () =>
    "L'abonnement de cette branche a été annulé. Vous ne pouvez pas modifier les données.",
  none: () =>
    "Aucun abonnement n'est actif pour cette branche. Vous ne pouvez pas modifier les données.",
};

const ReadOnlyBanner: React.FC<{
  status: BranchSubscriptionStatus;
  onRenew: () => void;
}> = ({ status, onRenew }) => {
  const reason = status.reason ?? 'none';
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800/50 dark:bg-amber-900/20">
      <div className="flex items-start gap-3">
        <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-500" />
        <div>
          <p className="mb-1 text-sm font-bold text-amber-800 dark:text-amber-300">Mode lecture seule</p>
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {READ_ONLY_MESSAGES[reason](formatLongDate(status.end_date))}
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
};

// ===================================================================
// COMPOSANTS D'AFFICHAGE
// ===================================================================

const StatCard: React.FC<{ card: CardDef; onOpen: (type: DetailType) => void }> = ({ card, onOpen }) => (
  <div
    role="button"
    tabIndex={0}
    onClick={() => onOpen(card.type)}
    onKeyDown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onOpen(card.type);
      }
    }}
    className="group cursor-pointer rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition-all hover:scale-[1.02] hover:shadow-md active:scale-[0.98] dark:border-slate-700 dark:bg-slate-800"
  >
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{card.title}</p>
        <p className="mt-1 truncate text-2xl font-black text-slate-800 dark:text-slate-200">{card.value}</p>
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{card.subtitle}</p>
      </div>
      <div className={`shrink-0 rounded-xl p-3 ${card.iconClass}`}>{card.icon}</div>
    </div>
    <div className="mt-3 flex items-center justify-end text-xs font-bold text-blue-600 opacity-70 transition-opacity group-hover:opacity-100 dark:text-blue-400">
      Voir le détail <ChevronRight size={14} />
    </div>
  </div>
);

const SkeletonGrid: React.FC = () => (
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {Array.from({ length: 5 }).map((_, i) => (
      <div
        key={i}
        className="h-32 animate-pulse rounded-2xl border border-slate-100 bg-slate-100 dark:border-slate-700 dark:bg-slate-800"
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
  const { branchId, branchName, isMainBranch, parentPharmacyName, isLoading: isLoadingBranch } =
    useDashboardBranch();

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

  // ---------- Abonnement de la branche active (vérifié avant d'afficher l'annonce) ----------
  const isSuperAdminUser = (user as { role?: string } | null)?.role === 'super_admin';

  const { data: subscriptionStatus, refetch: refetchSubscription } = useQuery<BranchSubscriptionStatus>({
    queryKey: ['dashboard', 'subscription-status', branchId ?? 'none'],
    queryFn: () => dashboardService.getBranchSubscriptionStatus(branchId ?? undefined),
    enabled: Boolean(isAuthenticated) && !isLoadingBranch && !isSuperAdminUser,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  // Pas de réponse (chargement ou erreur) => aucune annonce : on n'affirme jamais un état non vérifié.
  const showReadOnlyBanner = Boolean(
    subscriptionStatus && subscriptionStatus.applicable && !subscriptionStatus.is_active,
  );

  // ---------- Données ----------
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

  // Devises ayant réellement des données
  const currencySections = useMemo(() => {
    if (!data?.by_currency) return [];
    return Object.entries(data.by_currency)
      .filter(([, bucket]) => hasData(bucket))
      .map(([currency, bucket]) => ({ currency, cards: buildCards(currency, bucket, period) }));
  }, [data, period]);

  const handleOpen = useCallback(
    (type: DetailType, currency: string) =>
      navigate(`/dashboard/detail/${type}?currency=${encodeURIComponent(currency)}&period=${period}`),
    [navigate, period],
  );
  const handleRenew = useCallback(() => navigate('/subscription'), [navigate]);
  const handleRefresh = useCallback(() => {
    void refetch();
    void refetchSubscription();
  }, [refetch, refetchSubscription]);

  const showSkeleton = isLoadingBranch || (isLoadingData && !data);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 pb-10 transition-colors sm:px-6 lg:px-8">
      {showReadOnlyBanner && subscriptionStatus && (
        <ReadOnlyBanner status={subscriptionStatus} onRenew={handleRenew} />
      )}

      <ExpiryWarningBanner />

      {/* En-tête */}
      <div className="flex flex-col items-start justify-between gap-4 lg:flex-row lg:items-end">
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

        {/* Période + actualiser : boutons bien séparés */}
        <div className="flex w-full flex-wrap items-center gap-3 lg:w-auto">
          <div className="flex items-center gap-3">
            {([
              ['today', "Aujourd'hui"],
              ['month', 'Ce mois'],
            ] as const).map(([key, text]) => (
              <button
                key={key}
                type="button"
                onClick={() => setPeriod(key)}
                aria-pressed={period === key}
                className={`rounded-xl border px-5 py-2 text-sm font-bold transition-colors ${
                  period === key
                    ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {text}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleRefresh}
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
                  <StatCard key={card.type} card={card} onOpen={(type) => handleOpen(type, currency)} />
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
