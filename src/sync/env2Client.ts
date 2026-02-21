import type { SyncConfig } from './types';

interface PushResult {
  status: number;
  error?: string;
}

interface ExternalResponse {
  statusCode: number;
  body: unknown;
  error?: unknown;
}

async function parseResponse(raw: unknown): Promise<ExternalResponse> {
  try {
    const text = await (raw as { text: () => Promise<string> }).text();
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
  uuid: string
): Promise<PushResult> {
  if (!uuid) return { status: 0, error: 'Product has no UUID — cannot sync.' };

  try {
    const raw = await globalThis.PIM.api.external.call({
      method: 'PATCH',
      url: `${config.env2Host}/api/rest/v1/products-uuid/${encodeURIComponent(uuid)}`,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials_code: config.credentialsCode,
    });

    const res = await parseResponse(raw);
    if (res.statusCode === 201 || res.statusCode === 204) return { status: res.statusCode };
    return { status: res.statusCode, error: formatError(res.body ?? res.error) };
  } catch (err) {
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
    const raw = await globalThis.PIM.api.external.call({
      method: 'PATCH',
      url: `${config.env2Host}/api/rest/v1/product-models/${encodeURIComponent(code)}`,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials_code: config.credentialsCode,
    });

    const res = await parseResponse(raw);
    if (res.statusCode === 201 || res.statusCode === 204) return { status: res.statusCode };
    return { status: res.statusCode, error: formatError(res.body ?? res.error) };
  } catch (err) {
    return { status: 0, error: err instanceof Error ? err.message : String(err) };
  }
}
