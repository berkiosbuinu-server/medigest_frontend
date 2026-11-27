// modules/stats/dashboardUtils.ts
// Utilitaires partagés entre Dashboard et DashboardDetailScreen

export type Period = 'today' | 'month';
export type DetailType = 'sales' | 'expenses' | 'profit' | 'debts' | 'returns';

export const DETAIL_TYPES: DetailType[] = ['sales', 'expenses', 'profit', 'debts', 'returns'];

export function isDetailType(value: string | undefined): value is DetailType {
  return !!value && (DETAIL_TYPES as string[]).includes(value);
}

export function isPeriod(value: string | null | undefined): value is Period {
  return value === 'today' || value === 'month';
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  FC: 'FC',
  CDF: 'FC',
  USD: '$',
  EUR: '€',
  GNF: 'FG',
  XOF: 'FCFA',
};

export const CURRENCY_LABELS: Record<string, string> = {
  FC: 'Franc congolais',
  CDF: 'Franc congolais',
  USD: 'Dollar américain',
  EUR: 'Euro',
  GNF: 'Franc guinéen',
  XOF: 'Franc CFA',
};

const DECIMAL_CURRENCIES = new Set(['USD', 'EUR']);

export function formatAmount(value: number | null | undefined, currency: string): string {
  const decimals = DECIMAL_CURRENCIES.has(currency) ? 2 : 0;
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  const number = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
  return `${number} ${CURRENCY_SYMBOLS[currency] ?? currency}`;
}

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getRange(period: Period): { start: string; end: string } {
  const now = new Date();
  const end = toIsoDate(now);
  if (period === 'today') return { start: end, end };
  return { start: toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1)), end };
}

export function formatLongDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatShortDateTime(iso?: string | null, withTime = true): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

export function plural(n: number, singular: string, pluralForm: string): string {
  return `${n} ${n > 1 ? pluralForm : singular}`;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Erreur lors du chargement des données';
}

export const DETAIL_TITLES: Record<DetailType, (p: Period) => string> = {
  sales: (p) => (p === 'today' ? "Ventes d'aujourd'hui" : 'Ventes du mois'),
  expenses: (p) => (p === 'today' ? "Dépenses d'aujourd'hui" : 'Dépenses du mois'),
  profit: (p) => (p === 'today' ? "Bénéfices d'aujourd'hui" : 'Bénéfices du mois'),
  debts: (p) => (p === 'today' ? "Dettes d'aujourd'hui" : 'Dettes du mois'),
  returns: (p) => (p === 'today' ? "Retours d'aujourd'hui" : 'Retours du mois'),
};

const LABELS: Record<string, string> = {
  // paiement
  cash: 'Espèces',
  mobile_money: 'Mobile money',
  card: 'Carte',
  check: 'Chèque',
  bank_transfer: 'Virement',
  credit: 'Crédit',
  credit_note: 'Avoir',
  // statuts vente / dette / retour / dépense
  completed: 'Terminée',
  pending: 'En attente',
  partially_paid: 'Partiellement payée',
  paid: 'Payée',
  overdue: 'En retard',
  defaulted: 'Défaut de paiement',
  cancelled: 'Annulé',
  approved: 'Approuvé',
  rejected: 'Rejeté',
  processed: 'Traité',
  draft: 'Brouillon',
  refunded: 'Remboursée',
  // motifs de retour
  expired: 'Produit expiré',
  damaged: 'Produit endommagé',
  defective: 'Produit défectueux',
  wrong_product: 'Mauvais produit',
  wrong_quantity: 'Mauvaise quantité',
  customer_return: 'Retour client',
  quality_issue: 'Problème de qualité',
  recall: 'Rappel produit',
  other: 'Autre',
};

export function label(value?: string | null): string {
  if (!value) return '—';
  const key = String(value).toLowerCase();
  return LABELS[key] ?? value;
}
