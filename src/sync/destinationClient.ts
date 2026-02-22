import type { SyncConfig } from './types';

export interface DestinationResponse {
  statusCode: number;
  body: unknown;
  error?: unknown;
}

/** Extract a message string from an error (robust for SES where instanceof Error can fail). */
function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err) return String((err as any).message);
  if (typeof err === 'string') return err;
  return String(err);
}

function isNullBodyError(err: unknown): boolean {
  const msg = getErrorMessage(err);
  return msg.includes('null body status') || msg.includes('null body');
}

function isNullBodyErrorString(error: string | undefined): boolean {
  if (!error) return false;
  return error.includes('null body status') || error.includes('null body');
}

/** Try to extract an HTTP status code from a thrown gateway error. */
function extractStatusFromError(err: unknown): number {
  const msg = getErrorMessage(err);
  if (msg.includes('403') || msg.toLowerCase().includes('forbidden')) return 403;
  if (msg.includes('401') || msg.toLowerCase().includes('unauthorized')) return 401;

  // Check if the error object itself has a status field
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    if (typeof e.status === 'number') return e.status;
    if (typeof e.statusCode === 'number') return e.statusCode;
  }
  return 0;
}

export async function parseResponse(raw: unknown): Promise<DestinationResponse> {
  try {
    const r = raw as Record<string, unknown>;

    if (typeof r.statusCode === 'number') {
      // Gateway may wrap a null-body error into the response object itself
      // e.g. { statusCode: 0, error: "Failed to construct 'Response': Response with null body status cannot have body" }
      const rawError = r.error != null ? String(r.error) : '';
      if (rawError.includes('null body status') || rawError.includes('null body')) {
        return { statusCode: 204, body: null };
      }

      let body = r.body;
      if (typeof body === 'string') {
        // Body may also contain the null-body error as a string
        if (body.includes('null body status') || body.includes('null body')) {
          return { statusCode: 204, body: null };
        }
        if (body.length > 0) {
          try { body = JSON.parse(body); } catch { /* keep as string */ }
        }
      }
      return { statusCode: r.statusCode as number, body, error: r.error };
    }

    const text = typeof (r as any).text === 'function'
      ? await (r as any).text().catch(() => '')
      : '';

    if (!text) return { statusCode: 204, body: null };
    return JSON.parse(text) as DestinationResponse;
  } catch (err) {
    const msg = getErrorMessage(err);
    if (msg.includes('null body status') || msg.includes('null body')) {
      return { statusCode: 204, body: null };
    }
    return { statusCode: 0, body: null, error: msg };
  }
}

export function formatError(body: unknown): string {
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

export interface DestinationResult {
  status: number;
  body?: unknown;
  error?: string;
}

export async function destinationGet(
  path: string,
  config: SyncConfig
): Promise<DestinationResult> {
  try {
    const response = await PIM.api.external.call({
      method: 'GET',
      url: `${config.env2Host}/api/rest/v1${path}`,
      headers: { 'Content-Type': 'application/json' },
      credentials_code: config.credentialsCode,
    } as any);

    const res = await parseResponse(response);
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return { status: res.statusCode, body: res.body };
    }
    return { status: res.statusCode, error: formatError(res.body ?? res.error) };
  } catch (err) {
    // For GET requests, null body is NOT a success — it's likely a 403 or other error
    // from the gateway that couldn't construct a Response object.
    const status = extractStatusFromError(err);
    return { status, error: getErrorMessage(err) };
  }
}

export async function destinationPatch(
  path: string,
  body: unknown,
  config: SyncConfig
): Promise<DestinationResult> {
  try {
    const response = await PIM.api.external.call({
      method: 'PATCH',
      url: `${config.env2Host}/api/rest/v1${path}`,
      headers: { 'Content-Type': 'application/json' },
      body,
      credentials_code: config.credentialsCode,
    } as any);

    const res = await parseResponse(response);
    if (res.statusCode === 201 || res.statusCode === 204) {
      return { status: res.statusCode, body: res.body };
    }
    const errorMsg = formatError(res.body ?? res.error);
    if (isNullBodyErrorString(errorMsg)) return { status: 204 };
    return { status: res.statusCode, error: errorMsg };
  } catch (err) {
    if (isNullBodyError(err)) return { status: 204 };
    return { status: 0, error: getErrorMessage(err) };
  }
}

export async function destinationPost(
  path: string,
  body: unknown,
  config: SyncConfig
): Promise<DestinationResult> {
  try {
    const response = await PIM.api.external.call({
      method: 'POST',
      url: `${config.env2Host}/api/rest/v1${path}`,
      headers: { 'Content-Type': 'application/json' },
      body,
      credentials_code: config.credentialsCode,
    } as any);

    const res = await parseResponse(response);
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return { status: res.statusCode, body: res.body };
    }
    const errorMsg = formatError(res.body ?? res.error);
    if (isNullBodyErrorString(errorMsg)) return { status: 204 };
    return { status: res.statusCode, error: errorMsg };
  } catch (err) {
    if (isNullBodyError(err)) return { status: 204 };
    return { status: 0, error: getErrorMessage(err) };
  }
}
