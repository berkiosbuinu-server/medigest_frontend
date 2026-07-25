/**
 * Service de tableau de bord - Version V3 ultra-optimisée
 * Utilise les nouveaux endpoints REST optimisés
 * Support: 2M+ données, temps réponse <50ms
 * Mai 2026
 */

import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import axiosRetry from 'axios-retry';

// ===================================================================
// TYPES ET INTERFACES - Version V3
// ===================================================================

export interface DashboardFiltersV3 {
  branch_id: string;  // Requis dans V3
  period?: 'day' | 'week' | 'month' | 'year';
  days?: number;
  severity?: 'critical' | 'warning' | 'info';
  limit?: number;
  threshold?: number;
}

// Réponse des stats V3
export interface DashboardStatsV3 {
  success: boolean;
  data: {
    sales: {
      revenue: number;
      count: number;
      average_basket: number;
      revenue_per_customer?: number;
    };
    inventory: {
      total_products: number;
      total_quantity: number;
      stock_value: number;
      out_of_stock: number;
      low_stock: number;
      expired?: number;
    };
    profit: {
      total: number;
      margin: number;
    };
    customers: {
      total: number;
      new: number;
    };
    expenses?: {
      total: number;
      average: number;
    };
  };
  meta: {
    period: string;
    start_date: string;
    end_date: string;
    response_time_ms: number;
    cached: boolean;
  };
}

// Alerte V3
export interface DashboardAlertV3 {
  id: string;
  type: 'low_stock' | 'expiring';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  product_name: string;
  current_stock?: number;
  threshold?: number;
  expiry_date?: string;
  days_left?: number;
  quantity?: number;
}

export interface DashboardAlertsResponseV3 {
  success: boolean;
  alerts: DashboardAlertV3[];
  summary: {
    critical: number;
    warning: number;
    info: number;
  };
  total: number;
}

// Historique des ventes V3
export interface SalesHistoryItemV3 {
  date: string;
  sales_count: number;
  total_revenue: number;
  average_basket: number;
  unique_customers?: number;
}

export interface SalesHistoryResponseV3 {
  success: boolean;
  history: SalesHistoryItemV3[];
  summary: {
    total_revenue: number;
    total_sales: number;
    average_daily_revenue: number;
    trend: {
      direction: 'up' | 'down' | 'stable';
      percentage: number;
      slope: number;
    };
  };
  period: {
    start_date: string;
    end_date: string;
    days: number;
  };
}

// Produits stock bas V3
export interface LowStockProductV3 {
  id: string;
  name: string;
  code: string;
  category: string;
  current_stock: number;
  threshold: number;
  selling_price: number;
  stock_value: number;
  potential_profit?: number;
  severity: 'critical' | 'warning';
}

export interface LowStockResponseV3 {
  success: boolean;
  products: LowStockProductV3[];
  total: number;
  critical_count: number;
}

// Performance V3
export interface PerformanceMetricsV3 {
  success: boolean;
  metrics: {
    revenue: {
      current: number;
      previous: number;
      growth: number;
    };
    transactions: {
      current: number;
      previous: number;
      growth: number;
    };
    customers: {
      total: number;
      active_users: number;
    };
    inventory: {
      total_products: number;
      stock_value: number;
      out_of_stock_rate: number;
    };
    efficiency: {
      average_basket: number;
      revenue_per_user: number;
    };
  };
  period: {
    days: number;
    start_date: string;
    end_date: string;
  };
}

// Health check V3
export interface HealthCheckV3 {
  status: 'healthy' | 'unhealthy';
  version: string;
  cache_size: number;
}

// ===================================================================
// CONFIGURATION
// ===================================================================

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://my-backend-ydit.onrender.com';
const DEFAULT_TIMEOUT = 30000; // 30 secondes
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;

// ===================================================================
// CLIENT AXIOS OPTIMISÉ
// ===================================================================

class DashboardApiClientV3 {
  private client: AxiosInstance;
  private static instance: DashboardApiClientV3;

