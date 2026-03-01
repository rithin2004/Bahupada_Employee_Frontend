import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

type UiEntry = Record<string, unknown>;

type UiState = {
  entries: Record<string, UiEntry>;
};

const initialState: UiState = {
  entries: {},
};

const uiStateSlice = createSlice({
  name: "uiState",
  initialState,
  reducers: {
    hydrateUiState(state, action: PayloadAction<UiState>) {
      state.entries = action.payload.entries ?? {};
    },
    setUiStateEntry(state, action: PayloadAction<{ key: string; value: UiEntry }>) {
      state.entries[action.payload.key] = action.payload.value;
    },
    clearUiStateEntry(state, action: PayloadAction<{ key: string }>) {
      delete state.entries[action.payload.key];
    },
  },
});

export const { hydrateUiState, setUiStateEntry, clearUiStateEntry } = uiStateSlice.actions;
export const uiStateReducer = uiStateSlice.reducer;
export type { UiEntry, UiState };
