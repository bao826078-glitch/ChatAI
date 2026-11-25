// In-memory Bearer session token (never stored in localStorage/sessionStorage)
let sessionToken: string | null = null;
let sessionInitPromise: Promise<any> | null = null;

export function getSessionToken(): string | null {
  return sessionToken;
}

export function setSessionToken(token: string | null): void {
  sessionToken = token;
}

export async function initSession(): Promise<any> {
  if (sessionInitPromise) return sessionInitPromise;

  sessionInitPromise = (async () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (sessionToken) {
      headers['Authorization'] = `Bearer ${sessionToken}`;
    }
    const res = await fetch('/api/session', {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (data.ok && data.token) {
      sessionToken = data.token;
    }
    return data;
  })().finally(() => {
    sessionInitPromise = null;
  });

  return sessionInitPromise;
}

export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  if (!sessionToken) {
    await initSession();
  }

  const headers = new Headers(init.headers || {});
  if (sessionToken) {
    headers.set('Authorization', `Bearer ${sessionToken}`);
  }
  if (init.body && !headers.has('Content-Type') && typeof init.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  let response = await fetch(input, { ...init, headers });

  if (response.status === 401) {
    sessionToken = null;
    await initSession();
    const retryHeaders = new Headers(init.headers || {});
    if (sessionToken) {
      retryHeaders.set('Authorization', `Bearer ${sessionToken}`);
    }
    if (init.body && !retryHeaders.has('Content-Type') && typeof init.body === 'string') {
      retryHeaders.set('Content-Type', 'application/json');
    }
    response = await fetch(input, { ...init, headers: retryHeaders });
  }

  return response;
}
