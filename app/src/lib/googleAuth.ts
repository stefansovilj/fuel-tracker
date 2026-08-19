declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; expires_in?: number; error?: string; error_description?: string }) => void;
            error_callback?: (error: { type?: string; message?: string }) => void;
          }): { requestAccessToken: (overrideConfig?: { prompt?: string }) => void };
        };
      };
    };
  }
}

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const TOKEN_STORAGE_KEY = 'fuel-tracker:googleToken';

let gisLoadPromise: Promise<void> | null = null;

function loadGis(): Promise<void> {
  if (gisLoadPromise) return gisLoadPromise;

  gisLoadPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services.'));
    document.head.appendChild(script);
  });

  return gisLoadPromise;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

function readStoredToken(): CachedToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedToken>;
    if (typeof parsed.accessToken !== 'string' || typeof parsed.expiresAt !== 'number') return null;
    return parsed as CachedToken;
  } catch {
    return null;
  }
}

function writeStoredToken(token: CachedToken | null) {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(token));
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

// Persisted (not just in-memory) so a page refresh — or reopening the app later, within the
// token's ~1 hour lifetime — can keep syncing without needing a fresh sign-in popup. A popup can
// only ever be triggered by a direct click, so once this expires, auto-sync just goes quiet until
// the user reconnects; it can't silently refresh itself in the background.
let cachedToken: CachedToken | null = readStoredToken();

export function getCachedToken(): string | null {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.accessToken;
  }
  return null;
}

export function isConnected(): boolean {
  return getCachedToken() !== null;
}

export function disconnect() {
  cachedToken = null;
  writeStoredToken(null);
}

export async function ensureAccessToken(clientId: string): Promise<string> {
  const existing = getCachedToken();
  if (existing) return existing;

  if (!clientId || !clientId.trim()) {
    throw new Error('Set a Google OAuth Client ID in Settings first.');
  }

  await loadGis();

  return new Promise<string>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId.trim(),
      scope: SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error_description || response.error || 'Sign-in failed.'));
          return;
        }
        const token: CachedToken = {
          accessToken: response.access_token,
          expiresAt: Date.now() + Number(response.expires_in ?? 3600) * 1000,
        };
        cachedToken = token;
        writeStoredToken(token);
        resolve(token.accessToken);
      },
      error_callback: (error) => {
        reject(new Error(error?.message || 'Google sign-in failed or was cancelled.'));
      },
    });
    client.requestAccessToken();
  });
}