  private constructor() {
    this.client = axios.create({
      baseURL: `${API_BASE_URL}/api/v3/dashboard/v3`,
      timeout: DEFAULT_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      withCredentials: false,
    });

    // Intercepteur pour ajouter le token
    this.client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        const token = this.getAuthToken();
        if (token && config.headers) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Intercepteur pour gérer les erreurs
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.response?.status === 401) {
          const refreshed = await this.refreshToken();
          if (refreshed && error.config) {
            const token = this.getAuthToken();
            if (error.config.headers) {
              error.config.headers.Authorization = `Bearer ${token}`;
            }
            return this.client.request(error.config);
          }
        }
        return Promise.reject(error);
      }
    );

    // Configuration du retry
    axiosRetry(this.client, {
      retries: MAX_RETRIES,
      retryDelay: (retryCount) => {
        console.log(`🔄 Dashboard V3 - Tentative ${retryCount}/${MAX_RETRIES}`);
        return RETRY_DELAY * retryCount;
      },
      retryCondition: (error: AxiosError) => {
        return (
          error.code === 'ECONNABORTED' ||
          error.code === 'ERR_NETWORK' ||
          (error.response?.status ?? 0) >= 500 ||
          error.response?.status === 429
        );
      },
    });
  }

  static getInstance(): DashboardApiClientV3 {
    if (!DashboardApiClientV3.instance) {
      DashboardApiClientV3.instance = new DashboardApiClientV3();
    }
    return DashboardApiClientV3.instance;
  }

  private getAuthToken(): string | null {
    return localStorage.getItem('access_token') || localStorage.getItem('token');
  }

  private async refreshToken(): Promise<boolean> {
    try {
      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) return false;

      const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
        refresh_token: refreshToken
      });

      if (response.data.access_token) {
        localStorage.setItem('access_token', response.data.access_token);
        if (response.data.refresh_token) {
          localStorage.setItem('refresh_token', response.data.refresh_token);
        }
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ Refresh token failed:', error);
      return false;
    }
  }

  getClient(): AxiosInstance {
    return this.client;
  }
}

// ===================================================================
// SERVICE PRINCIPAL V3
// ===================================================================

class DashboardServiceV3 {
  private api: AxiosInstance;

  constructor() {
    this.api = DashboardApiClientV3.getInstance().getClient();
  }

  private handleError(error: unknown, context: string): never {
    console.error(`❌ Erreur DashboardServiceV3.${context}:`, error);
    
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED') {
        throw new Error('Le serveur met trop de temps à répondre. Réessayez.');
      }
      
      if (error.code === 'ERR_NETWORK') {
        throw new Error('Connexion au serveur impossible. Vérifiez votre réseau.');
      }
      
      if (error.response) {
        const message = error.response.data?.detail || 
                       error.response.data?.message || 
                       `Erreur ${error.response.status}`;
        throw new Error(message);
      }
      
      throw new Error(`Erreur: ${error.message}`);
    }
    
    throw new Error('Une erreur inattendue est survenue');
  }

  // ===================================================================
  // ENDPOINTS V3
  // ===================================================================

  /**
   * GET /api/v3/dashboard/v3/stats
   * Récupère les statistiques principales du dashboard
   */
  async getStats(branchId: string, period: 'day' | 'week' | 'month' | 'year' = 'month'): Promise<DashboardStatsV3> {
    try {
      console.log(`📊 Dashboard V3 - Stats request: branch=${branchId}, period=${period}`);
      const response = await this.api.get('/stats', {
        params: { branch_id: branchId, period },
      });
      console.log(`✅ Dashboard V3 - Stats received in ${response.data.meta.response_time_ms}ms`);
      return response.data;
    } catch (error) {
      return this.handleError(error, 'getStats');
    }
  }

  /**
   * GET /api/v3/dashboard/v3/alerts
   * Récupère les alertes avec filtrage par sévérité
   */
  async getAlerts(
    branchId: string, 
    severity?: 'critical' | 'warning' | 'info',
    limit: number = 50
  ): Promise<DashboardAlertsResponseV3> {
    try {
      console.log(`🔔 Dashboard V3 - Alerts request: branch=${branchId}, severity=${severity || 'all'}`);
      const params: Record<string, any> = { branch_id: branchId, limit };
      if (severity) params.severity = severity;
      
      const response = await this.api.get('/alerts', { params });
      console.log(`✅ Dashboard V3 - ${response.data.total} alerts found`);
      return response.data;
    } catch (error) {
      return this.handleError(error, 'getAlerts');
    }
  }

  /**
   * GET /api/v3/dashboard/v3/sales/history
   * Récupère l'historique des ventes pour les graphiques
   */
  async getSalesHistory(branchId: string, days: number = 30): Promise<SalesHistoryResponseV3> {
    try {
      console.log(`📈 Dashboard V3 - Sales history: branch=${branchId}, days=${days}`);
      const response = await this.api.get('/sales/history', {
        params: { branch_id: branchId, days },
      });
      console.log(`✅ Dashboard V3 - ${response.data.history.length} days of history`);
      return response.data;
    } catch (error) {
      return this.handleError(error, 'getSalesHistory');
    }
  }

  /**
   * GET /api/v3/dashboard/v3/products/low-stock
   * Récupère les produits en stock bas
   */
  async getLowStockProducts(
    branchId: string, 
    threshold: number = 1.0,
    limit: number = 50
  ): Promise<LowStockResponseV3> {
    try {
      console.log(`📦 Dashboard V3 - Low stock: branch=${branchId}, threshold=${threshold}`);
      const response = await this.api.get('/products/low-stock', {
        params: { branch_id: branchId, threshold, limit },
      });
      console.log(`✅ Dashboard V3 - ${response.data.total} low stock products (${response.data.critical_count} critical)`);
      return response.data;
    } catch (error) {
      return this.handleError(error, 'getLowStockProducts');
    }
  }

  /**
   * GET /api/v3/dashboard/v3/performance
   * Récupère les indicateurs de performance
   */
  async getPerformance(branchId: string, days: number = 30): Promise<PerformanceMetricsV3> {
    try {
      console.log(`🎯 Dashboard V3 - Performance: branch=${branchId}, days=${days}`);
      const response = await this.api.get('/performance', {
        params: { branch_id: branchId, days },
      });
      console.log(`✅ Dashboard V3 - Performance metrics received`);
      return response.data;
    } catch (error) {
      return this.handleError(error, 'getPerformance');
    }
  }

  /**
   * GET /api/v3/dashboard/v3/health
   * Vérifie l'état du service
   */
  async getHealth(): Promise<HealthCheckV3> {
    try {
      const response = await this.api.get('/health');
      return response.data;
    } catch (error) {
      return {
        status: 'unhealthy',
        version: 'unknown',
        cache_size: 0
      };
    }
  }

  /**
   * POST /api/v3/dashboard/v3/cache/clear
   * Vide le cache (admin uniquement)
   */
  async clearCache(branchId?: string, pattern?: string): Promise<{ success: boolean; message: string }> {
    try {
      const params: Record<string, any> = {};
      if (branchId) params.branch_id = branchId;
      if (pattern) params.pattern = pattern;
      
      const response = await this.api.post('/cache/clear', null, { params });
      return response.data;
    } catch (error) {
      console.warn('⚠️ Failed to clear cache:', error);
      return { success: false, message: 'Erreur lors du vidage du cache' };
    }
  }
}

