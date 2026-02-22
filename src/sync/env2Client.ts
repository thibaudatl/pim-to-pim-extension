import type { SyncConfig } from './types';

interface PushResult {
  status: number;
  error?: string;
}

/** The SDK throws this when it gets a 204 and tries to construct a Response with a body */
function isNullBodyError(err: unknown): boolean {
  return err instanceof Error && err.message.includes('null body status');
}

interface ExternalResponse {
  statusCode: number;
  body: unknown;
  error?: unknown;
}

async function parseResponse(raw: unknown): Promise<ExternalResponse> {
  try {
    const r = raw as Record<string, unknown>;

    // The gateway may return a plain object with statusCode directly
    if (typeof r.statusCode === 'number') {
      return r as unknown as ExternalResponse;
    }

    // Or a Response-like object — read text safely
    const text = typeof (r as any).text === 'function'
      ? await (r as any).text().catch(() => '')
      : '';

    console.log('[sync] response:', text);
    if (!text) return { statusCode: 204, body: null };
    return JSON.parse(text) as ExternalResponse;
  } catch {
    return { statusCode: 0, body: null, error: 'Failed to parse gateway response' };
  }
}

function formatError(body: unknown): string {
  if (!body) return 'Unknown error';
  if (typeof body === 'string') return body;
  if (typeof body === 'object') {
    const b = body as Record<string, unknown>;
    if (typeof b.message === 'string') {
      if (Array.isArray(b.errors) && b.errors.length > 0) {
        const details = (b.errors as Record<string, unknown>[])
          .map((e) => `${e.property ?? ''}: ${e.message ?? ''}`.trim())
          .join(', ');
        return `${b.message} — ${details}`;
      }
      return b.message;
    }
    return JSON.stringify(body);
  }
  return String(body);
}

export async function pushProduct(
  payload: Record<string, unknown>,
  config: SyncConfig,
  identifier: string
): Promise<PushResult> {
  if (!identifier) return { status: 0, error: 'Product has no identifier — cannot sync.' };

  try {
    const response = await PIM.api.external.call({
      method: 'PATCH',
      url: `${config.env2Host}/api/rest/v1/products/${encodeURIComponent(identifier)}`,
      headers: {
        'Content-Type': 'application/json',
      },
      body: payload,
      credentials_code: config.credentialsCode,
    } as any);

    const res = await parseResponse(response);
    if (res.statusCode === 201 || res.statusCode === 204) return { status: res.statusCode };
    return { status: res.statusCode, error: formatError(res.body ?? res.error) };
  } catch (err) {
    if (isNullBodyError(err)) return { status: 204 };
    return { status: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function pushProductModel(
  payload: Record<string, unknown>,
  config: SyncConfig
): Promise<PushResult> {
  const code = payload.code as string | undefined;
  if (!code) return { status: 0, error: 'Product model has no code — cannot sync.' };

  try {
    const response = await PIM.api.external.call({
      method: 'PATCH',
      url: `${config.env2Host}/api/rest/v1/product-models/${code}`,
      headers: {
        'Content-Type': 'application/json',
      },
      body: payload,
      credentials_code: config.credentialsCode,
    } as any);

    const res = await parseResponse(response);
    if (res.statusCode === 201 || res.statusCode === 204) return { status: res.statusCode };
    return { status: res.statusCode, error: formatError(res.body ?? res.error) };
  } catch (err) {
    if (isNullBodyError(err)) return { status: 204 };
    return { status: 0, error: err instanceof Error ? err.message : String(err) };
  }
}
