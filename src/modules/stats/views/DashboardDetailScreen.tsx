// modules/stats/views/DashboardDetailScreen.tsx
/**
 * Détail d'une carte du dashboard pour une devise et une période.
 * Route : /dashboard/detail/:type?currency=FC&period=today|month
 *   type = sales | expenses | profit | debts | returns
 * Source : GET /api/v1/dashboard/currency-detail
 */

import React, { useCallback, useMemo } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CreditCard,
  Inbox,
  RefreshCw,
  RotateCcw,
  ShoppingBag,
  TrendingUp,
  Wallet,
} from 'lucide-react';

import { useAuthStore } from '@/store/useAuthStore';
import dashboardService, { CurrencyDetailResponse } from '@/services/dashboardService';
import { useDashboardBranch } from '@/modules/stats/useDashboardBranch';
import {
  CURRENCY_LABELS,
  DETAIL_TITLES,
  DetailType,
  Period,
  formatAmount,
  formatShortDateTime,
  getErrorMessage,
  getRange,
  isDetailType,
  isPeriod,
  label,
  plural,
} from '@/modules/stats/dashboardUtils';

// ===================================================================
// CONFIGURATION PAR TYPE
// ===================================================================

type Row = Record<string, any>;

interface Column {
  key: string;
  header: string;
  align?: 'left' | 'right';
  render: (row: Row, currency: string) => React.ReactNode;
}

interface SummaryCard {
  title: string;
  value: string;
  subtitle?: string;
}

interface TypeConfig {
  icon: React.ReactElement;
  iconClass: string;
  emptyText: string;
  summary: (d: CurrencyDetailResponse, currency: string) => SummaryCard[];
  columns: Column[];
  rowKey: (row: Row, index: number) => string;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

const Muted: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="text-slate-400 dark:text-slate-500">{children}</span>
);

