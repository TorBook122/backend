import {
  getMorningApiBaseUrl,
  getMorningClientId,
  getMorningClientSecret,
  getMorningOAuthBaseUrl,
} from '../config/morning.config.js';

type OAuthTokenResponse = {
  accessToken?: string;
  access_token?: string;
  expiresAt?: number;
  expires_in?: number;
  token_type?: string;
  tokenType?: string;
};

type MorningClientInput = {
  name: string;
  email?: string;
  phone?: string;
};

type MorningCreditCardToken = {
  id: string;
};

let cachedToken: { value: string; expiresAt: number } | null = null;

async function fetchJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => ({}))) as T & { message?: string; error?: string };
  if (!response.ok) {
    const message = body.message ?? body.error ?? `Morning API error (${response.status})`;
    throw new Error(message);
  }
  return body;
}

export async function getAccessToken(): Promise<string> {
  if (process.env.E2E_MORNING_MOCK === 'true') {
    return 'e2e-morning-access-token';
  }

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.value;
  }

  const data = await fetchJson<OAuthTokenResponse>(`${getMorningOAuthBaseUrl()}/idp/v1/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: getMorningClientId(),
      client_secret: getMorningClientSecret(),
    }),
  });

  const accessToken = data.accessToken ?? data.access_token;
  if (!accessToken) {
    throw new Error('Morning OAuth response missing access token');
  }

  const expiresAtMs = data.expiresAt
    ? data.expiresAt * 1000
    : now + (data.expires_in ?? 3600) * 1000;

  cachedToken = {
    value: accessToken,
    expiresAt: expiresAtMs,
  };
  return accessToken;
}

async function authorizedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(`${getMorningApiBaseUrl()}${path}`, { ...init, headers });
}

export async function createPaymentForm(payload: Record<string, unknown>): Promise<{ paymentUrl: string }> {
  if (process.env.E2E_MORNING_MOCK === 'true') {
    const checkoutRef = typeof payload.custom === 'string' ? payload.custom : 'e2e-checkout';
    return {
      paymentUrl: `${process.env.FRONTEND_BASE_URL ?? 'http://localhost:3000'}/upgrade/success?ref=${checkoutRef}`,
    };
  }

  const response = await authorizedFetch('/payments/form', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const body = (await response.json().catch(() => ({}))) as {
    url?: string;
    paymentUrl?: string;
    message?: string;
    error?: string;
    errorMessage?: string;
  };
  if (!response.ok) {
    const message =
      body.errorMessage ??
      body.message ??
      body.error ??
      (response.status === 403
        ? 'Morning rejected the payment form request (often localhost notifyUrl — set MORNING_WEBHOOK_BASE_URL)'
        : `Morning payment form error (${response.status})`);
    throw new Error(message);
  }
  const paymentUrl = body.paymentUrl ?? body.url;
  if (!paymentUrl) {
    throw new Error('Morning payment form response missing payment URL');
  }
  return { paymentUrl };
}

export async function searchCreditCardTokens(input: {
  externalKey: string;
}): Promise<MorningCreditCardToken[]> {
  if (process.env.E2E_MORNING_MOCK === 'true') {
    return [{ id: `e2e-token-${input.externalKey}` }];
  }

  const response = await authorizedFetch('/payments/tokens/search', {
    method: 'POST',
    body: JSON.stringify({ externalKey: input.externalKey }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    items?: MorningCreditCardToken[];
    data?: MorningCreditCardToken[];
    message?: string;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(body.message ?? body.error ?? `Morning token search error (${response.status})`);
  }
  return body.items ?? body.data ?? [];
}

export async function chargeCreditCardToken(
  tokenId: string,
  payload: Record<string, unknown>,
): Promise<{ documentId?: string }> {
  if (process.env.E2E_MORNING_MOCK === 'true') {
    return { documentId: `e2e-doc-${tokenId}` };
  }

  const response = await authorizedFetch(`/payments/tokens/${encodeURIComponent(tokenId)}/charge`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const body = (await response.json().catch(() => ({}))) as {
    documentId?: string;
    id?: string;
    message?: string;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(body.message ?? body.error ?? `Morning token charge error (${response.status})`);
  }
  return { documentId: body.documentId ?? body.id };
}

export async function findOrCreateClient(input: MorningClientInput): Promise<{ id: string }> {
  if (process.env.E2E_MORNING_MOCK === 'true') {
    return { id: 'e2e-morning-client' };
  }

  const searchResponse = await authorizedFetch('/clients/search', {
    method: 'POST',
    body: JSON.stringify({
      page: 1,
      pageSize: 1,
      name: input.name,
      ...(input.email ? { emails: [input.email] } : {}),
    }),
  });
  const searchBody = (await searchResponse.json().catch(() => ({}))) as {
    items?: Array<{ id: string }>;
    data?: Array<{ id: string }>;
    message?: string;
    error?: string;
  };
  if (!searchResponse.ok) {
    throw new Error(searchBody.message ?? searchBody.error ?? `Morning client search error (${searchResponse.status})`);
  }
  const existing = searchBody.items?.[0] ?? searchBody.data?.[0];
  if (existing?.id) {
    const updateResponse = await authorizedFetch(`/clients/${encodeURIComponent(existing.id)}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: input.name,
        ...(input.email ? { emails: [input.email] } : {}),
        ...(input.phone ? { phone: input.phone } : {}),
      }),
    });
    if (!updateResponse.ok) {
      const updateBody = (await updateResponse.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
        errorMessage?: string;
      };
      throw new Error(
        updateBody.errorMessage ??
          updateBody.message ??
          updateBody.error ??
          `Morning client update error (${updateResponse.status})`,
      );
    }
    return { id: existing.id };
  }

  const createResponse = await authorizedFetch('/clients', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name,
      ...(input.email ? { emails: [input.email] } : {}),
      ...(input.phone ? { phone: input.phone } : {}),
    }),
  });
  const createBody = (await createResponse.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
    error?: string;
  };
  if (!createResponse.ok || !createBody.id) {
    throw new Error(createBody.message ?? createBody.error ?? `Morning client create error (${createResponse.status})`);
  }
  return { id: createBody.id };
}

export async function searchDocuments(input: {
  page?: number;
  pageSize?: number;
  type?: number | number[];
  clientId?: string;
}): Promise<Array<{ id: string; amount?: number; description?: string; client?: { id?: string } }>> {
  if (process.env.E2E_MORNING_MOCK === 'true') {
    return [];
  }

  const response = await authorizedFetch('/documents/search', {
    method: 'POST',
    body: JSON.stringify({
      page: input.page ?? 1,
      pageSize: input.pageSize ?? 10,
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.clientId ? { clientId: input.clientId } : {}),
    }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    items?: Array<{ id: string; amount?: number; description?: string; client?: { id?: string } }>;
    data?: Array<{ id: string; amount?: number; description?: string; client?: { id?: string } }>;
    message?: string;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(body.message ?? body.error ?? `Morning document search error (${response.status})`);
  }
  return body.items ?? body.data ?? [];
}

export function resetMorningTokenCacheForTests(): void {
  cachedToken = null;
}

export const morningClient = {
  getAccessToken,
  createPaymentForm,
  searchCreditCardTokens,
  chargeCreditCardToken,
  findOrCreateClient,
  searchDocuments,
};
