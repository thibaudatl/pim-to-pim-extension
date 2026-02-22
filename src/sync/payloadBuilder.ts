import type { SyncConfig, StrippedCodes } from './types';
import { loadAttributeTypeMap } from './dependencyExtractor';

const PRODUCT_SKIP = new Set(['uuid', 'links', 'completenesses', 'created', 'updated', 'metadata']);
const MODEL_SKIP = new Set(['links', 'created', 'updated', 'metadata']);

/** Image/file types are always stripped (binary data can't be transferred via API). */
const ALWAYS_STRIPPED_MEDIA_TYPES = new Set([
  'pim_catalog_image',
  'pim_catalog_file',
]);

/** Asset collections are controlled by the "Skip assets/medias" toggle. */
const ASSET_COLLECTION_TYPES = new Set([
  'pim_catalog_asset_collection',
]);

type AttributeValues = Record<
  string,
  Array<{ locale?: string | null; scope?: string | null; data: unknown; linked_data?: unknown }>
>;

/**
 * Derive media attribute codes from the already-cached attribute type map.
 * Returns codes for image/file (always stripped) and asset collections (toggle-controlled).
 * Reuses loadAttributeTypeMap() cache — no extra API call.
 */
export async function loadMediaAttributeCodes(): Promise<{
  alwaysStripped: Set<string>;
  assetCollections: Set<string>;
}> {
  const typeMap = await loadAttributeTypeMap();
  const alwaysStripped = new Set<string>();
  const assetCollections = new Set<string>();
  for (const [code, type] of typeMap) {
    if (ALWAYS_STRIPPED_MEDIA_TYPES.has(type)) alwaysStripped.add(code);
    if (ASSET_COLLECTION_TYPES.has(type)) assetCollections.add(code);
  }
  return { alwaysStripped, assetCollections };
}

function stripMediaValues(
  values: AttributeValues,
  alwaysStrippedCodes: Set<string>,
  assetCollectionCodes: Set<string>,
  skipAssetCollections: boolean,
  strippedAssetCodes?: Set<string>
): AttributeValues {
  const result: AttributeValues = {};
  for (const [code, entries] of Object.entries(values)) {
    // Always strip image/file attributes
    if (alwaysStrippedCodes.has(code)) continue;
    // Strip asset collections when the toggle is on
    if (skipAssetCollections && assetCollectionCodes.has(code)) continue;

    // Filter out specific stripped asset codes from asset collection values
    if (strippedAssetCodes && strippedAssetCodes.size > 0 && assetCollectionCodes.has(code)) {
      result[code] = entries.map((entry) => {
        if (entry.data == null || !Array.isArray(entry.data)) return entry;
        const filtered = (entry.data as string[]).filter((c) => !strippedAssetCodes.has(c));
        return { ...entry, data: filtered };
      });
      continue;
    }

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
  assetCodes: new Set(),
};

export function buildProductPayload(
  product: Product,
  config: SyncConfig,
  mediaCodes: { alwaysStripped: Set<string>; assetCollections: Set<string> },
  strippedCodes: StrippedCodes = EMPTY_STRIPPED
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(product as Record<string, unknown>)) {
    if (PRODUCT_SKIP.has(k)) continue;
    if (config.skipAssociations && (k === 'associations' || k === 'quantifiedAssociations')) continue;
    const key = k === 'quantifiedAssociations' ? 'quantified_associations' : k;

    if (k === 'values') {
      let values = v as AttributeValues;
      values = stripMediaValues(values, mediaCodes.alwaysStripped, mediaCodes.assetCollections, config.skipMediaValues, strippedCodes.assetCodes);
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
  mediaCodes: { alwaysStripped: Set<string>; assetCollections: Set<string> },
  strippedCodes: StrippedCodes = EMPTY_STRIPPED
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(model as Record<string, unknown>)) {
    if (MODEL_SKIP.has(k)) continue;
    if (config.skipAssociations && (k === 'associations' || k === 'quantifiedAssociations')) continue;
    const key = k === 'quantifiedAssociations' ? 'quantified_associations' : k;

    if (k === 'values') {
      let values = v as AttributeValues;
      values = stripMediaValues(values, mediaCodes.alwaysStripped, mediaCodes.assetCollections, config.skipMediaValues, strippedCodes.assetCodes);
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
