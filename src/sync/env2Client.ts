import type { SyncConfig } from './types';
import { parseResponse, formatError, unwrapGatewayBody } from './destinationClient';

interface PushResult {
  status: number;
  error?: string;
}

/** Robust error message extraction for SES sandbox where instanceof Error can fail. */
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

/** Check if a parsed error string looks like a null-body gateway artefact */
function isNullBodyErrorString(error: string | undefined): boolean {
  if (!error) return false;
  return error.includes('null body status') || error.includes('null body');
}

/**
 * Interpret a parsed response for PATCH calls.
 * For PATCH, any null-body error (at any layer) is treated as 204 success,
 * since it means the gateway couldn't construct a Response for a no-content status.
 */
function interpretPatchResult(res: { statusCode: number; body: unknown; error?: unknown }): PushResult {
  if (res.statusCode === 201 || res.statusCode === 204) return { status: res.statusCode };

  const errorMsg = formatError(res.body ?? res.error);

  // Gateway artifacts for no-content (204) responses: the gateway can't construct
  // a proper Response object and returns 500 with "null body" or "Network error" messages.
  if (isNullBodyErrorString(errorMsg)) return { status: 204 };
  if (res.statusCode === 500 && isNetworkErrorString(errorMsg)) return { status: 204 };

  return { status: res.statusCode, error: errorMsg };
}

function isNetworkErrorString(error: string | undefined): boolean {
  if (!error) return false;
  const lower = error.toLowerCase();
  return lower.includes('network error') || lower.includes('failed to fetch');
}

function isNetworkError(msg: string): boolean {
  const lower = msg.toLowerCase();
  return lower.includes('network error') || lower.includes('failed to fetch') || lower.includes('networkerror');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pushProduct(
  payload: Record<string, unknown>,
  config: SyncConfig,
  identifier: string
): Promise<PushResult> {
  if (!identifier) return { status: 0, error: 'Product has no identifier — cannot sync.' };

  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
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

      const res = unwrapGatewayBody(await parseResponse(response));
      return interpretPatchResult(res);
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

export async function pushProductModel(
  payload: Record<string, unknown>,
  config: SyncConfig
): Promise<PushResult> {
  const code = payload.code as string | undefined;
  if (!code) return { status: 0, error: 'Product model has no code — cannot sync.' };

  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
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

      const res = unwrapGatewayBody(await parseResponse(response));
      return interpretPatchResult(res);
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
