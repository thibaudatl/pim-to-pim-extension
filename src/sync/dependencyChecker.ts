import type { SyncConfig, ExtractedDependencies, DependencyItem, DependencyTypeReport, DependencyReport } from './types';
import { destinationGet } from './destinationClient';

type ProgressCallback = (message: string) => void;

/** Thrown internally to signal a 403/401 for one resource type. */
class AccessDeniedError extends Error {
  constructor(public status: number) {
    super(`Access denied (HTTP ${status})`);
    this.name = 'AccessDeniedError';
  }
}

/**
 * Check the destination PIM for missing dependencies.
 * Returns a report of what's missing per type.
 * If a specific resource type returns 403/401, that type is marked as accessDenied
 * and the check continues with the remaining types.
 */
export async function checkDependencies(
  deps: ExtractedDependencies,
  config: SyncConfig,
  onProgress?: ProgressCallback
): Promise<DependencyReport> {
  const types: DependencyTypeReport[] = [];

  // 1. Attributes
  onProgress?.('Checking attributes…');
  try {
    const missingAttrs = await checkByListing(deps.attributeCodes, '/attributes', config);
    types.push({
      type: 'attribute',
      total: deps.attributeCodes.size,
      missing: missingAttrs.map((code) => ({ type: 'attribute', code })),
      resolution: 'create',
    });

    // 2. Attribute options (only for attributes that exist in destination)
    onProgress?.('Checking attribute options…');
    const missingOptions: DependencyItem[] = [];
    let totalOptions = 0;
    for (const [attrCode, optionCodes] of deps.attributeOptions) {
      if (missingAttrs.includes(attrCode)) continue;
      totalOptions += optionCodes.size;
      try {
        const missingOpts = await checkByListing(
          optionCodes,
          `/attributes/${encodeURIComponent(attrCode)}/options`,
          config
        );
        for (const optCode of missingOpts) {
          missingOptions.push({ type: 'attribute_option', code: optCode, parentCode: attrCode });
        }
      } catch (err) {
        if (err instanceof AccessDeniedError) {
          // Skip this attribute's options silently — attribute options inherit attribute access
          continue;
        }
        throw err;
      }
    }
    types.push({
      type: 'attribute_option',
      total: totalOptions,
      missing: missingOptions,
      resolution: 'create',
    });
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      types.push({
        type: 'attribute',
        total: deps.attributeCodes.size,
        missing: [],
        resolution: 'skip',
        accessDenied: true,
      });
      types.push({
        type: 'attribute_option',
        total: 0,
        missing: [],
        resolution: 'skip',
        accessDenied: true,
      });
    } else {
      throw err;
    }
  }

  // 3. Families
  onProgress?.('Checking families…');
  try {
    const missingFamilies = await checkByIndividualGet(
      deps.familyCodes,
      (code) => `/families/${encodeURIComponent(code)}`,
      config
    );
    types.push({
      type: 'family',
      total: deps.familyCodes.size,
      missing: missingFamilies.map((code) => ({ type: 'family', code })),
      resolution: 'create',
    });

    // 4. Family variants
    onProgress?.('Checking family variants…');
    const missingFV: DependencyItem[] = [];
    let totalFV = 0;
    for (const [familyCode, variantCodes] of deps.familyVariants) {
      totalFV += variantCodes.size;
      for (const variantCode of variantCodes) {
        const res = await destinationGet(
          `/families/${encodeURIComponent(familyCode)}/variants/${encodeURIComponent(variantCode)}`,
          config
        );
        if (res.status === 403 || res.status === 401) {
          throw new AccessDeniedError(res.status);
        }
        if (res.status === 404 || res.status === 0) {
          missingFV.push({ type: 'family_variant', code: variantCode, parentCode: familyCode });
        }
      }
    }
    types.push({
      type: 'family_variant',
      total: totalFV,
      missing: missingFV,
      resolution: 'create',
    });
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      // If families are denied, family variants are too
      if (!types.some((t) => t.type === 'family')) {
        types.push({
          type: 'family',
          total: deps.familyCodes.size,
          missing: [],
          resolution: 'skip',
          accessDenied: true,
        });
      }
      if (!types.some((t) => t.type === 'family_variant')) {
        types.push({
          type: 'family_variant',
          total: 0,
          missing: [],
          resolution: 'skip',
          accessDenied: true,
        });
      }
    } else {
      throw err;
    }
  }

  // 5. Categories
  onProgress?.('Checking categories…');
  try {
    const missingCategories = await checkByListing(deps.categoryCodes, '/categories', config);
    types.push({
      type: 'category',
      total: deps.categoryCodes.size,
      missing: missingCategories.map((code) => ({ type: 'category', code })),
      resolution: 'create',
    });
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      types.push({
        type: 'category',
        total: deps.categoryCodes.size,
        missing: [],
        resolution: 'skip',
        accessDenied: true,
      });
    } else {
      throw err;
    }
  }

  // 6. Association types
  onProgress?.('Checking association types…');
  try {
    const missingAssocTypes = await checkByListing(
      deps.associationTypeCodes,
      '/association-types',
      config
    );
    types.push({
      type: 'association_type',
      total: deps.associationTypeCodes.size,
      missing: missingAssocTypes.map((code) => ({ type: 'association_type', code })),
      resolution: 'strip',
    });
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      types.push({
        type: 'association_type',
        total: deps.associationTypeCodes.size,
        missing: [],
        resolution: 'skip',
        accessDenied: true,
      });
    } else {
      throw err;
    }
  }

  // 7. Groups — no group API in SDK, always strip
  types.push({
    type: 'group',
    total: deps.groupCodes.size,
    missing: Array.from(deps.groupCodes).map((code) => ({ type: 'group', code })),
    resolution: 'strip',
  });

  const totalMissing = types.reduce((sum, t) => sum + t.missing.length, 0);
  return { types, totalMissing };
}

