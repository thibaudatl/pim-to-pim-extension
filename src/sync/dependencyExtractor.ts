import type { ExtractedDependencies } from './types';

const SELECT_TYPES = new Set([
  'pim_catalog_simpleselect',
  'pim_catalog_multiselect',
]);

/**
 * Load all attributes from source PIM and build a code->type map.
 * Cached after first call.
 */
let attributeTypeMapCache: Map<string, string> | null = null;

export async function loadAttributeTypeMap(): Promise<Map<string, string>> {
  if (attributeTypeMapCache) return attributeTypeMapCache;

  const map = new Map<string, string>();
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const result = await globalThis.PIM.api.attribute_v1.list({ limit: 100, page });
    for (const attr of result.items) {
      map.set(attr.code, attr.type);
    }
    hasMore = result.items.length === 100;
    page++;
  }

  attributeTypeMapCache = map;
  return map;
}

/**
 * Extract all referenced entity codes from products and product models.
 */
export function extractDependencies(
  products: Product[],
  productModels: ProductModel[],
  attributeTypeMap: Map<string, string>
): ExtractedDependencies {
  const deps: ExtractedDependencies = {
    attributeCodes: new Set(),
    attributeOptions: new Map(),
    familyCodes: new Set(),
    familyVariants: new Map(),
    categoryCodes: new Set(),
    associationTypeCodes: new Set(),
    groupCodes: new Set(),
  };

  // Process products
  for (const p of products) {
    if (p.family) deps.familyCodes.add(p.family);
    if (p.categories) for (const c of p.categories) deps.categoryCodes.add(c);
    if (p.groups) for (const g of p.groups) deps.groupCodes.add(g);

    if (p.values) extractAttributeRefs(p.values, attributeTypeMap, deps);

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

    if (m.values) extractAttributeRefs(m.values, attributeTypeMap, deps);

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
  deps: ExtractedDependencies
) {
  for (const [attrCode, entries] of Object.entries(values)) {
    deps.attributeCodes.add(attrCode);

    const attrType = attributeTypeMap.get(attrCode);
    if (!attrType || !SELECT_TYPES.has(attrType)) continue;

    // Extract option codes from select attribute values
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
}
