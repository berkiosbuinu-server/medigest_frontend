import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  ClipboardList,
  FileBarChart,
  BarChart3,
  LayoutDashboard,
  Users,
  ShoppingCart,
  Package,
  ShoppingBag,
  Wallet,
  Settings,
  ArrowRight,
  Repeat,
  type LucideIcon,
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { usePharmacy } from '@/contexts/PharmacyContext';

interface ActionCard {
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
  color: string; // classes du pastille d'icône
  roles: string[];
}

const ACTIONS: ActionCard[] = [
  {
    label: 'Tableau de bord',
    description: "Vue d'ensemble de l'activité de la succursale",
    href: '/dashboard',
    icon: LayoutDashboard,
    color: 'bg-blue-100 text-blue-600',
    roles: ['admin', 'gestionnaire', 'pharmacien', 'caissier', 'comptable', 'stockiste', 'preparateur'],
  },
  {
    label: 'Voir le rapport',
    description: 'Consulter les rapports détaillés',
    href: '/rapports',
    icon: FileBarChart,
    color: 'bg-indigo-100 text-indigo-600',
    roles: ['admin', 'comptable', 'gestionnaire'],
  },
  {
    label: 'Voir les statistiques',
    description: 'Suivre les indicateurs et la performance',
    href: '/monitoring',
    icon: BarChart3,
    color: 'bg-violet-100 text-violet-600',
    roles: ['admin', 'gestionnaire'],
  },
  {
    label: "Faire l'inventaire",
    description: 'Lancer ou reprendre un inventaire physique',
    href: '/inventaire',
    icon: ClipboardList,
    color: 'bg-emerald-100 text-emerald-600',
    roles: ['admin', 'gestionnaire', 'pharmacien', 'stockiste'],
  },
  {
    label: 'Gérer le stock',
    description: 'Produits, quantités et péremptions',
    href: '/stock',
    icon: Package,
    color: 'bg-teal-100 text-teal-600',
    roles: ['admin', 'gestionnaire', 'pharmacien', 'stockiste', 'preparateur'],
  },
  {
    label: 'Ventes (POS)',
    description: 'Ouvrir la caisse et vendre',
    href: '/vendor-pos',
    icon: ShoppingCart,
    color: 'bg-orange-100 text-orange-600',
    roles: ['admin', 'pharmacien', 'caissier', 'vendeur'],
  },
  {
    label: 'Achats',
    description: 'Commandes et réceptions fournisseurs',
    href: '/purchases',
    icon: ShoppingBag,
    color: 'bg-amber-100 text-amber-600',
    roles: ['admin', 'gestionnaire', 'stockiste'],
  },
  {
    label: 'Finance',
    description: "Chiffre d'affaires, dépenses et bénéfices",
    href: '/finance',
    icon: Wallet,
    color: 'bg-green-100 text-green-600',
    roles: ['admin', 'comptable', 'gestionnaire'],
  },
  {
    label: 'Gérer les utilisateurs',
    description: 'Comptes, rôles et accès',
    href: '/users',
    icon: Users,
    color: 'bg-rose-100 text-rose-600',
    roles: ['admin'],
  },
  {
    label: 'Paramètres',
    description: 'Configurer la succursale',
    href: '/settings',
    icon: Settings,
    color: 'bg-slate-200 text-slate-600',
    roles: ['admin'],
  },
];

function readStoredBranchName(): string | null {
  try {
    const raw = localStorage.getItem('currentBranch');
    return raw ? (JSON.parse(raw)?.name ?? null) : null;
  } catch {
    return null;
  }
}

export default function BranchWelcomePage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { currentBranch } = usePharmacy();

  const branchName = currentBranch?.name || user?.branch_name || readStoredBranchName() || 'votre succursale';
  const firstName = user?.nom_complet?.trim().split(' ')[0] || '';
  const role = user?.role ?? '';

  const actions = useMemo(() => ACTIONS.filter((a) => a.roles.includes(role)), [role]);

  return (
    <div className="max-w-5xl mx-auto py-6">
      <div className="rounded-2xl bg-linear-to-br from-blue-600 to-indigo-700 text-white p-8 shadow-lg mb-8">
        <div className="flex items-center gap-3 mb-3 text-blue-100">
          <Building2 size={22} />
          <span className="text-sm font-medium uppercase tracking-wide">Succursale active</span>
        </div>
        <h1 className="text-3xl font-bold">
          Bienvenue dans la succursale {branchName}
          {firstName ? `, ${firstName}` : ''} 👋
        </h1>
        <p className="mt-2 text-blue-100">Vous êtes connecté à cette succursale. Tout ce que vous ferez s'y appliquera.</p>
      </div>

      <h2 className="text-xl font-semibold text-slate-800 mb-4">Que voulez-vous faire ?</h2>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {actions.map(({ label, description, href, icon: Icon, color }) => (
          <button
            key={href}
            type="button"
            onClick={() => navigate(href)}
            className="group text-left bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-blue-300 transition"
          >
            <div className={`w-11 h-11 rounded-lg flex items-center justify-center mb-4 ${color}`}>
              <Icon size={22} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-800">{label}</span>
              <ArrowRight size={18} className="text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition" />
            </div>
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          </button>
        ))}
      </div>

      {role === 'admin' && (
        <div className="mt-8 text-center">
          <button
            type="button"
            onClick={() => navigate('/select-branch')}
            className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-blue-600"
          >
            <Repeat size={16} /> Changer de succursale
          </button>
        </div>
      )}
    </div>
  );
}
