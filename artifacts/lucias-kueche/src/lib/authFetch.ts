let _onUnauthorized: (() => void) | null = null;

export function registerUnauthorizedHandler(handler: () => void) {
  _onUnauthorized = handler;
}

export function getToken(): string | null {
  try {
    return localStorage.getItem("lk_auth_token");
  } catch {
    return null;
  }
}

export function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getToken();
  const base: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  return extra ? { ...base, ...extra } : base;
}

export interface AuthFetchOptions extends RequestInit {
  skipUnauthorizedHandler?: boolean;
}

export async function authFetch(input: RequestInfo | URL, init?: AuthFetchOptions): Promise<Response> {
  const { skipUnauthorizedHandler, ...fetchInit } = init ?? {};
  const res = await fetch(input, fetchInit);
  if (res.status === 401 && !skipUnauthorizedHandler && _onUnauthorized) {
    _onUnauthorized();
  }
  return res;
}
