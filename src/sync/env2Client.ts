import type { SyncConfig } from './types';
import { parseResponse, formatError } from './destinationClient';

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

  // Final safety net: if the error that bubbled through is still a null-body artefact, treat as success
  if (isNullBodyErrorString(errorMsg)) return { status: 204 };

  return { status: res.statusCode, error: errorMsg };
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
    return interpretPatchResult(res);
  } catch (err) {
    if (isNullBodyError(err)) return { status: 204 };
    return { status: 0, error: getErrorMessage(err) };
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
    return interpretPatchResult(res);
  } catch (err) {
    if (isNullBodyError(err)) return { status: 204 };
    return { status: 0, error: getErrorMessage(err) };
  }
}
