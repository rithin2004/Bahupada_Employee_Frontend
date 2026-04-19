"use client";

import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from "react";

/** Registered by purchase/sales entry workspaces when the leave dialog should run before route changes. */
export type EntryNavGuardApi = {
  isDraftDirty: () => boolean;
  /** Opens the save/discard dialog; resolves true only after save or discard (same module as header Close). */
  promptLeave: () => Promise<boolean>;
};

type EntryNavGuardContextValue = {
  register: (api: EntryNavGuardApi | null) => void;
  /** Fast check so normal Link navigation stays prefetch-friendly when nothing is dirty. */
  peekDraftDirty: () => boolean;
  /** Run before in-app navigation / tab switch; respects dirty + leave dialog. */
  tryNavigateAway: () => Promise<boolean>;
};

const EntryNavGuardContext = createContext<EntryNavGuardContextValue | null>(null);

export function EntryNavigationGuardProvider({ children }: { children: ReactNode }) {
  const ref = useRef<EntryNavGuardApi | null>(null);

  const register = useCallback((api: EntryNavGuardApi | null) => {
    ref.current = api;
  }, []);

  const peekDraftDirty = useCallback((): boolean => {
    const g = ref.current;
    return Boolean(g?.isDraftDirty());
  }, []);

  const tryNavigateAway = useCallback(async (): Promise<boolean> => {
    const g = ref.current;
    if (!g || !g.isDraftDirty()) {
      return true;
    }
    return g.promptLeave();
  }, []);

  const value = useMemo(
    () => ({ register, peekDraftDirty, tryNavigateAway }),
    [register, peekDraftDirty, tryNavigateAway],
  );

  return <EntryNavGuardContext.Provider value={value}>{children}</EntryNavGuardContext.Provider>;
}

export function useOptionalEntryNavigationGuard(): EntryNavGuardContextValue | null {
  return useContext(EntryNavGuardContext);
}

export function useEntryNavigationGuard(): EntryNavGuardContextValue {
  const ctx = useContext(EntryNavGuardContext);
  if (!ctx) {
    throw new Error("useEntryNavigationGuard must be used inside EntryNavigationGuardProvider");
  }
  return ctx;
}
