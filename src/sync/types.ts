export interface SyncConfig {
  env2Host: string;
  credentialsCode: string;
  includeParentModels: boolean;
  includeGrandparentModels: boolean;
  overwriteExisting: boolean;
  skipMediaValues: boolean;
  skipAssociations: boolean;
  excludedAttributes: string[];
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
