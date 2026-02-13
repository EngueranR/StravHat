function normalizeApiBaseUrl(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.includes('${{')) {
    return null;
  }

  const unquoted = trimmed.replace(/^['"]|['"]$/g, '');
  return unquoted.replace(/\/+$/, '');
}

const configuredApiUrl = normalizeApiBaseUrl(import.meta.env.VITE_API_URL);
const API_URL =
  configuredApiUrl ?? (
    import.meta.env.DEV ? 'http://localhost:3001/api' : `${window.location.origin}/api`
  );

interface ApiOptions {
  method?: string;
  token?: string | null;
  body?: unknown;
  headers?: Record<string, string>;
}

export async function apiRequest<T>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers ?? {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed (${response.status})`);
  }

  return (await response.json()) as T;
}

export function buildApiUrl(path: string) {
  return `${API_URL}${path}`;
}
