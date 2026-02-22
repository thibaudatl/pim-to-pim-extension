import { useState, useCallback, useRef } from 'react';
import type { SyncConfig, SyncItem, StrippedCodes } from '../sync/types';
import { buildProductPayload, buildProductModelPayload, loadMediaAttributeCodes } from '../sync/payloadBuilder';
import { pushProduct, pushProductModel } from '../sync/env2Client';

const EMPTY_STRIPPED: StrippedCodes = {
  categories: new Set(),
  groups: new Set(),
  associationTypes: new Set(),
};

export interface UseSyncExecutionResult {
  items: SyncItem[];
  isRunning: boolean;
  isDone: boolean;
  startSync: (
    rawItems: SyncItem[],
    products: Product[],
    productModels: ProductModel[],
    ancestorModels: ProductModel[],
    config: SyncConfig,
    strippedCodes?: StrippedCodes
  ) => void;
  retryFailed: (config: SyncConfig) => void;
}

export function useSyncExecution(): UseSyncExecutionResult {
  const [items, setItems] = useState<SyncItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isDone, setIsDone] = useState(false);

  // Store data for retry
  const storedProducts = useRef<Product[]>([]);
  const storedModels = useRef<ProductModel[]>([]);
  const storedAncestors = useRef<ProductModel[]>([]);
  const storedStripped = useRef<StrippedCodes>(EMPTY_STRIPPED);

  function resolvePayload(
    item: SyncItem,
    products: Product[],
    models: ProductModel[],
    ancestors: ProductModel[],
    config: SyncConfig,
    mediaCodes: Set<string>,
    stripped: StrippedCodes
  ): Record<string, unknown> {
    const allModels = [...models, ...ancestors];
    if (item.type === 'product') {
      const product = products.find((p) => p.uuid === item.uuid || p.identifier === item.id);
      return product ? buildProductPayload(product, config, mediaCodes, stripped) : {};
    } else {
      const model = allModels.find((m) => m.code === item.id);
      return model ? buildProductModelPayload(model, config, mediaCodes, stripped) : {};
    }
  }

  const runItems = useCallback(
    async (
      itemsToRun: SyncItem[],
      allItems: SyncItem[],
      products: Product[],
      models: ProductModel[],
      ancestors: ProductModel[],
      config: SyncConfig,
      stripped: StrippedCodes
    ) => {
      setIsRunning(true);
      setIsDone(false);

      // Load media attribute codes once (cached after first call)
      const mediaCodes = config.skipMediaValues
        ? await loadMediaAttributeCodes()
        : new Set<string>();

      // Work on a mutable copy
      const current = allItems.map((i) => ({ ...i }));

      for (const item of itemsToRun) {
        const idx = current.findIndex((it) => it.type === item.type && it.id === item.id);
        if (idx === -1) continue;

        current[idx] = { ...current[idx], status: 'in_progress' };
        setItems([...current]);

        const payload = resolvePayload(item, products, models, ancestors, config, mediaCodes, stripped);
        current[idx] = { ...current[idx], payload };

        const result =
          item.type === 'product'
            ? await pushProduct(payload, config, item.id)
            : await pushProductModel(payload, config);

        const success = result.status === 201 || result.status === 204;
        current[idx] = {
          ...current[idx],
          status: success ? 'success' : 'error',
          httpStatus: result.status,
          error: result.error,
        };
        setItems([...current]);
      }

      setIsRunning(false);
      setIsDone(true);
    },
    []
  );

  const startSync = useCallback(
    (
      rawItems: SyncItem[],
      products: Product[],
      productModels: ProductModel[],
      ancestorModels: ProductModel[],
      config: SyncConfig,
      strippedCodes: StrippedCodes = EMPTY_STRIPPED
    ) => {
      storedProducts.current = products;
      storedModels.current = productModels;
      storedAncestors.current = ancestorModels;
      storedStripped.current = strippedCodes;

      setItems(rawItems);
      setIsDone(false);

      runItems(
        rawItems,
        rawItems,
        products,
        productModels,
        ancestorModels,
        config,
        strippedCodes
      );
    },
    [runItems]
  );

  const retryFailed = useCallback(
    (config: SyncConfig) => {
      setItems((current) => {
        const failedItems = current.filter((i) => i.status === 'error');
        if (failedItems.length === 0) return current;

        const reset = current.map((i) =>
          i.status === 'error'
            ? { ...i, status: 'pending' as const, error: undefined, httpStatus: undefined }
            : i
        );

        // Kick off async run outside of state setter
        const toRetry = failedItems.map((i) => ({
          ...i,
          status: 'pending' as const,
          error: undefined,
          httpStatus: undefined,
        }));
        setTimeout(() =>
          runItems(
            toRetry,
            reset,
            storedProducts.current,
            storedModels.current,
            storedAncestors.current,
            config,
            storedStripped.current
          )
        , 0);

        return reset;
      });
    },
    [runItems]
  );

  return { items, isRunning, isDone, startSync, retryFailed };
}
