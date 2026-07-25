// DashboardV3.tsx
/**
 * ===================================================================
 * DASHBOARD V3 - Tableau de bord ultra-optimisé
 * Utilise les nouveaux endpoints REST V3
 * Support: 2M+ données, temps réponse <50ms
 * Mai 2026
 * ===================================================================
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useNavigate } from 'react-router-dom';
import { useActiveBranch } from '@/hooks/useActiveBranch';
import {
  ShoppingBag,
  TrendingUp,
  RefreshCw,
  ArrowRight,
  Package,
  Clock,
  Calendar,
  X,
  LayoutDashboard,
  FileText,
  Printer,
  Building2,
  CheckCircle,
  AlertTriangle,
  Receipt,
  Users,
} from 'lucide-react';

import { ExpiryWarningBanner } from '@/components/ExpiryWarningBanner';
import { formatCurrency } from '@/utils/formatters';
import { generateDashboardPDF, PDFData } from '@/utils/pdfGenerator';
import { useTimezone } from '@/hooks/useTimezone';
import { withWritePermission } from '@/hoc/withWritingPermission';
import dashboardServiceV3, {
  DashboardStatsV3,
  DashboardAlertV3,
  SalesHistoryResponseV3,
  PerformanceMetricsV3,
  LowStockResponseV3,
} from '@/services/DashboardServiceV3';

// ===================================================================
// TYPES ET INTERFACES
// ===================================================================

type DetailModalType =
  | 'sales'
  | 'profits'
  | 'stock'
  | 'alerts'
  | 'expiry'
  | 'expenses'
  | 'debts'
  | 'purchases'
  | 'transactions'
  | 'performance';

interface DetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  data: unknown;
  type: DetailModalType;
  onExportPDF: () => void;
  userName?: string;
  branchName?: string;
  branchAddress?: string;
  branchPhone?: string;
  branchEmail?: string;
}

interface DashboardCard {
  id: string;
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ReactElement;
  iconBgColor: string;
  onClick: () => void;
}

// Statistiques étendues pour l'affichage
interface ExtendedDashboardStats {
  // Ventes
  daily_sales: number;
  monthly_sales: number;
  sales_trend: number;
  daily_transactions: number;
  monthly_transactions: number;
  average_basket: number;
  
  // Stock
  total_products: number;
  total_quantity: number;
  total_stock_value: number;
  out_of_stock: number;
  low_stock: number;
  expired: number;
  expiring_soon: number;
  
  // Profit
  net_profit: number;
  daily_profit: number;
  profit_margin: number;
  
  // Clients
  total_customers: number;
  new_customers: number;
  
  // Dépenses
  monthly_expenses: number;
  daily_expenses: number;
  
  // Dettes
  monthly_debts: number;
  total_debts: number;
  unpaid_debts: number;
  recovery_rate: number;
  
  // Achats
  monthly_purchases: number;
  daily_purchases: number;
  suppliers_count: number;
  pending_orders: number;
  
  // Autres
  active_users: number;
  stock_turnover: number;
}

// ===================================================================
// CONSTANTES ET UTILITAIRES
// ===================================================================

const EMPTY_STATS: ExtendedDashboardStats = {
  daily_sales: 0,
  monthly_sales: 0,
  sales_trend: 0,
  daily_transactions: 0,
  monthly_transactions: 0,
  average_basket: 0,
  total_products: 0,
  total_quantity: 0,
  total_stock_value: 0,
  out_of_stock: 0,
  low_stock: 0,
  expired: 0,
  expiring_soon: 0,
  net_profit: 0,
  daily_profit: 0,
  profit_margin: 0,
  total_customers: 0,
  new_customers: 0,
  monthly_expenses: 0,
  daily_expenses: 0,
  monthly_debts: 0,
  total_debts: 0,
  unpaid_debts: 0,
  recovery_rate: 0,
  monthly_purchases: 0,
  daily_purchases: 0,
  suppliers_count: 0,
  pending_orders: 0,
  active_users: 0,
  stock_turnover: 0,
};

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeStatsV3(stats: DashboardStatsV3 | null): ExtendedDashboardStats {
  if (!stats || !stats.success) return EMPTY_STATS;

  const { data } = stats;
  
  return {
    // Ventes
    daily_sales: data.sales.revenue,
    monthly_sales: data.sales.revenue,
    sales_trend: 0,
    daily_transactions: data.sales.count,
    monthly_transactions: data.sales.count,
    average_basket: data.sales.average_basket,
    
    // Stock
    total_products: data.inventory.total_products,
    total_quantity: data.inventory.total_quantity,
    total_stock_value: data.inventory.stock_value,
    out_of_stock: data.inventory.out_of_stock,
    low_stock: data.inventory.low_stock,
    expired: data.inventory.expired || 0,
    expiring_soon: 0,
    
    // Profit
    net_profit: data.profit.total,
    daily_profit: data.profit.total / 30,
    profit_margin: data.profit.margin,
    
    // Clients
    total_customers: data.customers.total,
    new_customers: data.customers.new,
    
    // Dépenses
    monthly_expenses: data.expenses?.total || 0,
    daily_expenses: (data.expenses?.total || 0) / 30,
    
    // Dettes
    monthly_debts: 0,
    total_debts: 0,
    unpaid_debts: 0,
    recovery_rate: 0,
    
    // Achats
    monthly_purchases: 0,
    daily_purchases: 0,
    suppliers_count: 0,
    pending_orders: 0,
    
    // Autres
    active_users: 0,
    stock_turnover: 0,
  };
}

function getErrorMessage(error: unknown, fallback = 'Erreur lors du chargement des données'): string {
  if (isObject(error)) {
    const response = error.response;
    if (isObject(response)) {
      const data = response.data;
      if (isObject(data)) {
        const detail = data.detail;
        if (typeof detail === 'string' && detail.trim()) return detail;
        if (typeof data.message === 'string' && data.message.trim()) return data.message;
      }
    }
    if (typeof error.message === 'string' && error.message.trim()) return error.message;
  }

  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

// ===================================================================
// COMPOSANTS DE MODAL
// ===================================================================

const DetailModal: React.FC<DetailModalProps> = React.memo(({
  isOpen,
  onClose,
  title,
  data,
  type,
  onExportPDF,
  userName,
  branchName,
  branchAddress,
  branchPhone,
  branchEmail,
}) => {
  const renderContent = useCallback((): React.ReactNode => {
    if (!data) {
      return (
        <div className="py-12 text-center">
          <FileText size={48} className="mx-auto mb-4 text-slate-400 opacity-50" />
          <p className="text-slate-500 dark:text-slate-400">Aucune donnée disponible</p>
        </div>
      );
    }

    const DetailCard: React.FC<{
      title: string;
      value: string | number;
      subtitle: string;
      icon: React.ReactElement;
      color: string;
    }> = ({ title: cardTitle, value, subtitle, icon, color }) => {
      const colorClasses: Record<string, string> = {
        blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
        indigo: 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400',
        purple: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
        emerald: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400',
        amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
        red: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
        orange: 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400',
        cyan: 'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400',
        yellow: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400',
        slate: 'bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-400',
      };

      return (
        <div className="rounded-xl border border-slate-100 p-4 dark:border-slate-700">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{cardTitle}</p>
              <p className="mt-1 text-2xl font-black text-slate-800 dark:text-slate-200">{value}</p>
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{subtitle}</p>
            </div>
            <div className={`rounded-xl p-2 ${colorClasses[color] || colorClasses.slate}`}>
              {icon}
            </div>
          </div>
        </div>
      );
    };

    switch (type) {
      case 'performance': {
        const perfData = data as PerformanceMetricsV3;
        if (perfData.success) {
          return (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <DetailCard
                  title="Croissance CA"
                  value={`${perfData.metrics.revenue.growth}%`}
                  subtitle={`${formatCurrency(perfData.metrics.revenue.current)}`}
                  icon={<TrendingUp size={20} />}
                  color="emerald"
                />
                <DetailCard
                  title="Croissance transactions"
                  value={`${perfData.metrics.transactions.growth}%`}
                  subtitle={`${perfData.metrics.transactions.current} ventes`}
                  icon={<ShoppingBag size={20} />}
                  color="blue"
                />
                <DetailCard
                  title="Panier moyen"
                  value={formatCurrency(perfData.metrics.efficiency.average_basket)}
                  subtitle="par transaction"
                  icon={<Receipt size={20} />}
                  color="purple"
                />
                <DetailCard
                  title="Taux rupture"
                  value={`${perfData.metrics.inventory.out_of_stock_rate}%`}
                  subtitle="produits indisponibles"
                  icon={<AlertTriangle size={20} />}
                  color="red"
                />
              </div>
            </div>
          );
        }
        break;
      }

      case 'sales': {
        const salesData = data as SalesHistoryResponseV3;
        if (salesData.success) {
          return (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <DetailCard
                  title="Chiffre d'affaires"
                  value={formatCurrency(salesData.summary.total_revenue)}
                  subtitle={`${salesData.summary.total_sales} ventes`}
                  icon={<ShoppingBag size={20} />}
                  color="blue"
                />
                <DetailCard
                  title="Moyenne journalière"
                  value={formatCurrency(salesData.summary.average_daily_revenue)}
                  subtitle="sur la période"
                  icon={<Calendar size={20} />}
                  color="indigo"
                />
                <DetailCard
                  title="Tendance"
                  value={`${salesData.summary.trend.percentage}%`}
                  subtitle={salesData.summary.trend.direction === 'up' ? 'En hausse' : 'En baisse'}
                  icon={<TrendingUp size={20} />}
                  color="emerald"
                />
                <DetailCard
                  title="Période"
                  value={`${salesData.period.days} jours`}
                  subtitle={`du ${salesData.period.start_date} au ${salesData.period.end_date}`}
                  icon={<Clock size={20} />}
                  color="purple"
                />
              </div>

              {salesData.history.length > 0 && (
                <div>
                  <h4 className="mb-3 text-sm font-bold dark:text-slate-300">Historique des ventes</h4>
                  <div className="max-h-64 space-y-2 overflow-y-auto">
                    {salesData.history.slice(-10).map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 dark:bg-slate-700/50">
                        <div>
                          <p className="text-sm font-medium dark:text-slate-200">{item.date}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{item.sales_count} transaction(s)</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(item.total_revenue)}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Moy: {formatCurrency(item.average_basket)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        }
        break;
      }

      case 'stock': {
        const stockData = data as LowStockResponseV3;
        if (stockData.success) {
          return (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <DetailCard
                  title="Produits critiques"
                  value={stockData.critical_count}
                  subtitle="à réapprovisionner"
                  icon={<AlertTriangle size={20} />}
                  color="red"
                />
                <DetailCard
                  title="Total produits"
                  value={stockData.total}
                  subtitle="en stock bas"
                  icon={<Package size={20} />}
                  color="amber"
                />
              </div>

              {stockData.products.length > 0 && (
                <div>
                  <h4 className="mb-3 text-sm font-bold dark:text-slate-300">Produits en stock bas</h4>
                  <div className="space-y-2">
                    {stockData.products.slice(0, 10).map((product) => (
                      <div key={product.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 dark:bg-slate-700/50">
                        <div>
                          <p className="text-sm font-medium dark:text-slate-200">{product.name}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{product.code}</p>
                        </div>
                        <div className="text-right">
                          <p className={`font-bold ${product.severity === 'critical' ? 'text-red-600' : 'text-amber-600'}`}>
                            Stock: {product.current_stock} / {product.threshold}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{formatCurrency(product.stock_value)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        }
        break;
      }

      case 'alerts': {
        const alertsData = data as { alerts: DashboardAlertV3[] };
        if (alertsData.alerts && alertsData.alerts.length > 0) {
          return (
            <div className="space-y-3">
              {alertsData.alerts.map((alert, idx) => (
                <div
                  key={alert.id || idx}
                  className={`rounded-xl border-l-4 p-4 ${
                    alert.severity === 'critical'
                      ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                      : alert.severity === 'warning'
                      ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                      : 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-bold dark:text-slate-200">{alert.title}</p>
                      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{alert.message}</p>
                      {alert.product_name && (
                        <p className="mt-2 text-xs text-slate-500">Produit: {alert.product_name}</p>
                      )}
                      {alert.days_left !== undefined && (
                        <p className="text-xs text-slate-500">Jours restants: {alert.days_left}</p>
                      )}
                    </div>
                    <AlertTriangle
                      size={20}
                      className={alert.severity === 'critical' ? 'text-red-500' : 'text-amber-500'}
                    />
                  </div>
                </div>
              ))}
            </div>
          );
        }
        return (
          <div className="py-12 text-center">
            <CheckCircle size={48} className="mx-auto mb-4 text-green-500" />
            <p className="text-slate-500 dark:text-slate-400">Aucune alerte à afficher</p>
          </div>
        );
      }

      default: {
        const statsObj = normalizeStatsV3(data as DashboardStatsV3);
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <DetailCard
                title="Ventes"
                value={formatCurrency(statsObj.daily_sales)}
                subtitle={`${statsObj.daily_transactions} transactions`}
                icon={<ShoppingBag size={20} />}
                color="blue"
              />
              <DetailCard
                title="Stock"
                value={formatCurrency(statsObj.total_stock_value)}
                subtitle={`${statsObj.total_products} produits`}
                icon={<Package size={20} />}
                color="purple"
              />
              <DetailCard
                title="Marge"
                value={`${statsObj.profit_margin}%`}
                subtitle="bénéfice net"
                icon={<TrendingUp size={20} />}
                color="emerald"
              />
              <DetailCard
                title="Clients"
                value={statsObj.total_customers}
                subtitle={`+${statsObj.new_customers} nouveaux`}
                icon={<Users size={20} />}
                color="indigo"
              />
            </div>
          </div>
        );
      }
    }

    return null;
  }, [data, type]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="animate-slide-up relative max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl dark:bg-slate-800 sm:rounded-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <h2 className="flex items-center gap-2 text-lg font-black text-slate-800 dark:text-slate-200">
            {title}
          </h2>

          <div className="flex items-center gap-2">
            <button
              onClick={onExportPDF}
              className="rounded-xl p-2 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700"
              title="Exporter en PDF"
            >
              <Printer size={20} className="text-slate-600 dark:text-slate-400" />
            </button>
            <button
              onClick={onClose}
              className="rounded-xl p-2 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              <X size={20} className="text-slate-600 dark:text-slate-400" />
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-6">
          {renderContent()}
          <div className="mt-6 space-y-1 rounded-xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-700/50 dark:text-slate-400">
            <p>Généré par : {userName || 'Utilisateur non spécifié'}</p>
            <p>Branche : {branchName || 'Branche non spécifiée'}</p>
            {branchAddress && <p>Adresse : {branchAddress}</p>}
            {branchPhone && <p>Tél : {branchPhone}</p>}
            {branchEmail && <p>Email : {branchEmail}</p>}
          </div>
        </div>
      </div>
    </div>
  );
});

DetailModal.displayName = 'DetailModal';

// ===================================================================
// COMPOSANT PRINCIPAL DU DASHBOARD V3
// ===================================================================

const DashboardV3: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, isSuperAdmin } = useAuthStore();

  const {
    id: activeBranchId,
    name: branchName,
    address: branchAddress,
    phone: branchPhone,
    email: branchEmail,
    isActive: branchIsActive,
    isMainBranch,
    parentPharmacyName,
    serviceStatus,
    isLoading: isLoadingBranch,
    error: branchError,
    refreshBranch,
    refreshServiceStatus,
  } = useActiveBranch();

  const [selectedModal, setSelectedModal] = useState<{
    type: DetailModalType;
    title: string;
    data: unknown;
  } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // États V3
  const [stats, setStats] = useState<DashboardStatsV3 | null>(null);
  const [alerts, setAlerts] = useState<DashboardAlertV3[]>([]);
  const [salesHistory, setSalesHistory] = useState<SalesHistoryResponseV3 | null>(null);
  const [performance, setPerformance] = useState<PerformanceMetricsV3 | null>(null);
  const [lowStock, setLowStock] = useState<LowStockResponseV3 | null>(null);

  const timezoneHook = useTimezone();
  const browserTimezone = timezoneHook.timezone;

  const isAdmin = useMemo(() => {
    if (!isObject(user)) return false;
    const role = user.role || user.user_role;
    return role === 'admin' || role === 'super_admin';
  }, [user]);

  const hasCriticalAlerts = useMemo(() => {
    return alerts.some(alert => alert.severity === 'critical');
  }, [alerts]);

  const extendedStats = useMemo(() => normalizeStatsV3(stats), [stats]);

  const fetchAllDashboardData = useCallback(async (showBackgroundLoading = false) => {
    if (!activeBranchId) {
      console.warn('fetchAllDashboardData: activeBranchId invalide');
      setIsLoading(false);
      setIsFetching(false);
      return;
    }

    console.log('📊 Dashboard V3 - Fetching data for branch:', activeBranchId);

    if (showBackgroundLoading) {
      setIsFetching(true);
    } else {
      setIsLoading(true);
    }

    try {
      const [statsData, alertsData, historyData, performanceData, lowStockData] = await Promise.all([
        dashboardServiceV3.getStats(activeBranchId, 'month'),
        dashboardServiceV3.getAlerts(activeBranchId, undefined, 50),
        dashboardServiceV3.getSalesHistory(activeBranchId, 30),
        dashboardServiceV3.getPerformance(activeBranchId, 30),
        dashboardServiceV3.getLowStockProducts(activeBranchId, 1.0, 20),
      ]);

      console.log('✅ Dashboard V3 - Stats received in', statsData.meta.response_time_ms, 'ms');
      
      setStats(statsData);
      setAlerts(alertsData.alerts);
      setSalesHistory(historyData);
      setPerformance(performanceData);
      setLowStock(lowStockData);
      setError(null);
    } catch (err) {
      console.error('❌ Dashboard V3 - Error:', err);
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
      setIsFetching(false);
    }
  }, [activeBranchId]);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login', { replace: true });
      return;
    }

    if (typeof isSuperAdmin === 'function' && isSuperAdmin()) {
      navigate('/super-admin', { replace: true });
    }
  }, [isAuthenticated, isSuperAdmin, navigate]);

  useEffect(() => {
    if (!activeBranchId) {
      console.log('Dashboard V3: En attente d\'un branchId valide...');
      setIsLoading(false);
      return;
    }

    if (!branchIsActive) {
      console.log('Dashboard V3: La branche n\'est pas active');
      setIsLoading(false);
      return;
    }

    console.log('Dashboard V3: Chargement des données pour:', activeBranchId);
    fetchAllDashboardData(false);
  }, [activeBranchId, branchIsActive, fetchAllDashboardData]);

  // Rafraîchissement automatique toutes les 30 secondes
  useEffect(() => {
    if (!activeBranchId) return;

    const interval = window.setInterval(async () => {
      try {
        await fetchAllDashboardData(true);
        await refreshServiceStatus();
      } catch (err) {
        console.error('Erreur actualisation silencieuse dashboard V3:', err);
      }
    }, 30000);

    return () => window.clearInterval(interval);
  }, [activeBranchId, fetchAllDashboardData, refreshServiceStatus]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refreshBranch();
      await refreshServiceStatus();
      await fetchAllDashboardData(false);
    } catch (err) {
      console.error('Erreur actualisation dashboard V3:', err);
    } finally {
      window.setTimeout(() => setIsRefreshing(false), 400);
    }
  }, [fetchAllDashboardData, refreshBranch, refreshServiceStatus]);

  const handleExportPDF = useCallback((type: string, data: unknown): void => {
    if (!data) return;

    const pdfData: PDFData = {
      type,
      data,
      userName: isObject(user) && typeof user.nom_complet === 'string' ? user.nom_complet : 'Non spécifié',
      pharmacyName: branchName || 'Branche non spécifiée',
      pharmacyAddress: branchAddress || undefined,
      pharmacyPhone: branchPhone || undefined,
      pharmacyEmail: branchEmail || undefined,
    };

    try {
      generateDashboardPDF(pdfData);
    } catch (err) {
      console.error('Erreur lors de l’export PDF:', err);
      alert('Une erreur est survenue lors de la génération du PDF');
    }
  }, [user, branchName, branchAddress, branchPhone, branchEmail]);

  const dashboardCards = useMemo((): DashboardCard[] => {
    return [
      {
        id: 'daily-sales',
        title: "Chiffre d'affaires",
        value: formatCurrency(extendedStats.daily_sales),
        subtitle: `${extendedStats.daily_transactions} transaction(s)`,
        icon: <ShoppingBag size={20} />,
        iconBgColor: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
        onClick: () => setSelectedModal({ type: 'sales', title: 'Détail des ventes', data: salesHistory }),
      },
      {
        id: 'low-stock',
        title: 'Alertes stock',
        value: extendedStats.low_stock,
        subtitle: 'Produits en stock bas',
        icon: <AlertTriangle size={20} />,
        iconBgColor: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
        onClick: () => setSelectedModal({ type: 'stock', title: 'Produits en stock bas', data: lowStock }),
      },
      {
        id: 'stock-value',
        title: 'Valeur du stock',
        value: formatCurrency(extendedStats.total_stock_value),
        subtitle: `${extendedStats.total_products} produits`,
        icon: <Package size={20} />,
        iconBgColor: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
        onClick: () => setSelectedModal({ type: 'stock', title: 'Détail du stock', data: lowStock }),
      },
      {
        id: 'profit-margin',
        title: 'Marge bénéficiaire',
        value: `${extendedStats.profit_margin}%`,
        subtitle: 'Bénéfice net',
        icon: <TrendingUp size={20} />,
        iconBgColor: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
        onClick: () => setSelectedModal({ type: 'profits', title: 'Performance financière', data: performance }),
      },
      {
        id: 'customers',
        title: 'Clients',
        value: extendedStats.total_customers,
        subtitle: `+${extendedStats.new_customers} nouveaux`,
        icon: <Users size={20} />,
        iconBgColor: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400',
        onClick: () => setSelectedModal({ type: 'performance', title: 'Performance commerciale', data: performance }),
      },
      {
        id: 'performance',
        title: 'Performance',
        value: `${performance?.metrics.revenue.growth || 0}%`,
        subtitle: 'Croissance CA',
        icon: <TrendingUp size={20} />,
        iconBgColor: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400',
        onClick: () => setSelectedModal({ type: 'performance', title: 'Indicateurs de performance', data: performance }),
      },
    ];
  }, [extendedStats, lowStock, salesHistory, performance]);

  const userFullName = isObject(user) && typeof user.nom_complet === 'string'
    ? user.nom_complet
    : 'Utilisateur';

  const serviceStatusMessage = serviceStatus?.in_service 
    ? '🟢 En service' 
    : serviceStatus?.restrictions_enabled 
      ? '🔴 Hors service' 
      : '🟢 Service continu';

  const responseTime = stats?.meta.response_time_ms;
  const isCached = stats?.meta.cached;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 pb-10 transition-colors sm:px-6 lg:px-8">
      <ExpiryWarningBanner />

      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
        <div className="space-y-2">
          <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight text-slate-800 dark:text-slate-200 sm:text-3xl">
            <LayoutDashboard className="text-blue-600 dark:text-blue-400" size={28} />
            Tableau de Bord V3
            {responseTime && (
              <span className={`ml-2 text-xs font-medium ${isCached ? 'text-purple-500' : 'text-green-500'}`}>
                {isCached ? '📦 Cache' : '⚡'} {responseTime}ms
              </span>
            )}
          </h1>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Building2 size={16} className="text-blue-500 dark:text-blue-400" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {branchName || 'Branche non spécifiée'}
              </p>
              {isMainBranch && (
                <span className="ml-1 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                  Principale
                </span>
              )}
            </div>

            {parentPharmacyName && (
              <div className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                <Building2 size={12} />
                <span>{parentPharmacyName}</span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <p className="flex items-center gap-1 font-medium text-slate-500 dark:text-slate-400">
              <span>👤 {userFullName}</span>
              {isAdmin && (
                <span className="ml-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                  Admin
                </span>
              )}
            </p>

            <div className={`flex items-center gap-1 rounded-full px-2 py-0.5 ${
              serviceStatus?.in_service 
                ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                : serviceStatus?.restrictions_enabled
                  ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                  : 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
            }`}>
              <CheckCircle size={12} />
              <span className="text-[10px] font-bold">{serviceStatusMessage}</span>
            </div>

            <div className="flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-purple-700 dark:bg-purple-900 dark:text-purple-300">
              <span className="text-[10px]">Fuseau: {browserTimezone}</span>
            </div>

            {(isLoadingBranch || isLoading) && (
              <div className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <RefreshCw size={10} className="animate-spin" />
                <span className="text-[10px] font-bold">Chargement...</span>
              </div>
            )}

            {isFetching && (
              <div className="flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                <RefreshCw size={10} className="animate-spin" />
                <span className="text-[10px] font-bold">Actualisation</span>
              </div>
            )}

            {error && !branchError && (
              <div className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-red-700 dark:bg-red-900 dark:text-red-300">
                <span className="text-[10px] font-bold">{getErrorMessage(error, 'Erreur')}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex w-full items-center gap-3 sm:w-auto">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 sm:w-auto"
          >
            <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
            Actualiser
          </button>
        </div>
      </div>

      {hasCriticalAlerts && alerts.length > 0 && (
        <div className="rounded-2xl bg-linear-to-r from-red-500 to-orange-600 p-1 shadow-xl">
          <div className="flex flex-col items-center justify-between gap-4 rounded-xl bg-white/10 p-4 backdrop-blur-md sm:flex-row sm:p-5">
            <div className="flex w-full items-center gap-4 sm:w-auto">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 text-white sm:h-12 sm:w-12">
                <AlertTriangle size={20} />
              </div>
              <div className="text-white">
                <p className="text-xs font-black uppercase tracking-wider opacity-90">Alertes Critiques</p>
                <p className="text-sm font-bold sm:text-base">
                  {alerts.filter(a => a.severity === 'critical').length} alerte(s) nécessitent votre attention
                </p>
              </div>
            </div>

            <button
              onClick={() => setSelectedModal({ type: 'alerts', title: 'Alertes de stock', data: { alerts } })}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 text-xs font-black text-red-700 shadow-lg transition-all hover:bg-red-50 sm:w-auto"
            >
              VOIR LES ALERTES <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {dashboardCards.map((card) => (
          <div
            key={card.id}
            onClick={card.onClick}
            className="cursor-pointer rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition-all hover:scale-[1.02] hover:shadow-md active:scale-[0.98] dark:border-slate-700 dark:bg-slate-800"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                card.onClick();
              }
            }}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{card.title}</p>
                <p className="mt-1 text-2xl font-black text-slate-800 dark:text-slate-200">{card.value}</p>
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{card.subtitle}</p>
              </div>
              <div className={`rounded-xl p-3 ${card.iconBgColor}`}>
                {card.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Section historique des ventes */}
      {salesHistory && salesHistory.history.length > 0 && (
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-800 dark:text-slate-200">
              <Clock size={16} className="text-blue-500" />
              Évolution des ventes - 30 jours
            </h3>
            <button
              onClick={() => setSelectedModal({ type: 'sales', title: 'Historique complet des ventes', data: salesHistory })}
              className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              Voir tout <ArrowRight size={14} />
            </button>
          </div>

          <div className="space-y-2">
            {salesHistory.history.slice(-7).reverse().map((item, idx) => (
              <div key={idx} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 dark:bg-slate-700/50">
                <div>
                  <p className="text-sm font-medium dark:text-slate-200">{item.date}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{item.sales_count} vente(s)</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(item.total_revenue)}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Moy: {formatCurrency(item.average_basket)}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl bg-slate-100 p-3 dark:bg-slate-700">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Tendance des ventes</span>
              <span className={`text-sm font-bold ${salesHistory.summary.trend.direction === 'up' ? 'text-green-600' : 'text-red-600'}`}>
                {salesHistory.summary.trend.direction === 'up' ? '📈 +' : '📉 '}{Math.abs(salesHistory.summary.trend.percentage)}%
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-600">
              <div 
                className={`h-full rounded-full transition-all ${salesHistory.summary.trend.direction === 'up' ? 'bg-green-500' : 'bg-red-500'}`}
                style={{ width: `${Math.min(100, Math.abs(salesHistory.summary.trend.percentage))}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {selectedModal && (
        <DetailModal
          isOpen={true}
          onClose={() => setSelectedModal(null)}
          title={selectedModal.title}
          data={selectedModal.data}
          type={selectedModal.type}
          onExportPDF={() => handleExportPDF(selectedModal.title, selectedModal.data)}
          userName={userFullName}
          branchName={branchName || undefined}
          branchAddress={branchAddress || undefined}
          branchPhone={branchPhone || undefined}
          branchEmail={branchEmail || undefined}
        />
      )}
    </div>
  );
};

export default withWritePermission(DashboardV3, {
  showReadOnlyMessage: true,
  redirectToSubscription: false,
});