export type ServiceResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  details?: unknown;
};

export class ServiceRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ServiceRequestError';
  }
}

function getInternalSecret(): string {
  const secret = process.env.INTERNAL_SERVICE_SECRET;
  if (!secret) {
    throw new Error('INTERNAL_SERVICE_SECRET is required for inter-service calls');
  }
  return secret;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as ServiceResponse<T>;
  if (!response.ok || !payload.success || payload.data === undefined) {
    throw new ServiceRequestError(
      response.status,
      payload.error ?? `Service request failed: ${response.status}`,
      payload.code,
      payload.details,
    );
  }
  return payload.data;
}

function internalHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-Internal-Key': getInternalSecret(),
  };
}

export async function internalGet<T>(baseUrl: string, path: string): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'GET',
    headers: internalHeaders(),
  });
  return parseResponse<T>(response);
}

export async function internalPost<T>(baseUrl: string, path: string, body: unknown): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: internalHeaders(),
    body: JSON.stringify(body),
  });
  return parseResponse<T>(response);
}

export async function internalPut<T>(baseUrl: string, path: string, body: unknown): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'PUT',
    headers: internalHeaders(),
    body: JSON.stringify(body),
  });
  return parseResponse<T>(response);
}

export async function internalPatch<T>(baseUrl: string, path: string, body: unknown): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'PATCH',
    headers: internalHeaders(),
    body: JSON.stringify(body),
  });
  return parseResponse<T>(response);
}

export async function internalDelete<T>(baseUrl: string, path: string): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'DELETE',
    headers: internalHeaders(),
  });
  return parseResponse<T>(response);
}
