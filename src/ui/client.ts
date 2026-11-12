import { classify, type UiState } from "./contract";

export type ApiRequest = {
  method: "GET" | "POST" | "PATCH";
  /** Path below /api/admin/v1/, without a leading slash. */
  path: string;
  body?: unknown;
  csrf?: string;
};
export type RawResponse = {
  status: number;
  body: unknown;
  retryAfter: string | null;
};
export type Transport = (request: ApiRequest) => Promise<RawResponse>;

export const API_PREFIX = "/api/admin/v1/";

/** Same-origin transport. Cookies are HttpOnly and never read here. */
export const httpTransport: Transport = async ({ method, path, body, csrf }) => {
  const headers: Record<string, string> = { accept: "application/json" };
  if (method !== "GET") headers["content-type"] = "application/json";
  if (csrf) headers["x-csrf-token"] = csrf;
  const response = await fetch(API_PREFIX + path, {
    method,
    headers,
    credentials: "same-origin",
    cache: "no-store",
    redirect: "manual",
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
  });
  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }
  return {
    status: response.status,
    body: parsed,
    retryAfter: response.headers.get("retry-after"),
  };
};

/** One request, one UI state. A thrown transport error is an unknown outcome. */
export async function call(
  transport: Transport,
  request: ApiRequest,
): Promise<UiState> {
  try {
    const r = await transport(request);
    return classify(r.status, r.body, r.retryAfter);
  } catch {
    return { kind: "uncertain" };
  }
}
