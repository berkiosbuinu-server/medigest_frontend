import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, MapPin, Plus, RefreshCw, LogOut, CheckCircle2, Loader2, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/api/client';
import { useAuthStore } from '@/store/useAuthStore';
import { usePharmacy } from '@/contexts/PharmacyContext';

interface Branch {
  id: string;
  name: string;
  code?: string;
  city?: string | null;
  address?: string | null;
  phone?: string | null;
  is_active?: boolean;
  is_main_branch?: boolean;
}

export default function BranchSelectionPage() {
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuthStore();
  const { setCurrentBranch } = usePharmacy();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', city: '', address: '', phone: '', email: '' });

  const isBranchlessAdmin = user?.role === 'admin' && !user.branch_id;

  const loadBranches = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/branches/', { params: { page: 1, limit: 100, is_active: true } });
      const data = response.data;
      setBranches(Array.isArray(data) ? data : (data.items || data.branches || []));
    } catch (e: any) {
      const message = e?.response?.data?.detail;
      setError(typeof message === 'string' ? message : 'Impossible de charger les branches.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login', { replace: true });
      return;
    }
    if (!isBranchlessAdmin) {
      navigate('/dashboard', { replace: true });
      return;
    }
    // Ne jamais reprendre une branche précédente silencieusement après une nouvelle connexion.
    localStorage.removeItem('active_branch_id');
    api.defaults.headers.common['X-Branch-ID'] = '';
    void loadBranches();
  }, [isAuthenticated, isBranchlessAdmin, navigate, loadBranches]);

  const chooseBranch = async (branch: Branch) => {
    if (!branch.is_active) return;
    setSelecting(branch.id);
    setError('');
    try {
      await api.put(`/branches/${branch.id}/activate`);
      localStorage.setItem('active_branch_id', branch.id);
      localStorage.setItem('currentBranch', JSON.stringify(branch));
      api.defaults.headers.common['X-Branch-ID'] = branch.id;
      setCurrentBranch({
        id: branch.id,
        name: branch.name,
        code: branch.code || '',
        parent_pharmacy_id: '',
        is_main_branch: Boolean(branch.is_main_branch),
        is_active: branch.is_active !== false,
        address: branch.address || '',
        city: branch.city || '',
        phone: branch.phone || null,
        email: null,
      } as any);
      toast.success(`Branche « ${branch.name} » sélectionnée`);
      navigate('/dashboard', { replace: true });
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      const message = typeof detail === 'string' ? detail : detail?.message;
      setError(message || 'Impossible d’activer cette branche.');
      toast.error(message || 'Échec de sélection de la branche');
    } finally {
      setSelecting(null);
    }
  };

  const createBranch = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.city.trim()) return;
    setCreating(true);
    setError('');
    try {
      await api.post('/branches/', {
        name: form.name.trim(),
        city: form.city.trim(),
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
      });
      toast.success('Branche créée. Sélectionnez-la pour commencer.');
      setForm({ name: '', city: '', address: '', phone: '', email: '' });
      setShowCreate(false);
      await loadBranches();
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      const message = typeof detail === 'string' ? detail : detail?.message;
      setError(message || 'La création de la branche a échoué.');
      toast.error(message || 'Erreur de création');
    } finally {
      setCreating(false);
    }
  };

  if (!isAuthenticated || !isBranchlessAdmin) return null;
  const filtered = branches.filter(b =>
    `${b.name} ${b.code || ''} ${b.city || ''}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-600 text-white shadow-lg">
              <Building2 size={25} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-red-600">MediGest Pro</p>
              <h1 className="text-2xl font-bold text-slate-900">Choisir une branche</h1>
              <p className="text-sm text-slate-500">Connecté en tant que {user?.nom_complet || user?.email}</p>
            </div>
          </div>
          <button onClick={() => { localStorage.removeItem('active_branch_id'); localStorage.removeItem('currentBranch'); logout(); navigate('/login'); }}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">
            <LogOut size={17} /> Déconnexion
          </button>
        </header>

        <section className="mb-6 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
          <strong>Votre compte administrateur est global.</strong> Choisissez l’établissement dans lequel vous souhaitez travailler. Les ventes, stocks, finances et autres opérations seront rattachés à la branche sélectionnée.
        </section>

        {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Branches disponibles</h2>
            <p className="text-sm text-slate-500">{branches.length} branche(s) active(s)</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void loadBranches()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">
              <RefreshCw size={16} /> Actualiser
            </button>
            <button onClick={() => setShowCreate(v => !v)} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-red-700">
              <Plus size={17} /> Créer une branche
            </button>
          </div>
        </div>

        {showCreate && (
          <form onSubmit={createBranch} className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-lg font-bold text-slate-900">Nouvelle branche</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">Nom de la branche *
                <input required minLength={2} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex. Pharmacie Centre-ville" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100" />
              </label>
              <label className="text-sm font-medium text-slate-700">Ville *
                <input required value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} placeholder="Ex. Kinshasa" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100" />
              </label>
              <label className="text-sm font-medium text-slate-700">Adresse
                <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 outline-none focus:border-red-500" />
              </label>
              <label className="text-sm font-medium text-slate-700">Téléphone
                <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 outline-none focus:border-red-500" />
              </label>
              <label className="text-sm font-medium text-slate-700 sm:col-span-2">Email de la branche
                <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 outline-none focus:border-red-500" />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setShowCreate(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600">Annuler</button>
              <button disabled={creating} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                {creating ? <Loader2 className="animate-spin" size={17} /> : <Plus size={17} />} Créer
              </button>
            </div>
          </form>
        )}

        <div className="relative mb-5">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher une branche..." className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 outline-none focus:border-red-500" />
        </div>

        {loading ? (
          <div className="flex justify-center rounded-2xl border border-slate-200 bg-white py-16"><Loader2 className="animate-spin text-red-600" size={30} /></div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
            <Building2 className="mx-auto mb-3 text-slate-300" size={42} />
            <h3 className="font-bold text-slate-800">{branches.length ? 'Aucun résultat' : 'Aucune branche disponible'}</h3>
            <p className="mt-1 text-sm text-slate-500">{branches.length ? 'Modifiez votre recherche.' : 'Créez votre première branche pour commencer à utiliser MediGest Pro.'}</p>
            {!branches.length && <button onClick={() => setShowCreate(true)} className="mt-4 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white">Créer la première branche</button>}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {filtered.map(branch => (
              <article key={branch.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-red-200 hover:shadow-md">
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-600"><Building2 size={22} /></div>
                  {branch.is_main_branch && <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">Branche principale</span>}
                </div>
                <h3 className="text-lg font-bold text-slate-900">{branch.name}</h3>
                <p className="mt-1 text-xs font-medium text-slate-400">{branch.code || 'Code non défini'}</p>
                <p className="mt-3 flex items-center gap-2 text-sm text-slate-500"><MapPin size={16} /> {branch.city || branch.address || 'Localisation non renseignée'}</p>
                <button disabled={selecting !== null || branch.is_active === false} onClick={() => void chooseBranch(branch)} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60">
                  {selecting === branch.id ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
                  {selecting === branch.id ? 'Activation...' : 'Travailler dans cette branche'}
                </button>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
