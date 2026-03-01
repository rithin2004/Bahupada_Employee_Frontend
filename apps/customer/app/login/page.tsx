"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { API_BASE, asObject, writeCustomerSession } from "@/lib/auth-session";

export default function CustomerLoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin() {
    if (!identifier.trim() || !password) {
      toast.error("Enter username and password.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: identifier.trim(),
          password,
          portal: "CUSTOMER",
        }),
      });
      const payload = asObject(await response.json().catch(() => ({})));
      if (!response.ok) {
        throw new Error(typeof payload.detail === "string" ? payload.detail : `Login failed: ${response.status}`);
      }
      writeCustomerSession({
        portal: "CUSTOMER",
        accessToken: String(payload.access_token ?? ""),
        refreshToken: String(payload.refresh_token ?? ""),
      });
      toast.success("Customer login successful.");
      router.push("/");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-100 px-4 dark:bg-zinc-950">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-5">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Customer Login</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Sign in with your assigned username, phone, or email.
          </p>
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="customer-identifier" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Identifier
            </label>
            <input
              id="customer-identifier"
              className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none ring-0 transition focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void handleLogin();
                }
              }}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="customer-password" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Password
            </label>
            <input
              id="customer-password"
              type="password"
              className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none ring-0 transition focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void handleLogin();
                }
              }}
            />
          </div>
          <button
            type="button"
            className="inline-flex h-11 w-full items-center justify-center rounded-md bg-zinc-900 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            onClick={() => void handleLogin()}
            disabled={submitting}
          >
            {submitting ? "Signing In..." : "Sign In"}
          </button>
        </div>
      </div>
    </div>
  );
}
