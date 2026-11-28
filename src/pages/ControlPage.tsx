import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Boxes,
  Loader2,
  PackageX,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Trash2,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/api/client';
import { useAuthStore } from '@/store/useAuthStore';

// ───────────────────────── Types ─────────────────────────
interface Branch {
  id: string;
  name: string;
  code?: string;
  city?: string | null;
}

interface PurgeImpactItem {
  table: string;
  label: string;
  count: number;
}

interface StockSummary {
  branch: { id: string; name: string; code?: string };
  total_products: number;
  products_with_stock: number;
  total_units: number;
  purge_impact: PurgeImpactItem[];
}

interface StaffMember {
  id: string;
  nom_complet: string;
  email?: string | null;
  role: string;
  is_active: boolean;
}

type TabId = 'stock' | 'staff';
type DangerAction = 'reset' | 'purge';

const TABS: { id: TabId; label: string; icon: typeof Boxes }[] = [
  { id: 'stock', label: 'Maintenance de stock', icon: Boxes },
  { id: 'staff', label: 'Gestion du personnel', icon: Users },
  // Ajouter ici de nouveaux onglets de contrôle technique (ex. caisse, synchronisation...)
];

const extractError = (e: any, fallback: string): string => {
  const detail = e?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  return detail?.message || fallback;
};

const nf = (n: number) => new Intl.NumberFormat('fr-FR').format(n);

