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

export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401 && _onUnauthorized) {
    _onUnauthorized();
  }
  return res;
}
