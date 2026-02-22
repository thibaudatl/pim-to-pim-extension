import { useEffect, useState } from 'react';
import { fetchProducts, fetchProductModels, fetchAncestorModels, fetchVariantProducts } from '../sync/productFetcher';

export interface UseProductSelectionResult {
  products: Product[];
  productModels: ProductModel[];
  ancestorModels: ProductModel[];
  variantProducts: Product[];
  selectedProductUuids: Set<string>;
  selectedModelCodes: Set<string>;
  loading: boolean;
  error: string | null;
  warnings: string[];
}

export function useProductSelection(): UseProductSelectionResult {
  const [products, setProducts] = useState<Product[]>([]);
  const [productModels, setProductModels] = useState<ProductModel[]>([]);
  const [ancestorModels, setAncestorModels] = useState<ProductModel[]>([]);
  const [variantProducts, setVariantProducts] = useState<Product[]>([]);
  const [selectedProductUuids, setSelectedProductUuids] = useState<Set<string>>(new Set());
  const [selectedModelCodes, setSelectedModelCodes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const context = globalThis.PIM.context;

        if (!('productGrid' in context) || !context.productGrid) {
          setError(
            'No product grid context found. Please open this extension from the product list.'
          );
          setLoading(false);
          return;
        }

        const { productUuids = [], productModelCodes = [] } = context.productGrid;

        if (productUuids.length === 0 && productModelCodes.length === 0) {
          setError('No items selected. Please select at least one product or product model.');
          setLoading(false);
          return;
        }

        setSelectedProductUuids(new Set(productUuids));
        setSelectedModelCodes(new Set(productModelCodes));

        const [fetchedProducts, fetchedModels] = await Promise.all([
          fetchProducts(productUuids),
          fetchProductModels(productModelCodes),
        ]);

        const knownModelCodes = new Set(
          fetchedModels.map((m) => m.code).filter((c): c is string => !!c)
        );
        const allItems: Array<{ parent?: string | null }> = [...fetchedProducts, ...fetchedModels];
        const ancestors = await fetchAncestorModels(allItems, knownModelCodes);

        // Fetch variant products (children) of all selected product models
        const allModelCodes = [
          ...productModelCodes,
          ...ancestors.map((m) => m.code).filter((c): c is string => !!c),
        ];
        const variants = await fetchVariantProducts(allModelCodes, new Set(productUuids));

        const warns: string[] = [];

        setProducts(fetchedProducts);
        setProductModels(fetchedModels);
        setAncestorModels(ancestors);
        setVariantProducts(variants);
        setWarnings(warns);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  return {
    products,
    productModels,
    ancestorModels,
    variantProducts,
    selectedProductUuids,
    selectedModelCodes,
    loading,
    error,
    warnings,
  };
}
