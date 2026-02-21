import type { SyncConfig } from './types';

const PRODUCT_SKIP = new Set(['uuid', 'links', 'completenesses', 'created', 'updated', 'metadata']);
const MODEL_SKIP = new Set(['links', 'created', 'updated', 'metadata']);

/**
 * Akeneo stores media file paths as "a/b/c/d/filename.ext" where the first four
 * segments are single hex characters. This regex identifies those paths.
 */
const MEDIA_PATH_RE = /^[0-9a-f]\/[0-9a-f]\/[0-9a-f]\/[0-9a-f]\//;

type AttributeValues = Record<
  string,
  Array<{ locale?: string | null; scope?: string | null; data: unknown; linked_data?: unknown }>
>;

function stripMediaValues(values: AttributeValues): AttributeValues {
  const result: AttributeValues = {};
  for (const [code, entries] of Object.entries(values)) {
    const filtered = entries.filter(
      (e) => !(typeof e.data === 'string' && MEDIA_PATH_RE.test(e.data))
    );
    if (filtered.length > 0) result[code] = filtered;
  }
  return result;
}

export function buildProductPayload(
  product: Product,
  config: SyncConfig
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(product as Record<string, unknown>)) {
    if (PRODUCT_SKIP.has(k)) continue;
    if (k === 'values' && config.skipMediaValues) {
      result[k] = stripMediaValues(v as AttributeValues);
    } else {
      result[k] = v;
    }
  }
  return result;
}

export function buildProductModelPayload(
  model: ProductModel,
  config: SyncConfig
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(model as Record<string, unknown>)) {
    if (MODEL_SKIP.has(k)) continue;
    if (k === 'values' && config.skipMediaValues) {
      result[k] = stripMediaValues(v as AttributeValues);
    } else {
      result[k] = v;
    }
  }
  return result;
}

/** Returns true if any attribute value looks like an Akeneo media file path */
export function hasMediaValues(values: AttributeValues | undefined): boolean {
  if (!values) return false;
  for (const entries of Object.values(values)) {
    for (const e of entries) {
      if (typeof e.data === 'string' && MEDIA_PATH_RE.test(e.data)) return true;
    }
  }
  return false;
}
