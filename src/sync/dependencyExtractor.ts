import type { ExtractedDependencies } from './types';

const SELECT_TYPES = new Set([
  'pim_catalog_simpleselect',
  'pim_catalog_multiselect',
]);

const REFERENCE_ENTITY_TYPES = new Set([
  'akeneo_reference_entity',
  'akeneo_reference_entity_collection',
]);

export interface AttributeMeta {
  type: string;
  group: string;
  groupLabels: Record<string, string>;
  sortOrder: number;
  labels: Record<string, string>;
}

/**
 * Load all attributes from source PIM and build a code->type map.
 * Also populates the referenceDataName map for reference entity attributes
 * and the attribute metadata map (group, labels, sortOrder).
 * Cached after first call.
 */
let attributeTypeMapCache: Map<string, string> | null = null;
/** Map of attribute code -> referenceDataName (only for reference entity type attributes) */
let referenceDataNameMapCache: Map<string, string> | null = null;
/** Map of attribute code -> metadata (group, labels, sortOrder) */
let attributeMetaMapCache: Map<string, AttributeMeta> | null = null;

export async function loadAttributeTypeMap(): Promise<Map<string, string>> {
  if (attributeTypeMapCache) return attributeTypeMapCache;

  const typeMap = new Map<string, string>();
  const refDataMap = new Map<string, string>();
  const metaMap = new Map<string, AttributeMeta>();
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const result = await globalThis.PIM.api.attribute_v1.list({ limit: 100, page });
    for (const attr of result.items) {
      typeMap.set(attr.code, attr.type);
      if (REFERENCE_ENTITY_TYPES.has(attr.type) && attr.referenceDataName) {
        refDataMap.set(attr.code, attr.referenceDataName);
      }
      metaMap.set(attr.code, {
        type: attr.type,
        group: attr.group ?? 'other',
        groupLabels: attr.groupLabels ?? {},
        sortOrder: attr.sortOrder ?? 0,
        labels: attr.labels ?? {},
      });
    }
    hasMore = result.items.length === 100;
    page++;
  }

  attributeTypeMapCache = typeMap;
  referenceDataNameMapCache = refDataMap;
  attributeMetaMapCache = metaMap;
  return typeMap;
}

/**
 * Return the cached referenceDataName map (attribute code -> reference entity code).
 * Must be called after loadAttributeTypeMap().
 */
export function loadReferenceDataNameMap(): Map<string, string> {
  return referenceDataNameMapCache ?? new Map();
}

/**
 * Return the cached attribute metadata map (group, labels, sortOrder).
 * Must be called after loadAttributeTypeMap().
 */
export function loadAttributeMetaMap(): Map<string, AttributeMeta> {
  return attributeMetaMapCache ?? new Map();
}

/**
 * Extract all referenced entity codes from products and product models.
 */
export function extractDependencies(
  products: Product[],
  productModels: ProductModel[],
  attributeTypeMap: Map<string, string>,
  referenceDataNameMap: Map<string, string> = new Map()
): ExtractedDependencies {
  const deps: ExtractedDependencies = {
    attributeCodes: new Set(),
    attributeOptions: new Map(),
    familyCodes: new Set(),
    familyVariants: new Map(),
    categoryCodes: new Set(),
    associationTypeCodes: new Set(),
    groupCodes: new Set(),
    referenceEntityRecords: new Map(),
  };

  // Process products
  for (const p of products) {
    if (p.family) deps.familyCodes.add(p.family);
    if (p.categories) for (const c of p.categories) deps.categoryCodes.add(c);
    if (p.groups) for (const g of p.groups) deps.groupCodes.add(g);

    if (p.values) extractAttributeRefs(p.values, attributeTypeMap, referenceDataNameMap, deps);

    if (p.associations) {
      for (const assocType of Object.keys(p.associations)) {
        deps.associationTypeCodes.add(assocType);
      }
    }
    if (p.quantifiedAssociations) {
      for (const assocType of Object.keys(p.quantifiedAssociations)) {
        deps.associationTypeCodes.add(assocType);
      }
    }
  }

  // Process product models
  for (const m of productModels) {
    if (m.family) deps.familyCodes.add(m.family);
    if (m.family_variant && m.family) {
      const variants = deps.familyVariants.get(m.family) ?? new Set();
      variants.add(m.family_variant);
      deps.familyVariants.set(m.family, variants);
    }
    if (m.categories) for (const c of m.categories) deps.categoryCodes.add(c);

    if (m.values) extractAttributeRefs(m.values, attributeTypeMap, referenceDataNameMap, deps);

    if (m.associations) {
      for (const assocType of Object.keys(m.associations)) {
        deps.associationTypeCodes.add(assocType);
      }
    }
    if (m.quantifiedAssociations) {
      for (const assocType of Object.keys(m.quantifiedAssociations)) {
        deps.associationTypeCodes.add(assocType);
      }
    }
  }

  return deps;
}

function extractAttributeRefs(
  values: Record<string, Array<{ data: unknown }>>,
  attributeTypeMap: Map<string, string>,
  referenceDataNameMap: Map<string, string>,
  deps: ExtractedDependencies
) {
  for (const [attrCode, entries] of Object.entries(values)) {
    deps.attributeCodes.add(attrCode);

    const attrType = attributeTypeMap.get(attrCode);
    if (!attrType) continue;

    // Extract option codes from select attribute values
    if (SELECT_TYPES.has(attrType)) {
      for (const entry of entries) {
        if (entry.data == null) continue;
        const optionCodes: string[] = Array.isArray(entry.data)
          ? entry.data
          : [entry.data as string];

        for (const optCode of optionCodes) {
          if (typeof optCode !== 'string') continue;
          const existing = deps.attributeOptions.get(attrCode) ?? new Set();
          existing.add(optCode);
          deps.attributeOptions.set(attrCode, existing);
        }
      }
    }

    // Extract record codes from reference entity attributes
    if (REFERENCE_ENTITY_TYPES.has(attrType)) {
      const refEntityCode = referenceDataNameMap.get(attrCode);
      if (!refEntityCode) continue;

      for (const entry of entries) {
        if (entry.data == null) continue;
        const recordCodes: string[] = Array.isArray(entry.data)
          ? entry.data
          : [entry.data as string];

        for (const code of recordCodes) {
          if (typeof code !== 'string') continue;
          const existing = deps.referenceEntityRecords.get(refEntityCode) ?? new Set();
          existing.add(code);
          deps.referenceEntityRecords.set(refEntityCode, existing);
        }
      }
    }
  }
}
