import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { CartItem, StockRow } from "@/lib/state/customer-types";

export type CustomerCartState = {
  cartItems: CartItem[];
  draftQtyByBatch: Record<string, number>;
};

const initialState: CustomerCartState = {
  cartItems: [],
  draftQtyByBatch: {},
};

const customerCartSlice = createSlice({
  name: "customerCart",
  initialState,
  reducers: {
    hydrateCustomerCart(_state, action: PayloadAction<CustomerCartState>) {
      return action.payload;
    },
    setDraftQty(state, action: PayloadAction<{ batchId: string; qty: number }>) {
      state.draftQtyByBatch[action.payload.batchId] = action.payload.qty;
    },
    addToCart(state, action: PayloadAction<{ row: StockRow; requestedQty: number }>) {
      const { row, requestedQty } = action.payload;
      if (row.available_quantity <= 0) {
        return;
      }
      const maxQty = Math.max(1, Math.floor(row.available_quantity));
      const safeQty = Math.min(maxQty, Math.max(1, Math.floor(requestedQty || 1)));
      const index = state.cartItems.findIndex((item) => item.batch_id === row.batch_id);
      if (index === -1) {
        state.cartItems.push({ ...row, quantity: safeQty });
        return;
      }
      state.cartItems[index].quantity = Math.min(state.cartItems[index].quantity + safeQty, maxQty);
    },
    updateCartQuantity(state, action: PayloadAction<{ batchId: string; quantity: number }>) {
      const index = state.cartItems.findIndex((item) => item.batch_id === action.payload.batchId);
      if (index === -1) {
        return;
      }
      const maxQty = Math.max(1, Math.floor(state.cartItems[index].available_quantity));
      const safeQty = Math.min(maxQty, Math.max(1, Math.floor(action.payload.quantity || 1)));
      state.cartItems[index].quantity = safeQty;
    },
    removeFromCart(state, action: PayloadAction<string>) {
      state.cartItems = state.cartItems.filter((item) => item.batch_id !== action.payload);
    },
    clearCart(state) {
      state.cartItems = [];
      state.draftQtyByBatch = {};
    },
  },
});

export const {
  hydrateCustomerCart,
  setDraftQty,
  addToCart,
  updateCartQuantity,
  removeFromCart,
  clearCart,
} = customerCartSlice.actions;

export const customerCartReducer = customerCartSlice.reducer;
