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

function safeStringify(val: unknown): string {
  try {
    return JSON.stringify(val)?.slice(0, 300) ?? 'undefined';
  } catch {
    return String(val);
  }
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

    // 1. Gateway-wrapped response: { statusCode: number, body: ... }
    if (typeof r.statusCode === 'number') {
      const rawError = r.error != null ? String(r.error) : '';
      if (rawError.includes('null body status') || rawError.includes('null body')) {
        return { statusCode: 204, body: null };
      }

      let body = r.body;
      if (typeof body === 'string') {
        if (body.includes('null body status') || body.includes('null body')) {
          return { statusCode: 204, body: null };
        }
        if (body.length > 0) {
          try { body = JSON.parse(body); } catch { /* keep as string */ }
        }
      }

      // Unwrap nested gateway wrappers (external.call may double-wrap the response)
      // e.g. outer { statusCode:200, body: { status:"success", statusCode:200, body: {actual}, ... } }
      while (body && typeof body === 'object' && !Array.isArray(body)) {
        const inner = body as Record<string, unknown>;
        if (typeof inner.statusCode === 'number' && 'body' in inner) {
          let nestedBody = inner.body;
          if (typeof nestedBody === 'string' && nestedBody.length > 0) {
            try { nestedBody = JSON.parse(nestedBody); } catch { /* keep as string */ }
          }
          body = nestedBody;
        } else {
          break;
        }
      }

      return { statusCode: r.statusCode as number, body, error: r.error };
    }

    // 2. Response-like objects (have .status and .text()/.json())
    const httpStatus = typeof r.status === 'number' ? (r.status as number) : 0;

    if (httpStatus > 0) {
      // Try .json() first (more reliable than .text() for parsed bodies)
      if (typeof (r as any).json === 'function') {
        try {
          const jsonBody = await (r as any).json();
          if (jsonBody != null) return { statusCode: httpStatus, body: jsonBody };
        } catch { /* fall through to .text() */ }
      }

      // Try .text()
      const text = typeof (r as any).text === 'function'
        ? await (r as any).text().catch(() => '')
        : '';

      if (text) {
        let body: unknown;
        try { body = JSON.parse(text); } catch { body = text; }
        return { statusCode: httpStatus, body };
      }

      return { statusCode: httpStatus, body: null };
    }

    // 3. Raw Akeneo API response (no gateway wrapping) — detect by known properties
    if (r._embedded || r._links || r.current_page !== undefined) {
      // Paginated list response returned directly
      return { statusCode: 200, body: raw };
    }
    if (typeof r.code === 'string') {
      // Single entity response returned directly
      return { statusCode: 200, body: raw };
    }

    // 4. Fallback: try .text() without httpStatus
    const text = typeof (r as any).text === 'function'
      ? await (r as any).text().catch(() => '')
      : '';
    if (text) {
      let body: unknown;
      try { body = JSON.parse(text); } catch { body = text; }
      return { statusCode: 200, body };
    }

    return { statusCode: 0, body: null, error: 'Unrecognized response format' };
  } catch (err) {
    const msg = getErrorMessage(err);
    if (msg.includes('null body status') || msg.includes('null body')) {
      return { statusCode: 204, body: null };
    }
    return { statusCode: 0, body: null, error: msg };
  }
}

