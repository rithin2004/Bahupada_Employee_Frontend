import { configureStore } from "@reduxjs/toolkit";

import { apiCacheReducer } from "@/lib/state/api-cache-slice";
import { hydratePagination, paginationReducer, type PaginationState } from "@/lib/state/pagination-slice";
import { hydrateUiState, uiStateReducer, type UiState } from "@/lib/state/ui-state-slice";

const STORAGE_KEY = "bahu-redux-api-cache-v1";

export const store = configureStore({
  reducer: {
    apiCache: apiCacheReducer,
    pagination: paginationReducer,
    uiState: uiStateReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

function readPersistedPagination(): PaginationState | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as { pagination?: PaginationState };
    return parsed.pagination ?? null;
  } catch {
    return null;
  }
}

function readPersistedUiState(): UiState | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as { uiState?: UiState };
    return parsed.uiState ?? null;
  } catch {
    return null;
  }
}

if (typeof window !== "undefined") {
  const persistedPagination = readPersistedPagination();
  if (persistedPagination) {
    store.dispatch(hydratePagination(persistedPagination));
  }
  const persistedUiState = readPersistedUiState();
  if (persistedUiState) {
    store.dispatch(hydrateUiState(persistedUiState));
  }

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  store.subscribe(() => {
    if (saveTimer) {
      clearTimeout(saveTimer);
    }
    saveTimer = setTimeout(() => {
      try {
        const state = store.getState();
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            pagination: state.pagination,
            uiState: state.uiState,
          })
        );
      } catch {
        // ignore storage write errors
      }
    }, 150);
  });
}
