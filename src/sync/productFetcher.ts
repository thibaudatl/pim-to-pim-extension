/** Cached main identifier attribute code (e.g. "sku") */
let mainIdentifierCode: string | null = null;

async function loadMainIdentifierCode(): Promise<string | null> {
  if (mainIdentifierCode !== null) return mainIdentifierCode;

  // Filter by type to avoid paginating through all attributes
  const result = await globalThis.PIM.api.attribute_v1.list({
    search: { type: [{ operator: 'IN', value: ['pim_catalog_identifier'] }] },
    limit: 100,
  });

  for (const attr of result.items) {
    if (attr.isMainIdentifier) {
      mainIdentifierCode = attr.code;
      return mainIdentifierCode;
    }
  }

  // Fallback: first identifier attribute, or empty
  mainIdentifierCode = result.items[0]?.code ?? '';
  return mainIdentifierCode;
}

/**
 * Resolves the main identifier for each product from its values,
 * populating `product.identifier` when the top-level field is empty.
 */
function resolveIdentifiers(products: Product[], identifierCode: string): void {
  if (!identifierCode) return;
  for (const p of products) {
    if (p.identifier) continue;
    const entries = p.values?.[identifierCode];
    if (entries && entries.length > 0 && typeof entries[0].data === 'string') {
      p.identifier = entries[0].data;
    }
  }
}

export async function fetchProducts(uuids: string[]): Promise<Product[]> {
  if (uuids.length === 0) return [];
  const [products, identifierCode] = await Promise.all([
    Promise.all(uuids.map((uuid) => globalThis.PIM.api.product_uuid_v1.get({ uuid }))),
    loadMainIdentifierCode(),
  ]);
  if (identifierCode) resolveIdentifiers(products, identifierCode);
  return products;
}

export async function fetchProductModels(codes: string[]): Promise<ProductModel[]> {
  if (codes.length === 0) return [];
  return Promise.all(codes.map((code) => globalThis.PIM.api.product_model_v1.get({ code })));
}

/**
 * Fetches variant products (children) of the given product model codes.
 * Paginates through results and filters out products already selected by the user.
 */
export async function fetchVariantProducts(
  modelCodes: string[],
  alreadySelectedUuids: Set<string>
): Promise<Product[]> {
  if (modelCodes.length === 0) return [];

  const identifierCode = await loadMainIdentifierCode();
  const allVariants: Product[] = [];

  for (const modelCode of modelCodes) {
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const result = await globalThis.PIM.api.product_uuid_v1.list({
        search: { parent: [{ operator: '=', value: modelCode }] },
        limit: 100,
        page,
      });

      for (const product of result.items) {
        if (!alreadySelectedUuids.has(product.uuid)) {
          allVariants.push(product);
        }
      }

      hasMore = result.items.length === 100;
      page++;
    }
  }

  if (identifierCode) resolveIdentifiers(allVariants, identifierCode);
  return allVariants;
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