export function formatError(body: unknown, statusCode?: number): string {
  if (!body) return statusCode ? `HTTP ${statusCode}` : 'Unknown error';
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

function isNetworkError(msg: string): boolean {
  const lower = msg.toLowerCase();
  return lower.includes('network error') || lower.includes('failed to fetch') || lower.includes('networkerror');
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Unwrap a gateway-wrapped body that parseResponse may return as-is.
 * The gateway wrapper looks like: { status: "success", statusCode: 200, body: {actual}, contentType, error }
 * When external.call returns a Response-like object, parseResponse uses .json() which gives us
 * the wrapper as the parsed body. This function extracts the actual inner body.
 */
export function unwrapGatewayBody(res: DestinationResponse): DestinationResponse {
  if (res.body && typeof res.body === 'object' && !Array.isArray(res.body)) {
    const b = res.body as Record<string, unknown>;
    // Detect gateway wrapper: has statusCode (number) + body + status (string like "success")
    if (typeof b.statusCode === 'number' && 'body' in b && typeof b.status === 'string') {
      let innerBody = b.body;
      if (typeof innerBody === 'string' && innerBody.length > 0) {
        try { innerBody = JSON.parse(innerBody); } catch { /* keep as string */ }
      }
      const innerStatus = b.statusCode as number;
      const innerError = b.error != null ? b.error : undefined;
      return { statusCode: innerStatus, body: innerBody, error: innerError };
    }
  }
  return res;
}

export async function destinationGet(
  path: string,
  config: SyncConfig
): Promise<DestinationResult> {
  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await PIM.api.external.call({
        method: 'GET',
        url: `${config.env2Host}/api/rest/v1${path}`,
        headers: { 'Content-Type': 'application/json' },
        credentials_code: config.credentialsCode,
      } as any);

      const res = unwrapGatewayBody(await parseResponse(response));
      if (res.statusCode >= 200 && res.statusCode < 300) {
        return { status: res.statusCode, body: res.body };
      }
      return { status: res.statusCode, error: formatError(res.body ?? res.error, res.statusCode) };
    } catch (err) {
      const msg = getErrorMessage(err);
      // Retry on network errors
      if (attempt < maxRetries && isNetworkError(msg)) {
        await delay(1000 * (attempt + 1));
        continue;
      }
      // For GET requests, null body is NOT a success — it's likely a 403 or other error
      // from the gateway that couldn't construct a Response object.
      const status = extractStatusFromError(err);
      return { status, error: msg };
    }
  }
  return { status: 0, error: 'Max retries exceeded' };
}

export async function destinationPatch(
  path: string,
  body: unknown,
  config: SyncConfig
): Promise<DestinationResult> {
  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await PIM.api.external.call({
        method: 'PATCH',
        url: `${config.env2Host}/api/rest/v1${path}`,
        headers: { 'Content-Type': 'application/json' },
        body,
        credentials_code: config.credentialsCode,
      } as any);

      const res = unwrapGatewayBody(await parseResponse(response));
      if (res.statusCode >= 200 && res.statusCode < 300) {
        return { status: res.statusCode, body: res.body };
      }
      const errorMsg = formatError(res.body ?? res.error, res.statusCode);
      if (isNullBodyErrorString(errorMsg)) return { status: 204 };
      if (res.statusCode === 500 && isNetworkError(errorMsg)) return { status: 204 };
      return { status: res.statusCode, error: errorMsg };
    } catch (err) {
      if (isNullBodyError(err)) return { status: 204 };
      const msg = getErrorMessage(err);
      // Retry on network errors
      if (attempt < maxRetries && isNetworkError(msg)) {
        await delay(1000 * (attempt + 1));
        continue;
      }
      return { status: 0, error: msg };
    }
  }
  return { status: 0, error: 'Max retries exceeded' };
}

export async function destinationPost(
  path: string,
  body: unknown,
  config: SyncConfig
): Promise<DestinationResult> {
  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await PIM.api.external.call({
        method: 'POST',
        url: `${config.env2Host}/api/rest/v1${path}`,
        headers: { 'Content-Type': 'application/json' },
        body,
        credentials_code: config.credentialsCode,
      } as any);

      const res = unwrapGatewayBody(await parseResponse(response));
      if (res.statusCode >= 200 && res.statusCode < 300) {
        return { status: res.statusCode, body: res.body };
      }
      const errorMsg = formatError(res.body ?? res.error, res.statusCode);
      if (isNullBodyErrorString(errorMsg)) return { status: 204 };
      if (res.statusCode === 500 && isNetworkError(errorMsg)) return { status: 204 };
      return { status: res.statusCode, error: errorMsg };
    } catch (err) {
      if (isNullBodyError(err)) return { status: 204 };
      const msg = getErrorMessage(err);
      if (attempt < maxRetries && isNetworkError(msg)) {
        await delay(1000 * (attempt + 1));
        continue;
      }
      return { status: 0, error: msg };
    }
  }
  return { status: 0, error: 'Max retries exceeded' };
}