const Badge: React.FC<{ children: React.ReactNode; tone?: 'slate' | 'amber' | 'red' | 'green' }> = ({
  children,
  tone = 'slate',
}) => {
  const tones = {
    slate: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    red: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${tones[tone]}`}>{children}</span>
  );
};

const statusTone = (status?: string | null): 'slate' | 'amber' | 'red' | 'green' => {
  const s = (status || '').toLowerCase();
  if (['paid', 'completed', 'approved', 'processed'].includes(s)) return 'green';
  if (['overdue', 'defaulted', 'rejected', 'cancelled'].includes(s)) return 'red';
  if (['pending', 'partially_paid'].includes(s)) return 'amber';
  return 'slate';
};

const CONFIG: Record<DetailType, TypeConfig> = {
  sales: {
    icon: <ShoppingBag size={22} />,
    iconClass: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    emptyText: 'Aucune vente pour cette période.',
    summary: (d, c) => [
      { title: 'Total des ventes', value: formatAmount(num(d.summary.total), c) },
      { title: 'Nombre de ventes', value: String(num(d.summary.count)) },
      { title: 'Panier moyen', value: formatAmount(num(d.summary.average), c) },
    ],
    rowKey: (r, i) => r.id ?? String(i),
    columns: [
      { key: 'date', header: 'Date', render: (r) => formatShortDateTime(r.date) },
      { key: 'reference', header: 'Référence', render: (r) => <span className="font-mono text-xs">{r.reference ?? '—'}</span> },
      { key: 'customer', header: 'Client', render: (r) => r.customer || <Muted>—</Muted> },
      { key: 'seller', header: 'Vendeur', render: (r) => r.seller || <Muted>—</Muted> },
      { key: 'payment', header: 'Paiement', render: (r) => label(r.payment_method) },
      {
        key: 'amount',
        header: 'Montant',
        align: 'right',
        render: (r, c) => (
          <div>
            <span className="font-bold">{formatAmount(num(r.amount), c)}</span>
            {r.is_credit && num(r.remaining) > 0 && (
              <div className="mt-0.5">
                <Badge tone="amber">Reste {formatAmount(num(r.remaining), c)}</Badge>
              </div>
            )}
          </div>
        ),
      },
    ],
  },

  expenses: {
    icon: <Wallet size={22} />,
    iconClass: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
    emptyText: 'Aucune dépense pour cette période.',
    summary: (d, c) => [
      { title: 'Total des dépenses', value: formatAmount(num(d.summary.total), c) },
      { title: 'Nombre de dépenses', value: String(num(d.summary.count)) },
    ],
    rowKey: (r, i) => r.id ?? String(i),
    columns: [
      { key: 'date', header: 'Date', render: (r) => formatShortDateTime(r.date, false) },
      { key: 'category', header: 'Catégorie', render: (r) => r.category || <Muted>—</Muted> },
      { key: 'description', header: 'Description', render: (r) => r.description || <Muted>—</Muted> },
      { key: 'payee', header: 'Bénéficiaire', render: (r) => r.payee || <Muted>—</Muted> },
      { key: 'payment', header: 'Paiement', render: (r) => label(r.payment_method) },
      {
        key: 'amount',
        header: 'Montant',
        align: 'right',
        render: (r, c) => <span className="font-bold">{formatAmount(num(r.amount), c)}</span>,
      },
    ],
  },

  profit: {
    icon: <TrendingUp size={22} />,
    iconClass: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
    emptyText: 'Aucun bénéfice calculable pour cette période.',
    summary: (d, c) => [
      { title: 'Bénéfice', value: formatAmount(num(d.summary.total), c) },
      { title: "Chiffre d'affaires", value: formatAmount(num(d.summary.revenue), c) },
      { title: "Coût d'achat", value: formatAmount(num(d.summary.cost), c) },
      {
        title: 'Marge',
        value: d.summary.margin === null || d.summary.margin === undefined ? '—' : `${d.summary.margin}%`,
      },
    ],
    rowKey: (r, i) => `${r.product}-${i}`,
    columns: [
      { key: 'product', header: 'Produit', render: (r) => <span className="font-medium">{r.product}</span> },
      { key: 'quantity', header: 'Qté vendue', align: 'right', render: (r) => num(r.quantity) },
      { key: 'revenue', header: "Chiffre d'affaires", align: 'right', render: (r, c) => formatAmount(num(r.revenue), c) },
      { key: 'cost', header: 'Coût', align: 'right', render: (r, c) => formatAmount(num(r.cost), c) },
      {
        key: 'profit',
        header: 'Bénéfice',
        align: 'right',
        render: (r, c) => (
          <span className={`font-bold ${num(r.profit) < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
            {formatAmount(num(r.profit), c)}
          </span>
        ),
      },
    ],
  },

  debts: {
    icon: <CreditCard size={22} />,
    iconClass: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
    emptyText: 'Aucune dette pour cette période.',
    summary: (d, c) => [
      { title: 'Solde restant dû', value: formatAmount(num(d.summary.total), c) },
      { title: 'Nombre de dettes', value: String(num(d.summary.count)) },
    ],
    rowKey: (r, i) => r.id ?? String(i),
    columns: [
      { key: 'customer', header: 'Client', render: (r) => <span className="font-medium">{r.customer || '—'}</span> },
      { key: 'issue', header: 'Émise le', render: (r) => formatShortDateTime(r.issue_date, false) },
      { key: 'due', header: 'Échéance', render: (r) => formatShortDateTime(r.due_date, false) },
      { key: 'status', header: 'Statut', render: (r) => <Badge tone={statusTone(r.status)}>{label(r.status)}</Badge> },
      { key: 'initial', header: 'Montant initial', align: 'right', render: (r, c) => formatAmount(num(r.initial_amount), c) },
      { key: 'paid', header: 'Payé', align: 'right', render: (r, c) => formatAmount(num(r.paid_amount), c) },
      {
        key: 'remaining',
        header: 'Reste',
        align: 'right',
        render: (r, c) => <span className="font-bold">{formatAmount(num(r.amount), c)}</span>,
      },
    ],
  },

  returns: {
    icon: <RotateCcw size={22} />,
    iconClass: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
    emptyText: 'Aucun retour pour cette période.',
    summary: (d, c) => [
      { title: 'Total remboursé', value: formatAmount(num(d.summary.total), c) },
      { title: 'Nombre de retours', value: String(num(d.summary.count)) },
    ],
    rowKey: (r, i) => r.id ?? String(i),
    columns: [
      { key: 'date', header: 'Date', render: (r) => formatShortDateTime(r.date) },
      { key: 'number', header: 'N° retour', render: (r) => <span className="font-mono text-xs">{r.number ?? '—'}</span> },
      { key: 'customer', header: 'Client', render: (r) => r.customer || <Muted>—</Muted> },
      { key: 'reason', header: 'Motif', render: (r) => label(r.reason) },
      { key: 'status', header: 'Statut', render: (r) => <Badge tone={statusTone(r.status)}>{label(r.status)}</Badge> },
      {
        key: 'amount',
        header: 'Remboursé',
        align: 'right',
        render: (r, c) => <span className="font-bold">{formatAmount(num(r.amount), c)}</span>,
      },
    ],
  },
};

// ===================================================================
// COMPOSANT
// ===================================================================

