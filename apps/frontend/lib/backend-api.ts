import { invalidateByPrefixes, upsertEntry } from "@/lib/state/api-cache-slice";
import { store } from "@/lib/state/store";

const backendApiBaseUrl =
  process.env.BACKEND_API_BASE_URL ??
  process.env.NEXT_PUBLIC_BACKEND_API_BASE_URL ??
  "http://127.0.0.1:8000/api/v1";

const GET_CACHE_TTL_MS = 1000 * 60 * 5;
const ENABLE_API_LATENCY_LOGS =
  process.env.NEXT_PUBLIC_API_LATENCY_LOGS === "true" || process.env.NODE_ENV !== "production";
const PORTAL_AUTH_STORAGE_KEY = "bahu_portal_session";
const PORTAL_ME_STORAGE_KEY = "bahu_portal_me";
const PORTAL_ME_TTL_MS = 1000 * 60 * 5;
let refreshInFlight: Promise<string> | null = null;
let meInFlight: Promise<Record<string, unknown>> | null = null;
const inFlightGetRequests = new Map<string, Promise<unknown>>();

type PortalSession = {
  portal: string;
  accessToken: string;
  refreshToken: string;
};

type PortalMeCache = {
  accessToken: string;
  cachedAt: number;
  payload: Record<string, unknown>;
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") as Record<string, unknown>[] : [];
}

function formatBackendDetail(detail: unknown): string {
  if (typeof detail === "string") {
    return detail;
  }
  if (Array.isArray(detail)) {
    const parts = detail
      .map((entry) => {
        const obj = asObject(entry);
        const loc = Array.isArray(obj.loc) ? obj.loc.join(".") : "";
        const msg = typeof obj.msg === "string" ? obj.msg : "";
        if (loc && msg) {
          return `${loc}: ${msg}`;
        }
        if (msg) {
          return msg;
        }
        return "";
      })
      .filter(Boolean);
    return parts.join("; ");
  }
  return "";
}

async function requestBackend(path: string, init?: RequestInit) {
  const method = String(init?.method ?? "GET").toUpperCase();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const cacheKey = normalizedPath;
  const isBrowser = typeof window !== "undefined";
  const start = nowMs();

  if (isBrowser && method === "GET") {
    const entry = store.getState().apiCache.entries[cacheKey];
    if (entry && Date.now() - entry.cachedAt <= GET_CACHE_TTL_MS) {
      logApiLatency(method, normalizedPath, nowMs() - start, "cache");
      return cloneData(entry.data);
    }

    const inFlight = inFlightGetRequests.get(cacheKey);
    if (inFlight) {
      logApiPhase(method, normalizedPath, "dedupe-wait", nowMs() - start);
      return cloneData(await inFlight);
    }
  }

  const execute = async () => {
    const response = await fetchWithPortalAuth(normalizedPath, init);
    const networkDoneAt = nowMs();
    logApiLatency(method, normalizedPath, networkDoneAt - start, "network", response.status);

    if (!response.ok) {
      let detail = "";
      try {
        const parseStart = nowMs();
        const body = asObject(await response.json());
        logApiPhase(method, normalizedPath, "error-parse", nowMs() - parseStart, response.status);
        detail = formatBackendDetail(body.detail);
      } catch {
        detail = "";
      }

      throw new Error(detail || `Backend request failed: ${response.status} ${path}`);
    }

    const parseStart = nowMs();
    const payload = await response.json();
    const parseDoneAt = nowMs();
    logApiPhase(method, normalizedPath, "parse", parseDoneAt - parseStart, response.status);
    logApiPhase(method, normalizedPath, "request-total", parseDoneAt - start, response.status);

    if (isBrowser && method === "GET") {
      store.dispatch(upsertEntry({ key: cacheKey, data: payload }));
    } else if (isBrowser) {
      store.dispatch(invalidateByPrefixes(resolveInvalidationPrefixes(normalizedPath)));
    }

    return payload;
  };

  if (isBrowser && method === "GET") {
    const promise = execute();
    inFlightGetRequests.set(cacheKey, promise);
    try {
      return cloneData(await promise);
    } finally {
      inFlightGetRequests.delete(cacheKey);
    }
  }

  return execute();
}

function readAccessToken(): string {
  return readPortalSession().accessToken;
}

