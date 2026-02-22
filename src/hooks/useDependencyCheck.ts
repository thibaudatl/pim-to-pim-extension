import { useState, useCallback } from 'react';
import type {
  SyncConfig,
  DependencyReport,
  DependencyResolution,
  DependencyType,
  DepSyncItem,
  StrippedCodes,
} from '../sync/types';
import { loadAttributeTypeMap, loadReferenceDataNameMap, loadAssetFamilyCodeMap, collectAttributeCodes, extractDependencies } from '../sync/dependencyExtractor';
import { checkDependencies } from '../sync/dependencyChecker';
import { createDependencies } from '../sync/dependencyCreator';

export type DepCheckPhase = 'idle' | 'analyzing' | 'error' | 'report' | 'resolving' | 'done';

export interface UseDependencyCheckResult {
  phase: DepCheckPhase;
  progressMessage: string;
  error: string | null;
  report: DependencyReport | null;
  depSyncItems: DepSyncItem[];
  strippedCodes: StrippedCodes;
  excludedAttributes: string[];
  excludedCategories: string[];
  startCheck: (
    products: Product[],
    productModels: ProductModel[],
    ancestorModels: ProductModel[],
    config: SyncConfig,
    variantProducts?: Product[]
  ) => void;
  setResolution: (type: DependencyType, resolution: DependencyResolution) => void;
  setExcludedAttributes: (codes: string[]) => void;
  setExcludedCategories: (codes: string[]) => void;
  resolve: (config: SyncConfig) => void;
  backToReport: () => void;
  reset: () => void;
}

const EMPTY_STRIPPED: StrippedCodes = {
  categories: new Set(),
  groups: new Set(),
  associationTypes: new Set(),
  assetCodes: new Set(),
};

export function useDependencyCheck(): UseDependencyCheckResult {
  const [phase, setPhase] = useState<DepCheckPhase>('idle');
  const [progressMessage, setProgressMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<DependencyReport | null>(null);
  const [depSyncItems, setDepSyncItems] = useState<DepSyncItem[]>([]);
  const [strippedCodes, setStrippedCodes] = useState<StrippedCodes>(EMPTY_STRIPPED);
  const [excludedAttributes, setExcludedAttributes] = useState<string[]>([]);
  const [excludedCategories, setExcludedCategories] = useState<string[]>([]);

  const startCheck = useCallback(
    async (
      products: Product[],
      productModels: ProductModel[],
      ancestorModels: ProductModel[],
      config: SyncConfig,
      variantProducts: Product[] = []
    ) => {
      setPhase('analyzing');
      setProgressMessage('Loading attribute definitions…');
      setError(null);
      setReport(null);
      setDepSyncItems([]);
      setStrippedCodes(EMPTY_STRIPPED);
      setExcludedAttributes([]);
      setExcludedCategories([]);

      try {
        const allModels = [...productModels, ...ancestorModels];
        const allProducts = config.includeVariantProducts
          ? [...products, ...variantProducts]
          : products;

        // Collect attribute codes from product values first (lightweight, no API calls)
        const requiredAttrCodes = collectAttributeCodes(allProducts, allModels);
        // Load only those attributes from source PIM (batched search, not full listing)
        const attrTypeMap = await loadAttributeTypeMap(requiredAttrCodes);
        const refDataNameMap = loadReferenceDataNameMap();
        const assetFamilyCodeMap = loadAssetFamilyCodeMap();
        setProgressMessage('Extracting dependencies from products…');

        const deps = extractDependencies(allProducts, allModels, attrTypeMap, refDataNameMap, assetFamilyCodeMap);

        const depReport = await checkDependencies(deps, config, (msg) => {
          setProgressMessage(msg);
        });

        setReport(depReport);

        const hasAccessDenied = depReport.types.some((t) => t.accessDenied);

        if (depReport.totalMissing === 0 && !hasAccessDenied) {
          setPhase('done');
          setProgressMessage('');
        } else {
          setPhase('report');
          setProgressMessage('');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setPhase('error');
        setProgressMessage('');
      }
    },
    []
  );

  const setResolution = useCallback(
    (type: DependencyType, resolution: DependencyResolution) => {
      setReport((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          types: prev.types.map((t) =>
            t.type === type ? { ...t, resolution } : t
          ),
        };
      });
    },
    []
  );

  const resolve = useCallback(
    async (config: SyncConfig) => {
      if (!report) return;

      setPhase('resolving');
      setProgressMessage('Creating missing entities…');

      const excludedAttrSet = new Set(excludedAttributes);
      const excludedCatSet = new Set(excludedCategories);

      const toCreate = report.types
        .filter((t) => t.resolution === 'create')
        .flatMap((t) => t.missing)
        .filter((item) => {
          if (item.type === 'attribute' && excludedAttrSet.has(item.code)) return false;
          if (item.type === 'attribute_option' && excludedAttrSet.has(item.parentCode!)) return false;
          if (item.type === 'category' && excludedCatSet.has(item.code)) return false;
          return true;
        });

      const stripped: StrippedCodes = {
        categories: new Set<string>(),
        groups: new Set<string>(),
        associationTypes: new Set<string>(),
        assetCodes: new Set<string>(),
      };

      for (const t of report.types) {
        if (t.resolution === 'strip') {
          for (const item of t.missing) {
            if (t.type === 'category') stripped.categories.add(item.code);
            if (t.type === 'group') stripped.groups.add(item.code);
            if (t.type === 'association_type') stripped.associationTypes.add(item.code);
            if (t.type === 'asset') stripped.assetCodes.add(item.code);
          }
        }
      }

      // Add excluded categories to stripped codes so they are removed from payloads
      for (const code of excludedCategories) {
        stripped.categories.add(code);
      }

      setStrippedCodes(stripped);

      if (toCreate.length > 0) {
        await createDependencies(toCreate, config, (items) => {
          setDepSyncItems(items);
        });
      }

      setPhase('done');
      setProgressMessage('');
    },
    [report, excludedAttributes, excludedCategories]
  );

  const backToReport = useCallback(() => {
    setPhase('report');
    setProgressMessage('');
  }, []);

  const reset = useCallback(() => {
    setPhase('idle');
    setProgressMessage('');
    setError(null);
    setReport(null);
    setDepSyncItems([]);
    setStrippedCodes(EMPTY_STRIPPED);
    setExcludedAttributes([]);
    setExcludedCategories([]);
  }, []);

  return {
    phase,
    progressMessage,
    error,
    report,
    depSyncItems,
    strippedCodes,
    excludedAttributes,
    excludedCategories,
    startCheck,
    setResolution,
    setExcludedAttributes,
    setExcludedCategories,
    resolve,
    backToReport,
    reset,
  };
}