const DashboardDetailScreen: React.FC = () => {
  const navigate = useNavigate();
  const { type: typeParam } = useParams<{ type: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAuthenticated } = useAuthStore();
  const { branchId, branchName, parentPharmacyName, isLoading: isLoadingBranch } = useDashboardBranch();

  const currency = (searchParams.get('currency') || 'FC').toUpperCase();
  const periodParam = searchParams.get('period');
  const period: Period = isPeriod(periodParam) ? periodParam : 'today';
  const type = isDetailType(typeParam) ? typeParam : null;

  const range = useMemo(() => getRange(period), [period]);

  const { data, isLoading, isFetching, error, refetch } = useQuery<CurrencyDetailResponse>({
    queryKey: ['dashboard', 'currency-detail', type, currency, branchId ?? 'all', range.start, range.end],
    queryFn: () =>
      dashboardService.getCurrencyDetail({
        type: type as DetailType,
        currency,
        branch_id: branchId ?? undefined,
        start_date: range.start,
        end_date: range.end,
      }),
    enabled: Boolean(isAuthenticated && type) && !isLoadingBranch,
    staleTime: 30_000,
  });

  const goBack = useCallback(() => navigate('/dashboard'), [navigate]);
  const changePeriod = useCallback(
    (p: Period) => {
      const next = new URLSearchParams(searchParams);
      next.set('period', p);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  if (!type) return <Navigate to="/dashboard" replace />;

  const cfg = CONFIG[type];
  const title = DETAIL_TITLES[type](period);
  const items = data?.items ?? [];
  const summary = data ? cfg.summary(data, currency) : [];
  const showSkeleton = isLoadingBranch || (isLoading && !data);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 pb-10 transition-colors sm:px-6 lg:px-8">
      {/* En-tête */}
      <div className="space-y-4">
        <button
          type="button"
          onClick={goBack}
          className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400"
        >
          <ArrowLeft size={16} /> Retour au tableau de bord
        </button>

        <div className="flex flex-col items-start justify-between gap-4 lg:flex-row lg:items-end">
          <div className="flex items-start gap-3">
            <div className={`rounded-xl p-3 ${cfg.iconClass}`}>{cfg.icon}</div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-800 dark:text-slate-200 sm:text-3xl">
                {title}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <span className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-black text-white dark:bg-slate-200 dark:text-slate-900">
                  {currency}
                </span>
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  {CURRENCY_LABELS[currency] ?? currency}
                </span>
                <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                  <Building2 size={15} className="text-blue-500" />
                  {branchName || (branchId ? 'Branche active' : 'Toutes les branches')}
                  {parentPharmacyName ? ` · ${parentPharmacyName}` : ''}
                </span>
              </div>
            </div>
          </div>

          <div className="flex w-full flex-wrap items-center gap-3 lg:w-auto">
            <div className="flex items-center gap-3">
              {([
                ['today', "Aujourd'hui"],
                ['month', 'Ce mois'],
              ] as const).map(([key, text]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => changePeriod(key)}
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
              onClick={() => refetch()}
              disabled={isFetching}
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
            >
              <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />
              Actualiser
            </button>
          </div>
        </div>
      </div>

      {/* Contenu */}
      {showSkeleton ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
            ))}
          </div>
          <div className="h-64 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
        </div>
      ) : error && !data ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-800/50 dark:bg-red-900/20">
          <AlertTriangle size={32} className="mx-auto mb-2 text-red-500" />
          <p className="text-sm font-medium text-red-700 dark:text-red-300">{getErrorMessage(error)}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
          >
            Réessayer
          </button>
        </div>
      ) : (
        <>
          {/* Résumé */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {summary.map((c) => (
              <div
                key={c.title}
                className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{c.title}</p>
                <p className="mt-1 truncate text-2xl font-black text-slate-800 dark:text-slate-200">{c.value}</p>
                {c.subtitle && <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{c.subtitle}</p>}
              </div>
            ))}
          </div>

          {/* Liste */}
          <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-slate-700">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-800 dark:text-slate-200">
                Détail
              </h2>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {plural(items.length, 'ligne', 'lignes')}
                {num(data?.summary.count) > items.length && type !== 'profit'
                  ? ` affichées sur ${num(data?.summary.count)}`
                  : ''}
              </span>
            </div>

            {items.length === 0 ? (
              <div className="p-10 text-center">
                <Inbox size={40} className="mx-auto mb-3 text-slate-400" />
                <p className="text-slate-600 dark:text-slate-300">{cfg.emptyText}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-700/50 dark:text-slate-400">
                    <tr>
                      {cfg.columns.map((col) => (
                        <th
                          key={col.key}
                          className={`px-5 py-3 font-bold ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                        >
                          {col.header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700 dark:divide-slate-700 dark:text-slate-200">
                    {items.map((row, i) => (
                      <tr key={cfg.rowKey(row, i)} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                        {cfg.columns.map((col) => (
                          <td
                            key={col.key}
                            className={`px-5 py-3 align-top ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                          >
                            {col.render(row, currency)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default DashboardDetailScreen;
