export interface SyncConfig {
  env2Host: string;
  credentialsCode: string;
  includeParentModels: boolean;
  includeGrandparentModels: boolean;
  includeVariantProducts: boolean;
  overwriteExisting: boolean;
  skipMediaValues: boolean;
  skipAssociations: boolean;
  skipCategories: boolean;
  excludedAttributes: string[];
  checkDependencies: boolean;
}

export type SyncItemType = 'product' | 'product_model';
export type SyncItemStatus = 'pending' | 'in_progress' | 'success' | 'error' | 'skipped';

export interface SyncItem {
  type: SyncItemType;
  /** product identifier (or UUID fallback) for products, code for product models */
  id: string;
  /** uuid of the source product (for display/lookup) */
  uuid?: string;
  payload: Record<string, unknown>;
  status: SyncItemStatus;
  httpStatus?: number;
  error?: string;
  /** true if this item was added as a dependency, not directly selected by the user */
  isAncestor: boolean;
}

// --------------- Dependency check types ---------------

export type DependencyType =
  | 'attribute'
  | 'attribute_option'
  | 'reference_entity'
  | 'reference_entity_record'
  | 'asset_family'
  | 'asset'
  | 'family'
  | 'family_variant'
  | 'category'
  | 'association_type'
  | 'group';

export type DependencyResolution = 'create' | 'strip' | 'skip';

export interface DependencyItem {
  type: DependencyType;
  code: string;
  /** For attribute_option: attribute code. For family_variant: family code. For reference_entity_record: reference entity code */
  parentCode?: string;
}

export interface DependencyTypeReport {
  type: DependencyType;
  total: number;
  missing: DependencyItem[];
  resolution: DependencyResolution;
  /** True when the destination returned 403/401 — check was skipped for this type */
  accessDenied?: boolean;
  /** True for display-only types (e.g. reference entities, asset families) — no auto-create/strip actions */
  informational?: boolean;
}

export interface DependencyReport {
  types: DependencyTypeReport[];
  totalMissing: number;
  /** True when any informational type has missing items (forces report display). */
  hasInfoWarnings?: boolean;
  /** Diagnostic messages from search/parse fallbacks (visible in report UI). */
  diagnostics?: string[];
}

export interface DepSyncItem {
  type: DependencyType;
  code: string;
  parentCode?: string;
  status: SyncItemStatus;
  error?: string;
}

export interface StrippedCodes {
  categories: Set<string>;
  groups: Set<string>;
  associationTypes: Set<string>;
  assetCodes: Set<string>;
}

export interface ExtractedDependencies {
  attributeCodes: Set<string>;
  /** Map of attribute code -> set of option codes (for select/multiselect) */
  attributeOptions: Map<string, Set<string>>;
  familyCodes: Set<string>;
  /** Map of family code -> set of family variant codes */
  familyVariants: Map<string, Set<string>>;
  categoryCodes: Set<string>;
  associationTypeCodes: Set<string>;
  groupCodes: Set<string>;
  /** Map of reference entity code -> set of record codes */
  referenceEntityRecords: Map<string, Set<string>>;
  /** Map of asset family code -> set of asset codes */
  assets: Map<string, Set<string>>;
}
