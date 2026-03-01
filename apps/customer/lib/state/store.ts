import { configureStore } from "@reduxjs/toolkit";

import {
  customerCartReducer,
  hydrateCustomerCart,
  type CustomerCartState,
} from "@/lib/state/customer-cart-slice";
import {
  customerInventoryReducer,
  hydrateCustomerInventory,
  type CustomerInventoryState,
} from "@/lib/state/customer-inventory-slice";
import {
  customerUiReducer,
  hydrateCustomerUi,
  type CustomerUiState,
} from "@/lib/state/customer-ui-slice";

const STORAGE_KEY = "bahu-customer-redux-v1";
const MAX_PERSIST_AGE_MS = 1000 * 60 * 30;

type PersistedPayload = {
  savedAt: number;
  ui: CustomerUiState;
  inventory: CustomerInventoryState;
  cart: CustomerCartState;
};

export const store = configureStore({
  reducer: {
    customerUi: customerUiReducer,
    customerInventory: customerInventoryReducer,
    customerCart: customerCartReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

function isUuid(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function sanitizeCartState(cart: CustomerCartState): CustomerCartState {
  const cartItems = (Array.isArray(cart.cartItems) ? cart.cartItems : []).filter(
    (item) => isUuid(item?.product_id) && isUuid(item?.warehouse_id) && Number(item?.quantity) > 0
  );
  return {
    cartItems,
    draftQtyByBatch: cart.draftQtyByBatch ?? {},
  };
}

function readPersistedState(): Omit<PersistedPayload, "savedAt"> | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<PersistedPayload>;
    const savedAt = Number(parsed.savedAt ?? 0);
    if (!savedAt || Date.now() - savedAt > MAX_PERSIST_AGE_MS) {
      return null;
    }
    if (!parsed.ui || !parsed.inventory || !parsed.cart) {
      return null;
    }
    return {
      ui: parsed.ui,
      inventory: parsed.inventory,
      cart: sanitizeCartState(parsed.cart),
    };
  } catch {
    return null;
  }
}

if (typeof window !== "undefined") {
  const persisted = readPersistedState();
  if (persisted) {
    store.dispatch(hydrateCustomerUi(persisted.ui));
    store.dispatch(hydrateCustomerInventory(persisted.inventory));
    store.dispatch(hydrateCustomerCart(persisted.cart));
  }

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  store.subscribe(() => {
    if (saveTimer) {
      clearTimeout(saveTimer);
    }
    saveTimer = setTimeout(() => {
      try {
        const state = store.getState();
        const payload: PersistedPayload = {
          savedAt: Date.now(),
          ui: state.customerUi,
          inventory: state.customerInventory,
          cart: state.customerCart,
        };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch {
        // ignore storage failures
      }
    }, 120);
  });
}
