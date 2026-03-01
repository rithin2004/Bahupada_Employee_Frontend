import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { NavKey } from "@/lib/state/customer-types";

export type CustomerUiState = {
  active: NavKey;
  sidebarOpen: boolean;
  cartOpen: boolean;
  feedback: string;
};

const initialState: CustomerUiState = {
  active: "inventory",
  sidebarOpen: false,
  cartOpen: false,
  feedback: "",
};

const customerUiSlice = createSlice({
  name: "customerUi",
  initialState,
  reducers: {
    hydrateCustomerUi(_state, action: PayloadAction<CustomerUiState>) {
      return action.payload;
    },
    setActive(state, action: PayloadAction<NavKey>) {
      state.active = action.payload;
    },
    setSidebarOpen(state, action: PayloadAction<boolean>) {
      state.sidebarOpen = action.payload;
    },
    setCartOpen(state, action: PayloadAction<boolean>) {
      state.cartOpen = action.payload;
    },
    setFeedback(state, action: PayloadAction<string>) {
      state.feedback = action.payload;
    },
  },
});

export const { hydrateCustomerUi, setActive, setSidebarOpen, setCartOpen, setFeedback } = customerUiSlice.actions;
export const customerUiReducer = customerUiSlice.reducer;
