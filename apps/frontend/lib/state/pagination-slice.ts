import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

type CursorPageState = {
  currentCursor: string | null;
  nextCursor: string | null;
  history: Array<string | null>;
  search: string;
};

type OffsetPageState = {
  page: number;
  pageSize: number;
};

type PaginationState = {
  offsetPages: Record<string, OffsetPageState>;
  cursorPages: Record<string, CursorPageState>;
};

const initialState: PaginationState = {
  offsetPages: {},
  cursorPages: {},
};

const paginationSlice = createSlice({
  name: "pagination",
  initialState,
  reducers: {
    hydratePagination(state, action: PayloadAction<PaginationState>) {
      state.offsetPages = action.payload.offsetPages ?? {};
      state.cursorPages = action.payload.cursorPages ?? {};
    },
    setOffsetPage(state, action: PayloadAction<{ key: string; page: number }>) {
      const current = state.offsetPages[action.payload.key] ?? { page: 1, pageSize: 50 };
      state.offsetPages[action.payload.key] = {
        ...current,
        page: Math.max(1, Number(action.payload.page) || 1),
      };
    },
    setOffsetPageSize(state, action: PayloadAction<{ key: string; pageSize: number }>) {
      const current = state.offsetPages[action.payload.key] ?? { page: 1, pageSize: 50 };
      state.offsetPages[action.payload.key] = {
        ...current,
        pageSize: Math.max(1, Number(action.payload.pageSize) || 50),
      };
    },
    resetOffsetPage(state, action: PayloadAction<{ key: string; defaultPage?: number; defaultPageSize?: number }>) {
      state.offsetPages[action.payload.key] = {
        page: Math.max(1, Number(action.payload.defaultPage ?? 1) || 1),
        pageSize: Math.max(1, Number(action.payload.defaultPageSize ?? 50) || 50),
      };
    },
    setCursorPageState(state, action: PayloadAction<{ key: string; value: CursorPageState }>) {
      const previous = state.cursorPages[action.payload.key];
      const next = {
        currentCursor: action.payload.value.currentCursor,
        nextCursor: action.payload.value.nextCursor,
        history: action.payload.value.history,
        search: action.payload.value.search,
      };
      if (
        previous &&
        previous.currentCursor === next.currentCursor &&
        previous.nextCursor === next.nextCursor &&
        previous.search === next.search &&
        previous.history.length === next.history.length &&
        previous.history.every((value, index) => value === next.history[index])
      ) {
        return;
      }
      state.cursorPages[action.payload.key] = next;
    },
    clearCursorPageState(state, action: PayloadAction<{ key: string }>) {
      delete state.cursorPages[action.payload.key];
    },
  },
});

export const {
  hydratePagination,
  setOffsetPage,
  setOffsetPageSize,
  resetOffsetPage,
  setCursorPageState,
  clearCursorPageState,
} = paginationSlice.actions;

export const paginationReducer = paginationSlice.reducer;
export type { CursorPageState, OffsetPageState, PaginationState };