/**
 * List all items from a paginated endpoint, build a set of existing codes,
 * then diff against the required codes.
 * Throws AccessDeniedError on 403/401.
 */
async function checkByListing(
  requiredCodes: Set<string>,
  basePath: string,
  config: SyncConfig
): Promise<string[]> {
  if (requiredCodes.size === 0) return [];

  const existingCodes = new Set<string>();
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const res = await destinationGet(`${basePath}?limit=100&page=${page}`, config);

    if (res.status === 403 || res.status === 401) {
      throw new AccessDeniedError(res.status);
    }

    if (res.status !== 200 || !res.body) {
      if (page === 1) {
        throw new AccessDeniedError(res.status || 403);
      }
      break;
    }

    const body = res.body as Record<string, unknown>;
    const embedded = body._embedded as Record<string, unknown> | undefined;
    const items = (body.items ?? embedded?.items ?? []) as Array<{ code: string }>;

    for (const item of items) {
      if (item.code) existingCodes.add(item.code);
    }
    hasMore = items.length === 100;
    page++;
  }

  return Array.from(requiredCodes).filter((code) => !existingCodes.has(code));
}

/**
 * Check existence by individual GET requests (for small sets like families).
 * Throws AccessDeniedError on 403/401.
 */
async function checkByIndividualGet(
  requiredCodes: Set<string>,
  pathFn: (code: string) => string,
  config: SyncConfig
): Promise<string[]> {
  if (requiredCodes.size === 0) return [];

  const missing: string[] = [];
  let firstRequest = true;
  for (const code of requiredCodes) {
    const res = await destinationGet(pathFn(code), config);
    if (res.status === 403 || res.status === 401) {
      throw new AccessDeniedError(res.status);
    }
    // Status 0 with error on first request = gateway/permission issue
    if (res.status === 0 && res.error && firstRequest) {
      throw new AccessDeniedError(403);
    }
    if (res.status === 404 || res.status === 0) {
      missing.push(code);
    }
    firstRequest = false;
  }
  return missing;
}
