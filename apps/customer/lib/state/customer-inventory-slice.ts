import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { StockRow } from "@/lib/state/customer-types";

export type CustomerInventoryState = {
  searchInput: string;
  search: string;
  rows: StockRow[];
  currentCursor: string | null;
  nextCursor: string | null;
  cursorHistory: Array<string | null>;
  hasMore: boolean;
  totalItems: number;
  lastLoadedKey: string | null;
};

const initialState: CustomerInventoryState = {
  searchInput: "",
  search: "",
  rows: [],
  currentCursor: null,
  nextCursor: null,
  cursorHistory: [],
  hasMore: false,
  totalItems: 0,
  lastLoadedKey: null,
};

const customerInventorySlice = createSlice({
  name: "customerInventory",
  initialState,
  reducers: {
    hydrateCustomerInventory(_state, action: PayloadAction<CustomerInventoryState>) {
      return action.payload;
    },
    setSearchInput(state, action: PayloadAction<string>) {
      state.searchInput = action.payload;
    },
    setSearch(state, action: PayloadAction<string>) {
      state.search = action.payload;
    },
    setRows(state, action: PayloadAction<StockRow[]>) {
      state.rows = action.payload;
    },
    setCurrentCursor(state, action: PayloadAction<string | null>) {
      state.currentCursor = action.payload;
    },
    setNextCursor(state, action: PayloadAction<string | null>) {
      state.nextCursor = action.payload;
    },
    setCursorHistory(state, action: PayloadAction<Array<string | null>>) {
      state.cursorHistory = action.payload;
    },
    setHasMore(state, action: PayloadAction<boolean>) {
      state.hasMore = action.payload;
    },
    setTotalItems(state, action: PayloadAction<number>) {
      state.totalItems = action.payload;
    },
    setLastLoadedKey(state, action: PayloadAction<string | null>) {
      state.lastLoadedKey = action.payload;
    },
    resetCursorState(state) {
      state.currentCursor = null;
      state.nextCursor = null;
      state.cursorHistory = [];
      state.hasMore = false;
    },
  },
});

export const {
  hydrateCustomerInventory,
  setSearchInput,
  setSearch,
  setRows,
  setCurrentCursor,
  setNextCursor,
  setCursorHistory,
  setHasMore,
  setTotalItems,
  setLastLoadedKey,
  resetCursorState,
} = customerInventorySlice.actions;

export const customerInventoryReducer = customerInventorySlice.reducer;
