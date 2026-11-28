// utils/formatters.ts
export const formatPrice = (price: number): string => {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'GNF',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(price).replace('GNF', 'FG');
};

export const formatDate = (date: string | Date): string => {
  return new Date(date).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

export const formatDateTime = (date: string | Date): string => {
  return new Date(date).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const formatQuantity = (quantity: number): string => {
  return new Intl.NumberFormat('fr-FR').format(quantity);
};

// ---------------------------------------------------------------------------
// Devises par produit (le serveur stocke la devise de chaque produit)
// ---------------------------------------------------------------------------
export const PRODUCT_CURRENCIES = ['FC', 'CDF', 'USD', 'EUR'] as const;
export type ProductCurrency = (typeof PRODUCT_CURRENCIES)[number];
export const DEFAULT_PRODUCT_CURRENCY: ProductCurrency = 'FC';

const CURRENCY_SYMBOL: Record<string, string> = { FC: 'FC', CDF: 'FC', USD: '$', EUR: '€' };
const CURRENCY_LABEL: Record<string, string> = {
  FC: 'FC – Franc congolais',
  CDF: 'CDF – Franc congolais',
  USD: 'USD – Dollar US',
  EUR: 'EUR – Euro',
};
export const currencyLabel = (code: string): string => CURRENCY_LABEL[code] ?? code;

/** Ramène un code quelconque à une devise supportée par le serveur (défaut : FC). */
export const normalizeCurrency = (code?: string | null): ProductCurrency => {
  const c = String(code ?? '').trim().toUpperCase();
  return (PRODUCT_CURRENCIES as readonly string[]).includes(c) ? (c as ProductCurrency) : DEFAULT_PRODUCT_CURRENCY;
};

/** Formate un montant dans la devise donnée : 12 500 FC, $12.50, 12,50 €. */
export const formatMoney = (amount: number | string | null | undefined, currency?: string | null): string => {
  const code = normalizeCurrency(currency);
  const n = Number(amount ?? 0);
  const value = Number.isFinite(n) ? n : 0;
  const symbol = CURRENCY_SYMBOL[code];
  if (code === 'USD') {
    return `${symbol}${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (code === 'EUR') {
    return `${value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${symbol}`;
  }
  return `${Math.round(value).toLocaleString('fr-FR')} ${symbol}`;
};
