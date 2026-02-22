import type { SyncConfig, StrippedCodes } from './types';
import { loadAttributeTypeMap } from './dependencyExtractor';

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

/**
 * Derive media attribute codes from the already-cached attribute type map.
 * Reuses loadAttributeTypeMap() cache — no extra API call.
 */
export async function loadMediaAttributeCodes(): Promise<Set<string>> {
  const typeMap = await loadAttributeTypeMap();
  const codes = new Set<string>();
  for (const [code, type] of typeMap) {
    if (MEDIA_ATTRIBUTE_TYPES.has(type)) codes.add(code);
  }
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