function readPortalSession(): PortalSession {
  if (typeof window === "undefined") {
    return { portal: "", accessToken: "", refreshToken: "" };
  }
  try {
    const raw = window.localStorage.getItem(PORTAL_AUTH_STORAGE_KEY);
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

function writePortalSession(session: PortalSession) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(PORTAL_AUTH_STORAGE_KEY, JSON.stringify(session));
}

function readPortalMeCache(): PortalMeCache | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(PORTAL_ME_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = asObject(JSON.parse(raw));
    const accessToken = typeof parsed.accessToken === "string" ? parsed.accessToken : "";
    const cachedAt = typeof parsed.cachedAt === "number" ? parsed.cachedAt : Number(parsed.cachedAt);
    const payload = asObject(parsed.payload);
    if (!accessToken || !Number.isFinite(cachedAt)) {
      return null;
    }
    return { accessToken, cachedAt, payload };
  } catch {
    return null;
  }
}

function writePortalMeCache(payload: Record<string, unknown>) {
  if (typeof window === "undefined") {
    return;
  }
  const accessToken = readAccessToken();
  if (!accessToken) {
    return;
  }
  window.localStorage.setItem(
    PORTAL_ME_STORAGE_KEY,
    JSON.stringify({
      accessToken,
      cachedAt: Date.now(),
      payload,
    } satisfies PortalMeCache)
  );
}

function clearPortalMeCache() {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(PORTAL_ME_STORAGE_KEY);
}

function readCachedPortalMe(): Record<string, unknown> | null {
  const cache = readPortalMeCache();
  const accessToken = readAccessToken();
  if (!cache || !accessToken || cache.accessToken !== accessToken) {
    return null;
  }
  if (Date.now() - cache.cachedAt > PORTAL_ME_TTL_MS) {
    return null;
  }
  return cache.payload;
}

function clearPortalSession() {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(PORTAL_AUTH_STORAGE_KEY);
  clearPortalMeCache();
}

async function refreshPortalSession(): Promise<string> {
  if (typeof window === "undefined") {
    throw new Error("Refresh unavailable on server");
  }
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    const session = readPortalSession();
    if (!session.refreshToken || !session.portal) {
      clearPortalSession();
      throw new Error("Session expired");
    }

    const response = await fetch(`${backendApiBaseUrl}/auth/refresh`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify({ refresh_token: session.refreshToken }),
    });

    if (!response.ok) {
      clearPortalSession();
      throw new Error("Session expired");
    }

    const payload = asObject(await response.json().catch(() => ({})));
    const accessToken = typeof payload.access_token === "string" ? payload.access_token : "";
    const refreshToken = typeof payload.refresh_token === "string" ? payload.refresh_token : "";
    if (!accessToken || !refreshToken) {
      clearPortalSession();
      throw new Error("Session expired");
    }

    writePortalSession({
      portal: session.portal,
      accessToken,
      refreshToken,
    });
    clearPortalMeCache();
    return accessToken;
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

function buildAuthorizedHeaders(headers: HeadersInit | undefined, token: string): Headers {
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

async function fetchWithPortalAuth(path: string, init?: RequestInit): Promise<Response> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const makeRequest = (token: string) =>
    fetch(`${backendApiBaseUrl}${normalizedPath}`, {
      ...init,
      headers: buildAuthorizedHeaders(init?.headers, token),
      cache: "no-store",
    });

  let response = await makeRequest(readAccessToken());
  const shouldRefresh =
    typeof window !== "undefined" &&
    response.status === 401 &&
    normalizedPath !== "/auth/refresh" &&
    normalizedPath !== "/auth/login";

  if (!shouldRefresh) {
    return response;
  }

  try {
    const nextToken = await refreshPortalSession();
    response = await makeRequest(nextToken);
  } catch {
    clearPortalSession();
  }

  return response;
}

async function fetchPortalMe(options?: { force?: boolean }) {
  const force = options?.force ?? false;
  if (!force) {
    const cached = readCachedPortalMe();
    if (cached) {
      return cached;
    }
  }

  if (!force && meInFlight) {
    return meInFlight;
  }

  meInFlight = (async () => {
    const response = await fetchWithPortalAuth("/auth/me", { method: "GET" });
    if (!response.ok) {
      throw new Error("Failed to fetch session");
    }
    const payload = asObject(await response.json().catch(() => ({})));
    writePortalMeCache(payload);
    return payload;
  })();

  try {
    return await meInFlight;
  } finally {
    meInFlight = null;
  }
}