// ===================================================================
// HOOKS REACT pour une utilisation facile
// ===================================================================

// Hook pour les statistiques
export const useDashboardStats = () => {
  const [data, setData] = useState<DashboardStatsV3 | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async (branchId: string, period: 'day' | 'week' | 'month' | 'year' = 'month') => {
    setLoading(true);
    setError(null);
    try {
      const result = await dashboardServiceV3.getStats(branchId, period);
      setData(result);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, fetchStats };
};

// Hook pour les alertes
export const useDashboardAlerts = () => {
  const [data, setData] = useState<DashboardAlertsResponseV3 | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchAlerts = useCallback(async (branchId: string, severity?: 'critical' | 'warning' | 'info') => {
    setLoading(true);
    try {
      const result = await dashboardServiceV3.getAlerts(branchId, severity);
      setData(result);
      return result;
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, fetchAlerts };
};

// Hook pour l'historique des ventes
export const useSalesHistory = () => {
  const [data, setData] = useState<SalesHistoryResponseV3 | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchHistory = useCallback(async (branchId: string, days: number = 30) => {
    setLoading(true);
    try {
      const result = await dashboardServiceV3.getSalesHistory(branchId, days);
      setData(result);
      return result;
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, fetchHistory };
};

// Hook pour les performances
export const usePerformance = () => {
  const [data, setData] = useState<PerformanceMetricsV3 | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchPerformance = useCallback(async (branchId: string, days: number = 30) => {
    setLoading(true);
    try {
      const result = await dashboardServiceV3.getPerformance(branchId, days);
      setData(result);
      return result;
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, fetchPerformance };
};

// Hook pour les stocks bas
export const useLowStock = () => {
  const [data, setData] = useState<LowStockResponseV3 | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchLowStock = useCallback(async (branchId: string, threshold: number = 1.0) => {
    setLoading(true);
    try {
      const result = await dashboardServiceV3.getLowStockProducts(branchId, threshold);
      setData(result);
      return result;
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, fetchLowStock };
};

// ===================================================================
// UTILITAIRES
// ===================================================================

import { useState, useCallback } from 'react';

export const dashboardServiceV3 = new DashboardServiceV3();

// Fonction de health check rapide
export const checkDashboardHealthV3 = async (): Promise<boolean> => {
  try {
    const health = await dashboardServiceV3.getHealth();
    return health.status === 'healthy';
  } catch {
    return false;
  }
};

// Export par défaut
export default dashboardServiceV3;