// ───────────────────────── Modal de confirmation ─────────────────────────
function DangerModal({
  action,
  branch,
  summary,
  busy,
  onCancel,
  onConfirm,
}: {
  action: DangerAction;
  branch: Branch;
  summary: StockSummary | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (confirmName: string) => void;
}) {
  const [typed, setTyped] = useState('');
  const isPurge = action === 'purge';
  const matches = typed.trim() === branch.name.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 p-5">
          <div className="flex items-start gap-3">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${isPurge ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
              <AlertTriangle size={22} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                {isPurge ? 'Supprimer définitivement le stock' : 'Réinitialiser le stock à zéro'}
              </h3>
              <p className="text-sm text-slate-500">Branche : <strong>{branch.name}</strong></p>
            </div>
          </div>
          <button onClick={onCancel} disabled={busy} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="Fermer">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-5 text-sm text-slate-700">
          {isPurge ? (
            <>
              <p>
                Tous les produits de cette branche seront <strong>supprimés définitivement</strong>, avec toutes leurs traces.
                Cette action est <strong>irréversible</strong>.
              </p>
              {summary && summary.purge_impact.length > 0 && (
                <div className="rounded-xl border border-red-100 bg-red-50 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-700">Éléments qui seront supprimés</p>
                  <ul className="space-y-1">
                    {summary.purge_impact.map(item => (
                      <li key={item.table} className="flex justify-between text-red-900">
                        <span>{item.label}</span>
                        <span className="font-semibold">{nf(item.count)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-xs text-slate-500">
                Les lignes de vente, d’achat, de transfert et de retour liées à ces produits sont supprimées ; les en-têtes
                (factures, ventes) restent mais peuvent ne plus avoir de détail de produits.
              </p>
            </>
          ) : (
            <p>
              La quantité de <strong>{nf(summary?.total_products ?? 0)} produit(s)</strong> sera mise à <strong>0</strong>
              {summary ? <> ({nf(summary.total_units)} unité(s) retirée(s))</> : null}. Les produits, prix et historiques sont conservés ;
              un mouvement de stock « Remise à zéro » est enregistré pour chaque produit.
            </p>
          )}

          <label className="block">
            <span className="text-xs font-semibold text-slate-600">
              Pour confirmer, tapez le nom de la branche : <span className="font-mono text-slate-900">{branch.name}</span>
            </span>
            <input
              autoFocus
              value={typed}
              onChange={e => setTyped(e.target.value)}
              disabled={busy}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
              placeholder={branch.name}
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 p-5">
          <button onClick={onCancel} disabled={busy} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            Annuler
          </button>
          <button
            onClick={() => onConfirm(typed)}
            disabled={!matches || busy}
            className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 ${isPurge ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'}`}
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : isPurge ? <Trash2 size={16} /> : <RotateCcw size={16} />}
            {isPurge ? 'Supprimer définitivement' : 'Remettre à zéro'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── Onglet : Maintenance de stock ─────────────────────────
function StockMaintenanceTab({ branch }: { branch: Branch }) {
  const [summary, setSummary] = useState<StockSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<DangerAction | null>(null);
  const [busy, setBusy] = useState(false);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/technical-control/branches/${branch.id}/stock/summary`);
      setSummary(data);
    } catch (e: any) {
      setSummary(null);
      toast.error(extractError(e, 'Impossible de charger le résumé du stock.'));
    } finally {
      setLoading(false);
    }
  }, [branch.id]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const runAction = async (confirmName: string) => {
    if (!pending) return;
    setBusy(true);
    try {
      if (pending === 'reset') {
        const { data } = await api.post(`/technical-control/branches/${branch.id}/stock/reset`, { confirm_name: confirmName });
        toast.success(`Stock remis à zéro : ${nf(data.updated_count)} produit(s) modifié(s).`);
      } else {
        const { data } = await api.post(`/technical-control/branches/${branch.id}/stock/purge`, { confirm_name: confirmName });
        toast.success(`${nf(data.deleted_products)} produit(s) supprimé(s) définitivement.`);
      }
      setPending(null);
      await loadSummary();
    } catch (e: any) {
      toast.error(extractError(e, 'L’opération a échoué.'));
    } finally {
      setBusy(false);
    }
  };

  const stats = [
    { label: 'Produits', value: summary?.total_products },
    { label: 'Produits en stock', value: summary?.products_with_stock },
    { label: 'Unités en stock', value: summary?.total_units },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {stats.map(s => (
          <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{s.label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {loading ? <Loader2 size={20} className="animate-spin text-slate-300" /> : nf(s.value ?? 0)}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-amber-200 bg-white p-5">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
            <RotateCcw size={22} />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Réinitialiser le stock</h3>
          <p className="mt-1 text-sm text-slate-500">
            Met la quantité de chaque produit de la branche à <strong>0</strong>. Les produits, prix et historiques sont conservés.
          </p>
          <button
            onClick={() => setPending('reset')}
            disabled={loading || !summary || summary.total_units === 0}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-3 text-sm font-bold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcw size={17} /> Remettre le stock à zéro
          </button>
          {summary && summary.total_units === 0 && !loading && (
            <p className="mt-2 text-center text-xs text-slate-400">Le stock est déjà à zéro.</p>
          )}
        </section>

        <section className="rounded-2xl border border-red-200 bg-white p-5">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-red-100 text-red-600">
            <PackageX size={22} />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Supprimer le stock</h3>
          <p className="mt-1 text-sm text-slate-500">
            Supprime <strong>définitivement</strong> tous les produits de la branche avec toutes leurs traces (lots, mouvements, lignes de ventes, achats, transferts…).
          </p>
          <button
            onClick={() => setPending('purge')}
            disabled={loading || !summary || summary.total_products === 0}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 size={17} /> Supprimer tout le stock
          </button>
          {summary && summary.total_products === 0 && !loading && (
            <p className="mt-2 text-center text-xs text-slate-400">Cette branche n’a aucun produit.</p>
          )}
        </section>
      </div>

      {pending && (
        <DangerModal
          action={pending}
          branch={branch}
          summary={summary}
          busy={busy}
          onCancel={() => !busy && setPending(null)}
          onConfirm={name => void runAction(name)}
        />
      )}
    </div>
  );
}

// ───────────────────────── Onglet : Gestion du personnel ─────────────────────────
function StaffTab({ branch }: { branch: Branch }) {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get(`/technical-control/branches/${branch.id}/staff`)
      .then(({ data }) => !cancelled && setStaff(data.items || []))
      .catch(e => {
        if (!cancelled) {
          setStaff([]);
          toast.error(extractError(e, 'Impossible de charger le personnel.'));
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [branch.id]);

  if (loading) {
    return <div className="flex justify-center rounded-2xl border border-slate-200 bg-white py-16"><Loader2 className="animate-spin text-red-600" size={28} /></div>;
  }

  if (staff.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
        <Users className="mx-auto mb-3 text-slate-300" size={40} />
        <p className="font-bold text-slate-800">Aucun membre du personnel</p>
        <p className="mt-1 text-sm text-slate-500">Aucun utilisateur n’est rattaché à cette branche.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Nom</th>
            <th className="hidden px-4 py-3 sm:table-cell">Email</th>
            <th className="px-4 py-3">Rôle</th>
            <th className="px-4 py-3">Statut</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {staff.map(m => (
            <tr key={m.id}>
              <td className="px-4 py-3 font-semibold text-slate-900">{m.nom_complet}</td>
              <td className="hidden px-4 py-3 text-slate-500 sm:table-cell">{m.email || '—'}</td>
              <td className="px-4 py-3 capitalize text-slate-600">{m.role}</td>
              <td className="px-4 py-3">
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${m.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                  {m.is_active ? 'Actif' : 'Inactif'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ───────────────────────── Page ─────────────────────────
export default function ControlPage() {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuthStore();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [branchId, setBranchId] = useState<string>('');
  const [tab, setTab] = useState<TabId>('stock');

  const isAdmin = ['admin', 'super_admin'].includes(user?.role || '');

  const loadBranches = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/branches/', { params: { page: 1, limit: 100, is_active: true } });
      const list: Branch[] = Array.isArray(data) ? data : data.items || data.branches || [];
      setBranches(list);
      setBranchId(prev => (prev && list.some(b => b.id === prev) ? prev : list[0]?.id || ''));
    } catch (e: any) {
      setError(extractError(e, 'Impossible de charger les branches.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login', { replace: true });
      return;
    }
    if (!isAdmin) {
      navigate('/bienvenue', { replace: true });
      return;
    }
    void loadBranches();
  }, [isAuthenticated, isAdmin, navigate, loadBranches]);

  const branch = useMemo(() => branches.find(b => b.id === branchId) || null, [branches, branchId]);

  if (!isAuthenticated || !isAdmin) return null;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg">
              <Wrench size={24} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-red-600">MediGest Pro</p>
              <h1 className="text-2xl font-bold text-slate-900">Centre technique</h1>
              <p className="text-sm text-slate-500">Contrôle et maintenance des branches</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/select-branch')}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            <ArrowLeft size={17} /> Retour aux branches
          </button>
        </header>

        <section className="mb-6 flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-900">
          <ShieldAlert className="mt-0.5 shrink-0" size={18} />
          <p>
            <strong>Zone sensible.</strong> Les opérations de ce centre agissent directement sur les données de la branche choisie.
            Certaines sont irréversibles et demandent une confirmation par saisie du nom de la branche.
          </p>
        </section>

        {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

        {loading ? (
          <div className="flex justify-center rounded-2xl border border-slate-200 bg-white py-16"><Loader2 className="animate-spin text-red-600" size={30} /></div>
        ) : branches.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
            <Building2 className="mx-auto mb-3 text-slate-300" size={42} />
            <h3 className="font-bold text-slate-800">Aucune branche disponible</h3>
            <p className="mt-1 text-sm text-slate-500">Créez d’abord une branche depuis la page de sélection.</p>
          </div>
        ) : (
          <>
            <div className="mb-5 flex flex-wrap items-end gap-3">
              <label className="min-w-[240px] flex-1 text-sm font-medium text-slate-700">
                Branche à contrôler
                <select
                  value={branchId}
                  onChange={e => setBranchId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                >
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.name}{b.city ? ` — ${b.city}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <button
                onClick={() => void loadBranches()}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              >
                <RefreshCw size={16} /> Actualiser
              </button>
            </div>

            <nav className="mb-6 flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5" role="tablist">
              {TABS.map(t => {
                const Icon = t.icon;
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTab(t.id)}
                    className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    <Icon size={17} /> {t.label}
                  </button>
                );
              })}
            </nav>

            {branch && (
              <div key={`${branch.id}-${tab}`}>
                {tab === 'stock' && <StockMaintenanceTab branch={branch} />}
                {tab === 'staff' && <StaffTab branch={branch} />}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