function resolveInvalidationPrefixes(path: string): string[] {
  const cleanPath = path.split("?")[0] ?? path;
  const segments = cleanPath.split("/").filter(Boolean);
  if (segments.length < 2) {
    return [cleanPath];
  }

  const primary = `/${segments[0]}/${segments[1]}`;
  const prefixes = new Set<string>([primary]);

  if (primary === "/masters/warehouses" || primary === "/masters/racks") {
    prefixes.add("/masters/warehouses");
    prefixes.add("/masters/racks");
  }

  if (primary.startsWith("/procurement/")) {
    prefixes.add("/procurement/reorder-logs");
    prefixes.add("/procurement/purchase-challans");
    prefixes.add("/procurement/purchase-bills");
  }

  return [...prefixes];
}

function cloneData<T>(data: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(data);
  }
  return JSON.parse(JSON.stringify(data)) as T;
}

function nowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function logApiLatency(
  method: string,
  path: string,
  durationMs: number,
  source: "cache" | "network",
  statusCode?: number
) {
  if (typeof window === "undefined" || !ENABLE_API_LATENCY_LOGS) {
    return;
  }
  const statusText = typeof statusCode === "number" ? ` [${statusCode}]` : "";
  console.info(`[api:${source}] ${method} ${path}${statusText} - ${durationMs.toFixed(1)}ms`);
}

function logApiPhase(method: string, path: string, phase: string, durationMs: number, statusCode?: number) {
  if (typeof window === "undefined" || !ENABLE_API_LATENCY_LOGS) {
    return;
  }
  const statusText = typeof statusCode === "number" ? ` [${statusCode}]` : "";
  console.info(`[api:${phase}] ${method} ${path}${statusText} - ${durationMs.toFixed(1)}ms`);
}

function logFrontendViewLatency(label: string, startMs: number, meta?: Record<string, unknown>) {
  if (typeof window === "undefined" || !ENABLE_API_LATENCY_LOGS) {
    return;
  }
  const durationMs = nowMs() - startMs;
  const suffix =
    meta && Object.keys(meta).length > 0
      ? ` ${Object.entries(meta)
          .map(([key, value]) => `${key}=${String(value)}`)
          .join(" ")}`
      : "";
  console.info(`[ui:view] ${label} - ${durationMs.toFixed(1)}ms${suffix}`);
}

async function fetchBackend(path: string) {
  return requestBackend(path, { method: "GET" });
}

async function fetchBackendFresh(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const response = await fetchWithPortalAuth(normalizedPath, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    let detail = "";
    try {
      const body = asObject(await response.json());
      detail = formatBackendDetail(body.detail);
    } catch {
      detail = "";
    }
    throw new Error(detail || `Backend request failed: ${response.status} ${normalizedPath}`);
  }

  return response.json();
}

async function postBackend(path: string, body: Record<string, unknown>) {
  return requestBackend(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function postBackendForm(path: string, body: FormData) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const start = nowMs();
  const response = await fetchWithPortalAuth(normalizedPath, {
    method: "POST",
    body,
  });
  logApiLatency("POST", normalizedPath, nowMs() - start, "network", response.status);

  if (!response.ok) {
    let detail = "";
    try {
      const payload = asObject(await response.json());
      detail = formatBackendDetail(payload.detail);
    } catch {
      detail = "";
    }
    throw new Error(detail || `Backend request failed: ${response.status} ${normalizedPath}`);
  }

  const payload = await response.json();
  if (typeof window !== "undefined") {
    store.dispatch(invalidateByPrefixes(resolveInvalidationPrefixes(normalizedPath)));
  }
  return payload;
}

async function patchBackend(path: string, body: Record<string, unknown>) {
  return requestBackend(path, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function deleteBackend(path: string) {
  return requestBackend(path, {
    method: "DELETE",
  });
}

export {
  PORTAL_AUTH_STORAGE_KEY,
  asArray,
  asObject,
  backendApiBaseUrl,
  clearPortalSession,
  readCachedPortalMe,
  deleteBackend,
  fetchBackend,
  fetchBackendFresh,
  fetchPortalMe,
  fetchWithPortalAuth,
  patchBackend,
  postBackend,
  postBackendForm,
  readPortalSession,
  refreshPortalSession,
  logFrontendViewLatency,
  nowMs,
  writePortalSession,
};
