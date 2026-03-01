"use client";

import { useMemo } from "react";
import { useCallback } from "react";
import { usePathname } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";

import type { RootState } from "@/lib/state/store";
import {
  resetOffsetPage,
  setOffsetPage,
  setOffsetPageSize,
  setCursorPageState,
  type CursorPageState,
} from "@/lib/state/pagination-slice";
import { setUiStateEntry } from "@/lib/state/ui-state-slice";

function buildKey(pathname: string, scope: string): string {
  return `${pathname}::${scope}`;
}

export function usePersistedPage(scope: string, defaultPage = 1, defaultPageSize = 50) {
  const pathname = usePathname();
  const dispatch = useDispatch();
  const key = useMemo(() => buildKey(pathname, scope), [pathname, scope]);

  const offsetState = useSelector((state: RootState) => state.pagination.offsetPages[key]);
  const currentPage = typeof offsetState === "number" ? offsetState : (offsetState?.page ?? defaultPage);
  const pageSize = typeof offsetState === "number" ? defaultPageSize : (offsetState?.pageSize ?? defaultPageSize);

  function setCurrentPage(next: number | ((prev: number) => number)) {
    const resolved = typeof next === "function" ? next(currentPage) : next;
    dispatch(setOffsetPage({ key, page: resolved }));
  }

  function setPageSize(next: number) {
    dispatch(setOffsetPageSize({ key, pageSize: next }));
  }

  function resetPage() {
    dispatch(resetOffsetPage({ key, defaultPage, defaultPageSize }));
  }

  return { currentPage, pageSize, setCurrentPage, setPageSize, resetPage };
}

const defaultCursorState: CursorPageState = {
  currentCursor: null,
  nextCursor: null,
  history: [],
  search: "",
};

export function usePersistedCursorPage(scope: string) {
  const pathname = usePathname();
  const dispatch = useDispatch();
  const key = useMemo(() => buildKey(pathname, scope), [pathname, scope]);

  const state = useSelector((root: RootState) => root.pagination.cursorPages[key] ?? defaultCursorState);

  const setState = useCallback((value: CursorPageState) => {
    dispatch(setCursorPageState({ key, value }));
  }, [dispatch, key]);

  return { state, setState };
}

export function usePersistedUiState<T extends Record<string, unknown>>(scope: string, defaults: T) {
  const pathname = usePathname();
  const dispatch = useDispatch();
  const key = useMemo(() => buildKey(pathname, scope), [pathname, scope]);

  const entry = useSelector((state: RootState) => state.uiState.entries[key] ?? defaults);
  const merged = useMemo(() => ({ ...defaults, ...entry }) as T, [defaults, entry]);

  const setState = useCallback((value: T) => {
    dispatch(setUiStateEntry({ key, value }));
  }, [dispatch, key]);

  return { state: merged, setState };
}
