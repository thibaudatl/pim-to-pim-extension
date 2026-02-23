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

  // 1. Attributes — batched search with IN filter (falls back to individual GETs if body parsing fails)
  onProgress?.('Checking attributes…');
  try {
    const missingAttrs = await checkBySearchIN(deps.attributeCodes, '/attributes', config);
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
      totalOptions += optionCodes.size;
      if (missingAttrs.includes(attrCode)) {
        // Attribute doesn't exist in destination — all its options are necessarily missing too
        for (const optCode of optionCodes) {
          missingOptions.push({ type: 'attribute_option', code: optCode, parentCode: attrCode });
        }
        continue;
      }
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

  // 3. Reference entities (informational — checks if parent definitions exist)
  if (deps.referenceEntityRecords.size > 0) {
    onProgress?.('Checking reference entities…');
    const refEntityCodes = new Set(deps.referenceEntityRecords.keys());
    try {
      const missingRefEntities = await checkByIndividualGet(
        refEntityCodes,
        (code) => `/reference-entities/${encodeURIComponent(code)}`,
        config
      );
      types.push({
        type: 'reference_entity',
        total: refEntityCodes.size,
        missing: missingRefEntities.map((code) => ({ type: 'reference_entity', code })),
        resolution: 'skip',
        informational: true,
      });
    } catch (err) {
      if (err instanceof AccessDeniedError) {
        types.push({
          type: 'reference_entity',
          total: refEntityCodes.size,
          missing: [],
          resolution: 'skip',
          accessDenied: true,
          informational: true,
        });
      } else {
        throw err;
      }
    }
  }

  // 4. Reference entity records
  onProgress?.('Checking reference entity records…');
  try {
    const missingRecords: DependencyItem[] = [];
    let totalRecords = 0;
    for (const [refEntityCode, recordCodes] of deps.referenceEntityRecords) {
      totalRecords += recordCodes.size;
      try {
        const missing = await checkRecordsByGet(refEntityCode, recordCodes, config);
        for (const recordCode of missing) {
          missingRecords.push({
            type: 'reference_entity_record',
            code: recordCode,
            parentCode: refEntityCode,
          });
        }
      } catch (err) {
        if (err instanceof AccessDeniedError) {
          // Skip this entity's records silently
          continue;
        }
        throw err;
      }
    }
    types.push({
      type: 'reference_entity_record',
      total: totalRecords,
      missing: missingRecords,
      resolution: 'create',
    });
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      types.push({
        type: 'reference_entity_record',
        total: 0,
        missing: [],
        resolution: 'skip',
        accessDenied: true,
      });
    } else {
      throw err;
    }
  }

  // 5. Asset families (informational — checks if parent definitions exist)
  if (deps.assets.size > 0) {
    const assetFamilyCodes = new Set(deps.assets.keys());
    if (config.skipMediaValues) {
      types.push({
        type: 'asset_family',
        total: assetFamilyCodes.size,
        missing: [],
        resolution: 'skip',
        informational: true,
      });
    } else {
      onProgress?.('Checking asset families…');
      try {
        const missingAssetFamilies = await checkByIndividualGet(
          assetFamilyCodes,
          (code) => `/asset-families/${encodeURIComponent(code)}`,
          config
        );
        types.push({
          type: 'asset_family',
          total: assetFamilyCodes.size,
          missing: missingAssetFamilies.map((code) => ({ type: 'asset_family', code })),
          resolution: 'skip',
          informational: true,
        });
      } catch (err) {
        if (err instanceof AccessDeniedError) {
          types.push({
            type: 'asset_family',
            total: assetFamilyCodes.size,
            missing: [],
            resolution: 'skip',
            accessDenied: true,
            informational: true,
          });
        } else {
          throw err;
        }
      }
    }
  }

  // 6. Assets — batched search per asset family
  if (config.skipMediaValues) {
    let totalAssets = 0;
    for (const [, assetCodes] of deps.assets) {
      totalAssets += assetCodes.size;
    }
    types.push({
      type: 'asset',
      total: totalAssets,
      missing: [],
      resolution: 'skip',
    });
  } else {
    onProgress?.('Checking assets…');
    try {
      const missingAssets: DependencyItem[] = [];
      let totalAssets = 0;
      for (const [assetFamilyCode, assetCodes] of deps.assets) {
        totalAssets += assetCodes.size;
        try {
          const missing = await checkBySearchIN(
            assetCodes,
            `/asset-families/${encodeURIComponent(assetFamilyCode)}/assets`,
            config
          );
          for (const assetCode of missing) {
            missingAssets.push({
              type: 'asset',
              code: assetCode,
              parentCode: assetFamilyCode,
            });
          }
        } catch (err) {
          if (err instanceof AccessDeniedError) {
            continue;
          }
          throw err;
        }
      }
      types.push({
        type: 'asset',
        total: totalAssets,
        missing: missingAssets,
        resolution: 'create',
      });
    } catch (err) {
      if (err instanceof AccessDeniedError) {
        types.push({
          type: 'asset',
          total: 0,
          missing: [],
          resolution: 'skip',
          accessDenied: true,
        });
      } else {
        throw err;
      }
    }
  }

  // 5. Families — individual GETs (typically very few)
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

    // 6. Family variants — individual GETs (typically very few)
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

  // 7. Categories — batched search with IN filter (skip when categories are stripped from payload)
  if (config.skipCategories) {
    types.push({
      type: 'category',
      total: deps.categoryCodes.size,
      missing: [],
      resolution: 'skip',
    });
  } else {
    onProgress?.('Checking categories…');
    try {
      const missingCategories = await checkBySearchIN(deps.categoryCodes, '/categories', config);
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
  }

  // 8. Association types — batched search with IN filter
  onProgress?.('Checking association types…');
  try {
    const missingAssocTypes = await checkBySearchIN(
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

  // 9. Groups — no group API in SDK, always strip
  types.push({
    type: 'group',
    total: deps.groupCodes.size,
    missing: Array.from(deps.groupCodes).map((code) => ({ type: 'group', code })),
    resolution: 'strip',
  });

  const totalMissing = types.reduce((sum, t) => t.informational ? sum : sum + t.missing.length, 0);
  const hasInfoWarnings = types.some((t) => t.informational && t.missing.length > 0);
  return { types, totalMissing, hasInfoWarnings };
}

/**
 * Extract item codes from a paginated Akeneo API response body.
 * Handles HAL format (_embedded.items), direct items array, and raw arrays.
 */
function extractItemCodes(body: unknown): string[] {
  if (!body || typeof body !== 'object') return [];

  // Body is a raw array of items
  if (Array.isArray(body)) {
    return body
      .filter((item) => item && typeof item === 'object' && typeof (item as any).code === 'string')
      .map((item) => (item as any).code);
  }

  const b = body as Record<string, unknown>;

  // HAL format: { _embedded: { items: [...] } }
  if (b._embedded && typeof b._embedded === 'object' && !Array.isArray(b._embedded)) {
    const embedded = b._embedded as Record<string, unknown>;
    if (Array.isArray(embedded.items)) {
      return embedded.items
        .filter((item) => item && typeof item === 'object' && typeof (item as any).code === 'string')
        .map((item) => (item as any).code);
    }
  }

  // Direct items array: { items: [...] }
  if (Array.isArray(b.items)) {
    return (b.items as any[])
      .filter((item) => item && typeof item === 'object' && typeof item.code === 'string')
      .map((item) => item.code);
  }

  return [];
}

/** Check if the body is a valid list response (even if empty). */
function isValidListResponse(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  if (Array.isArray(body)) return true;
  const b = body as Record<string, unknown>;
  if (b._embedded && typeof b._embedded === 'object') {
    const embedded = b._embedded as Record<string, unknown>;
    if (Array.isArray(embedded.items)) return true;
  }
  if (Array.isArray(b.items)) return true;
  return false;
}

/** Capture the shape of a response body for diagnostics. */
function bodyDiag(body: unknown): string {
  if (body === null) return 'null';
  if (body === undefined) return 'undefined';
  if (typeof body === 'string') return `string(len=${body.length}):"${body.slice(0, 120)}"`;
  if (Array.isArray(body)) return `array(len=${body.length})`;
  if (typeof body === 'object') {
    const keys = Object.keys(body as Record<string, unknown>);
    const preview: Record<string, string> = {};
    for (const k of keys.slice(0, 6)) {
      const v = (body as any)[k];
      if (v === null || v === undefined) preview[k] = String(v);
      else if (Array.isArray(v)) preview[k] = `array(${v.length})`;
      else if (typeof v === 'object') preview[k] = `object(${Object.keys(v).length} keys)`;
      else preview[k] = `${typeof v}:${String(v).slice(0, 40)}`;
    }
    return `object(keys=${keys.join(',')}) ${JSON.stringify(preview)}`;
  }
  return typeof body;
}

/**
 * Encode a search parameter for the Akeneo REST API URL.
 * Encodes " : , to percent-encoded form but leaves { } [ ] as-is,
 * matching the encoding format the API expects.
 */
function encodeSearchParam(search: Record<string, unknown>): string {
  return JSON.stringify(search)
    .replace(/"/g, '%22')
    .replace(/:/g, '%3A')
    .replace(/,/g, '%2C');
}

/**
 * Check existence by searching with a code IN filter.
 * Batches codes in groups of 50, queries `basePath?search={"code":[{"operator":"IN","value":[...]}]}&limit=100`.
 * If the search response can't be parsed (gateway body issue), falls back to individual GETs.
 * Throws AccessDeniedError on 403/401.
 */
async function checkBySearchIN(
  requiredCodes: Set<string>,
  basePath: string,
  config: SyncConfig
): Promise<string[]> {
  if (requiredCodes.size === 0) return [];

  const allCodes = Array.from(requiredCodes);
  const existingCodes = new Set<string>();
  const BATCH_SIZE = 50;

  for (let i = 0; i < allCodes.length; i += BATCH_SIZE) {
    const batch = allCodes.slice(i, i + BATCH_SIZE);
    const search = encodeSearchParam({ code: [{ operator: 'IN', value: batch }] });
    const path = `${basePath}?search=${search}&limit=100`;

    const res = await destinationGet(path, config);

    if (res.status === 403 || res.status === 401) {
      throw new AccessDeniedError(res.status);
    }
    if (res.status === 0 && res.error && i === 0) {
      throw new AccessDeniedError(403);
    }

    if (res.status >= 200 && res.status < 300) {
      const codes = res.body ? extractItemCodes(res.body) : [];
      if (codes.length === 0 && i === 0 && batch.length > 0 && !isValidListResponse(res.body)) {
        // First batch returned 2xx but body isn't a recognizable list — throw with diagnostics
        throw new Error(
          `Could not parse ${basePath} search response (HTTP ${res.status}). ` +
          `Body: ${bodyDiag(res.body)}`
        );
      }
      for (const code of codes) {
        existingCodes.add(code);
      }
    }
  }

  return allCodes.filter((code) => !existingCodes.has(code));
}

/**
 * List all items from a paginated endpoint, build a set of existing codes,
 * then diff against the required codes.
 * Used for attribute options where search IN may not be supported.
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

    const codes = extractItemCodes(res.body);
    for (const code of codes) {
      existingCodes.add(code);
    }
    hasMore = codes.length === 100;
    page++;
  }

  return Array.from(requiredCodes).filter((code) => !existingCodes.has(code));
}

/**
 * Check reference entity records by individual GET requests.
 * Throws AccessDeniedError on 403/401.
 */
async function checkRecordsByGet(
  refEntityCode: string,
  requiredCodes: Set<string>,
  config: SyncConfig
): Promise<string[]> {
  if (requiredCodes.size === 0) return [];

  const missing: string[] = [];
  const basePath = `/reference-entities/${encodeURIComponent(refEntityCode)}/records`;
  let firstRequest = true;

  for (const code of requiredCodes) {
    const res = await destinationGet(
      `${basePath}/${encodeURIComponent(code)}`,
      config
    );
    if (res.status === 403 || res.status === 401) {
      throw new AccessDeniedError(res.status);
    }
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
