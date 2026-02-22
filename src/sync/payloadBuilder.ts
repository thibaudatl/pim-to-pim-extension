import type { SyncConfig, StrippedCodes } from './types';

const PRODUCT_SKIP = new Set(['uuid', 'links', 'completenesses', 'created', 'updated', 'metadata']);
const MODEL_SKIP = new Set(['links', 'created', 'updated', 'metadata']);

const MEDIA_ATTRIBUTE_TYPES = new Set([
  'pim_catalog_image',
  'pim_catalog_file',
  'pim_catalog_asset_collection',
]);

type AttributeValues = Record<
  string,
  Array<{ locale?: string | null; scope?: string | null; data: unknown; linked_data?: unknown }>
>;

/** Cached set of attribute codes whose type is image, file, or asset collection */
let mediaAttributeCodes: Set<string> | null = null;

export async function loadMediaAttributeCodes(): Promise<Set<string>> {
  if (mediaAttributeCodes) return mediaAttributeCodes;

  const codes = new Set<string>();
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const result = await globalThis.PIM.api.attribute_v1.list({ limit: 100, page });
    for (const attr of result.items) {
      if (MEDIA_ATTRIBUTE_TYPES.has(attr.type)) codes.add(attr.code);
    }
    hasMore = result.items.length === 100;
    page++;
  }

  mediaAttributeCodes = codes;
  return codes;
}

function stripMediaValues(values: AttributeValues, mediaCodes: Set<string>): AttributeValues {
  const result: AttributeValues = {};
  for (const [code, entries] of Object.entries(values)) {
    if (mediaCodes.has(code)) continue;
    result[code] = entries;
  }
  return result;
}

function stripExcludedAttributes(
  values: AttributeValues,
  excludedAttributes: string[]
): AttributeValues {
  const excluded = new Set(excludedAttributes);
  const result: AttributeValues = {};
  for (const [code, entries] of Object.entries(values)) {
    if (!excluded.has(code)) result[code] = entries;
  }
  return result;
}

const EMPTY_STRIPPED: StrippedCodes = {
  categories: new Set(),
  groups: new Set(),
  associationTypes: new Set(),
};

export function buildProductPayload(
  product: Product,
  config: SyncConfig,
  mediaCodes: Set<string>,
  strippedCodes: StrippedCodes = EMPTY_STRIPPED
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(product as Record<string, unknown>)) {
    if (PRODUCT_SKIP.has(k)) continue;
    if (config.skipAssociations && (k === 'associations' || k === 'quantifiedAssociations')) continue;
    const key = k === 'quantifiedAssociations' ? 'quantified_associations' : k;

    if (k === 'values') {
      let values = v as AttributeValues;
      if (config.skipMediaValues) values = stripMediaValues(values, mediaCodes);
      if (config.excludedAttributes.length > 0) values = stripExcludedAttributes(values, config.excludedAttributes);
      result[key] = values;
    } else if (k === 'categories' && strippedCodes.categories.size > 0) {
      result[key] = (v as string[]).filter((c) => !strippedCodes.categories.has(c));
    } else if (k === 'groups' && strippedCodes.groups.size > 0) {
      result[key] = (v as string[]).filter((g) => !strippedCodes.groups.has(g));
    } else if ((k === 'associations' || k === 'quantifiedAssociations') && strippedCodes.associationTypes.size > 0) {
      const filtered: Record<string, unknown> = {};
      for (const [assocType, data] of Object.entries(v as Record<string, unknown>)) {
        if (!strippedCodes.associationTypes.has(assocType)) {
          filtered[assocType] = data;
        }
      }
      result[key] = filtered;
    } else {
      result[key] = v;
    }
  }
  return result;
}

export function buildProductModelPayload(
  model: ProductModel,
  config: SyncConfig,
  mediaCodes: Set<string>,
  strippedCodes: StrippedCodes = EMPTY_STRIPPED
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(model as Record<string, unknown>)) {
    if (MODEL_SKIP.has(k)) continue;
    if (config.skipAssociations && (k === 'associations' || k === 'quantifiedAssociations')) continue;
    const key = k === 'quantifiedAssociations' ? 'quantified_associations' : k;

    if (k === 'values') {
      let values = v as AttributeValues;
      if (config.skipMediaValues) values = stripMediaValues(values, mediaCodes);
      if (config.excludedAttributes.length > 0) values = stripExcludedAttributes(values, config.excludedAttributes);
      result[key] = values;
    } else if (k === 'categories' && strippedCodes.categories.size > 0) {
      result[key] = (v as string[]).filter((c) => !strippedCodes.categories.has(c));
    } else if ((k === 'associations' || k === 'quantifiedAssociations') && strippedCodes.associationTypes.size > 0) {
      const filtered: Record<string, unknown> = {};
      for (const [assocType, data] of Object.entries(v as Record<string, unknown>)) {
        if (!strippedCodes.associationTypes.has(assocType)) {
          filtered[assocType] = data;
        }
      }
      result[key] = filtered;
    } else {
      result[key] = v;
    }
  }
  return result;
}
