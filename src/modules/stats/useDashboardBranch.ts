// modules/stats/useDashboardBranch.ts
// Branche active : même source que le reste de l'application (PharmacyContext),
// avec repli sur la branche mémorisée (localStorage) puis sur celle de l'utilisateur.
import { useMemo } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { usePharmacy } from '@/contexts/PharmacyContext';

export function useDashboardBranch() {
  const { user } = useAuthStore();
  const { currentBranch, currentPharmacy, isLoading } = usePharmacy();

  const branchId = useMemo((): string | null => {
    const u = user as { branch_id?: string | null; active_branch_id?: string | null } | null;
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

  return {
    branchId,
    branchName,
    isMainBranch: Boolean(currentBranch?.is_main_branch),
    parentPharmacyName: currentPharmacy?.name || null,
    isLoading,
  };
}
