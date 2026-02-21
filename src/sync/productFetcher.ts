export async function fetchProducts(uuids: string[]): Promise<Product[]> {
  if (uuids.length === 0) return [];
  return Promise.all(uuids.map((uuid) => globalThis.PIM.api.product_uuid_v1.get({ uuid })));
}

export async function fetchProductModels(codes: string[]): Promise<ProductModel[]> {
  if (codes.length === 0) return [];
  return Promise.all(codes.map((code) => globalThis.PIM.api.product_model_v1.get({ code })));
}

/**
 * Recursively fetches parent product models that are not already in knownCodes.
 * Handles both 1-level (parent model → variant) and 2-level hierarchies
 * (root model → sub-model → variant).
 */
export async function fetchAncestorModels(
  items: Array<{ parent?: string | null }>,
  knownCodes: Set<string>
): Promise<ProductModel[]> {
  const parentCodes = new Set<string>();
  for (const item of items) {
    if (item.parent && !knownCodes.has(item.parent)) {
      parentCodes.add(item.parent);
    }
  }

  if (parentCodes.size === 0) return [];

  const parents = await fetchProductModels([...parentCodes]);

  const newKnown = new Set([
    ...knownCodes,
    ...parents.map((m) => m.code).filter((c): c is string => !!c),
  ]);

  // Recurse to discover grandparents
  const grandparents = await fetchAncestorModels(parents, newKnown);

  return [...parents, ...grandparents];
}
