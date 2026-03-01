export type NavKey = "inventory" | "my-orders" | "schemes" | "credit-debit";

export type StockRow = {
  batch_id: string;
  product_id: string;
  warehouse_id: string;
  sku: string;
  product_name: string;
  warehouse_name: string;
  unit: string;
  base_price: number;
  available_quantity: number;
  batch_no: string;
};

export type CartItem = StockRow & { quantity: number };
