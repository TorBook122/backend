/** Render hostport values look like `torbook-shared:3002` — fetch needs a protocol. */
export function normalizeServiceUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/+$/, '');
  }

  return `http://${trimmed}`.replace(/\/+$/, '');
}

export function buildServiceUrl(baseUrl: string, path: string): string {
  const normalizedBase = normalizeServiceUrl(baseUrl);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}
