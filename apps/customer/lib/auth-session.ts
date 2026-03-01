"use client";

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";
const CUSTOMER_AUTH_STORAGE_KEY = "bahu_customer_session";
let refreshInFlight: Promise<string> | null = null;

type CustomerSession = {
  portal: string;
  accessToken: string;
  refreshToken: string;
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function readCustomerSession(): CustomerSession {
  if (typeof window === "undefined") {
    return { portal: "", accessToken: "", refreshToken: "" };
  }
  try {
    const raw = window.localStorage.getItem(CUSTOMER_AUTH_STORAGE_KEY);
    if (!raw) {
      return { portal: "", accessToken: "", refreshToken: "" };
    }
    const parsed = asObject(JSON.parse(raw));
    return {
      portal: typeof parsed.portal === "string" ? parsed.portal : "",
      accessToken: typeof parsed.accessToken === "string" ? parsed.accessToken : "",
      refreshToken: typeof parsed.refreshToken === "string" ? parsed.refreshToken : "",
    };
  } catch {
    return { portal: "", accessToken: "", refreshToken: "" };
  }
}

function writeCustomerSession(session: CustomerSession) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(CUSTOMER_AUTH_STORAGE_KEY, JSON.stringify(session));
}

function clearCustomerSession() {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(CUSTOMER_AUTH_STORAGE_KEY);
}

function readCustomerAccessToken(): string {
  return readCustomerSession().accessToken;
}

async function refreshCustomerSession(): Promise<string> {
  if (typeof window === "undefined") {
    throw new Error("Refresh unavailable on server");
  }
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    const session = readCustomerSession();
    if (!session.refreshToken) {
      clearCustomerSession();
      throw new Error("Session expired");
    }

    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify({ refresh_token: session.refreshToken }),
    });

    if (!response.ok) {
      clearCustomerSession();
      throw new Error("Session expired");
    }

    const payload = asObject(await response.json().catch(() => ({})));
    const accessToken = typeof payload.access_token === "string" ? payload.access_token : "";
    const refreshToken = typeof payload.refresh_token === "string" ? payload.refresh_token : "";
    if (!accessToken || !refreshToken) {
      clearCustomerSession();
      throw new Error("Session expired");
    }

    writeCustomerSession({
      portal: session.portal || "CUSTOMER",
      accessToken,
      refreshToken,
    });
    return accessToken;
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

function buildHeaders(headers: HeadersInit | undefined, token: string): Headers {
  const merged = new Headers(headers ?? {});
  if (!merged.has("Accept")) {
    merged.set("Accept", "application/json");
  }
  if (token) {
    merged.set("Authorization", `Bearer ${token}`);
  } else {
    merged.delete("Authorization");
  }
  return merged;
}

async function fetchWithCustomerAuth(path: string, init?: RequestInit): Promise<Response> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const makeRequest = (token: string) =>
    fetch(`${API_BASE}${normalizedPath}`, {
      ...init,
      headers: buildHeaders(init?.headers, token),
      cache: "no-store",
    });

  let response = await makeRequest(readCustomerAccessToken());
  const shouldRefresh =
    typeof window !== "undefined" &&
    response.status === 401 &&
    normalizedPath !== "/auth/refresh" &&
    normalizedPath !== "/auth/login";

  if (!shouldRefresh) {
    return response;
  }

  try {
    const nextToken = await refreshCustomerSession();
    response = await makeRequest(nextToken);
  } catch {
    clearCustomerSession();
  }

  return response;
}

export {
  API_BASE,
  CUSTOMER_AUTH_STORAGE_KEY,
  asObject,
  clearCustomerSession,
  fetchWithCustomerAuth,
  readCustomerAccessToken,
  readCustomerSession,
  refreshCustomerSession,
  writeCustomerSession,
};
