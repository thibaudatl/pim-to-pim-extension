import type { SyncConfig, SyncItem, SyncItemStatus, SyncItemType } from './types';

/**
 * Returns items in topological order: root product models → child models → variant products.
 * Respects the config options (includeParentModels, includeGrandparentModels).
 */
export function resolveSyncOrder(
  products: Product[],
  directModels: ProductModel[],
  ancestorModels: ProductModel[],
  config: SyncConfig,
  selectedProductUuids: Set<string>,
  selectedModelCodes: Set<string>
): SyncItem[] {
  // Build the set of models to include
  const modelsToInclude: ProductModel[] = [...directModels];
  const includedCodes = new Set(directModels.map((m) => m.code).filter(Boolean) as string[]);

  if (config.includeParentModels) {
    // Direct parents of selected products and models
    const directParentCodes = new Set<string>();
    for (const p of products) {
      if (p.parent) directParentCodes.add(p.parent);
    }
    for (const m of directModels) {
      if (m.parent) directParentCodes.add(m.parent);
    }

    for (const ancestor of ancestorModels) {
      if (!ancestor.code) continue;
      if (!includedCodes.has(ancestor.code) && directParentCodes.has(ancestor.code)) {
        modelsToInclude.push(ancestor);
        includedCodes.add(ancestor.code);
      }
    }
  }

  if (config.includeGrandparentModels) {
    // All remaining ancestors (grandparents, great-grandparents, etc.)
    for (const ancestor of ancestorModels) {
      if (!ancestor.code) continue;
      if (!includedCodes.has(ancestor.code)) {
        modelsToInclude.push(ancestor);
        includedCodes.add(ancestor.code);
      }
    }
  }

  const sortedModels = topoSortModels(modelsToInclude);
  const validProducts = products;

  const result: SyncItem[] = [
    ...sortedModels.map(
      (m): SyncItem => ({
        type: 'product_model' as SyncItemType,
        id: m.code!,
        payload: {},
        status: 'pending' as SyncItemStatus,
        isAncestor: !selectedModelCodes.has(m.code!),
      })
    ),
    ...validProducts.map(
      (p): SyncItem => ({
        type: 'product' as SyncItemType,
        id: p.identifier ?? p.uuid,
        uuid: p.uuid,
        payload: {},
        status: 'pending' as SyncItemStatus,
        isAncestor: !selectedProductUuids.has(p.uuid),
      })
    ),
  ];

  return result;
}

function topoSortModels(models: ProductModel[]): ProductModel[] {
  const byCode = new Map(models.map((m) => [m.code, m]));
  const visited = new Set<string>();
  const result: ProductModel[] = [];

  function visit(code: string) {
    if (visited.has(code)) return;
    const model = byCode.get(code);
    if (!model) return;
    // Visit parent first
    if (model.parent && byCode.has(model.parent)) {
      visit(model.parent);
    }
    visited.add(code);
    result.push(model);
  }

  for (const model of models) {
    if (model.code) visit(model.code);
  }

  return result;
}
