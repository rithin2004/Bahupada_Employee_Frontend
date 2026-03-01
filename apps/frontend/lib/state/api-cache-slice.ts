import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type ApiCacheEntry = {
  cachedAt: number;
  data: unknown;
};

type ApiCacheState = {
  entries: Record<string, ApiCacheEntry>;
};

const initialState: ApiCacheState = {
  entries: {},
};

const apiCacheSlice = createSlice({
  name: "apiCache",
  initialState,
  reducers: {
    hydrateCache(state, action: PayloadAction<ApiCacheState>) {
      state.entries = action.payload.entries ?? {};
    },
    upsertEntry(state, action: PayloadAction<{ key: string; data: unknown; cachedAt?: number }>) {
      state.entries[action.payload.key] = {
        data: action.payload.data,
        cachedAt: action.payload.cachedAt ?? Date.now(),
      };
    },
    invalidateByPrefixes(state, action: PayloadAction<string[]>) {
      const prefixes = action.payload;
      if (!prefixes.length) {
        state.entries = {};
        return;
      }

      state.entries = Object.fromEntries(
        Object.entries(state.entries).filter(([key]) => !prefixes.some((prefix) => key.startsWith(prefix)))
      );
    },
    clearCache(state) {
      state.entries = {};
    },
  },
});

export const { clearCache, hydrateCache, invalidateByPrefixes, upsertEntry } = apiCacheSlice.actions;
export const apiCacheReducer = apiCacheSlice.reducer;
export type { ApiCacheState };
