import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/purchase", destination: "/admin/purchase" },
      { source: "/stock", destination: "/admin/stock" },
      { source: "/products", destination: "/admin/products" },
      { source: "/warehouses", destination: "/admin/warehouses" },
      { source: "/sales", destination: "/admin/sales" },
      { source: "/sales-invoices", destination: "/admin/sales-invoices" },
      { source: "/planning", destination: "/admin/planning" },
      { source: "/areas", destination: "/admin/areas" },
      { source: "/routes", destination: "/admin/routes" },
      { source: "/vehicles", destination: "/admin/vehicles" },
      { source: "/schemes", destination: "/admin/schemes" },
      { source: "/price", destination: "/admin/price" },
      { source: "/credit-debit-notes", destination: "/admin/credit-debit-notes" },
      { source: "/customers", destination: "/admin/customers" },
      { source: "/employees", destination: "/admin/employees" },
      { source: "/vendors", destination: "/admin/vendors" },
    ];
  },
  async redirects() {
    return [
      { source: "/admin", destination: "/dashboard", permanent: false },
      { source: "/employee", destination: "/dashboard", permanent: false },
    ];
  },
};

export default nextConfig;
