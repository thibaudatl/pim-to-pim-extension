import type { SyncConfig, DependencyItem, DepSyncItem } from './types';
import { destinationPatch, destinationPost, destinationGet } from './destinationClient';

type OnItemUpdate = (items: DepSyncItem[]) => void;

/**
 * Create missing entities from source PIM to destination PIM.
 * Items are processed in dependency order.
 */
export async function createDependencies(
  items: DependencyItem[],
  config: SyncConfig,
  onUpdate: OnItemUpdate
): Promise<DepSyncItem[]> {
  // Group items by type in creation order
  const ordered = orderByType(items);

  const syncItems: DepSyncItem[] = ordered.map((item) => ({
    type: item.type,
    code: item.code,
    parentCode: item.parentCode,
    status: 'pending',
  }));
  onUpdate([...syncItems]);

  // Track attribute groups we've ensured exist
  const ensuredAttrGroups = new Set<string>();

  for (let i = 0; i < syncItems.length; i++) {
    syncItems[i] = { ...syncItems[i], status: 'in_progress' };
    onUpdate([...syncItems]);

    try {
      const item = ordered[i];
      let error: string | undefined;

      switch (item.type) {
        case 'attribute':
          error = await createAttribute(item.code, config, ensuredAttrGroups);
          break;
        case 'attribute_option':
          error = await createAttributeOption(item.code, item.parentCode!, config);
          break;
        case 'reference_entity_record':
          error = await createReferenceEntityRecord(item.code, item.parentCode!, config);
          break;
        case 'family':
          error = await createFamily(item.code, config);
          break;
        case 'family_variant':
          error = await createFamilyVariant(item.code, item.parentCode!, config);
          break;
        case 'category':
          error = await createCategory(item.code, config);
          break;
        case 'association_type':
          error = await createAssociationType(item.code, config);
          break;
        default:
          error = `Unsupported type: ${item.type}`;
      }

      syncItems[i] = {
        ...syncItems[i],
        status: error ? 'error' : 'success',
        error,
      };
    } catch (err) {
      syncItems[i] = {
        ...syncItems[i],
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      };
    }

    onUpdate([...syncItems]);
  }

  return syncItems;
}

/**
 * Order items by type in the correct creation order:
 * attributes -> attribute_options -> families -> family_variants -> categories -> association_types
 */
function orderByType(items: DependencyItem[]): DependencyItem[] {
  const typeOrder: Record<string, number> = {
    attribute: 0,
    attribute_option: 1,
    reference_entity_record: 2,
    family: 3,
    family_variant: 4,
    category: 5,
    association_type: 6,
  };

  const sorted = [...items].sort((a, b) => {
    const orderA = typeOrder[a.type] ?? 99;
    const orderB = typeOrder[b.type] ?? 99;
    return orderA - orderB;
  });

  // Sort categories so parents come before children
  // (naive: shorter codes / codes without certain parent refs first — full parent-child ordering
  //  is handled by fetching parent info from source)
  return sorted;
}

async function createAttribute(
  code: string,
  config: SyncConfig,
  ensuredAttrGroups: Set<string>
): Promise<string | undefined> {
  // Fetch from source
  const attr = await globalThis.PIM.api.attribute_v1.get({ code });
  if (!attr) return `Attribute "${code}" not found in source PIM`;

  // Ensure attribute group exists in destination
  if (attr.group && !ensuredAttrGroups.has(attr.group)) {
    await ensureAttributeGroup(attr.group, config);
    ensuredAttrGroups.add(attr.group);
  }

  // Build payload — strip read-only/computed fields
  const payload: Record<string, unknown> = {
    code: attr.code,
    type: attr.type,
    group: attr.group,
    labels: attr.labels,
    localizable: attr.localizable,
    scopable: attr.scopable,
    unique: attr.unique,
  };

  // Add type-specific fields
  if (attr.sortOrder != null) payload.sort_order = attr.sortOrder;
  if (attr.maxCharacters != null) payload.max_characters = attr.maxCharacters;
  if (attr.validationRule != null) payload.validation_rule = attr.validationRule;
  if (attr.validationRegexp != null) payload.validation_regexp = attr.validationRegexp;
  if (attr.wysiwygEnabled != null) payload.wysiwyg_enabled = attr.wysiwygEnabled;
  if (attr.decimalsAllowed != null) payload.decimals_allowed = attr.decimalsAllowed;
  if (attr.negativeAllowed != null) payload.negative_allowed = attr.negativeAllowed;
  if (attr.minValue != null) payload.min_value = attr.minValue;
  if (attr.maxValue != null) payload.max_value = attr.maxValue;
  if (attr.metricFamily != null) payload.metric_family = attr.metricFamily;
  if (attr.defaultMetricUnit != null) payload.default_metric_unit = attr.defaultMetricUnit;
  if (attr.maxFileSize != null) payload.max_file_size = attr.maxFileSize;
  if (attr.allowedExtensions != null) payload.allowed_extensions = attr.allowedExtensions;
  if (attr.dateMin != null) payload.date_min = attr.dateMin;
  if (attr.dateMax != null) payload.date_max = attr.dateMax;
  if (attr.referenceDataName != null) payload.reference_data_name = attr.referenceDataName;
  if (attr.availableLocales && attr.availableLocales.length > 0) {
    payload.available_locales = attr.availableLocales;
  }

  const res = await destinationPatch(
    `/attributes/${encodeURIComponent(code)}`,
    payload,
    config
  );
  if (res.error) return res.error;
  return undefined;
}

async function ensureAttributeGroup(
  groupCode: string,
  config: SyncConfig
): Promise<void> {
  // Check if exists in destination
  const check = await destinationGet(
    `/attribute-groups/${encodeURIComponent(groupCode)}`,
    config
  );
  if (check.status === 200) return;

  // Fetch from source and create
  try {
    const group = await globalThis.PIM.api.attribute_group_v1.get({ code: groupCode });
    await destinationPatch(
      `/attribute-groups/${encodeURIComponent(groupCode)}`,
      { code: group.code, labels: group.labels },
      config
    );
  } catch {
    // Best effort — if group doesn't exist in source either, attribute creation
    // will fall back to the default group
  }
}

async function createAttributeOption(
  optionCode: string,
  attributeCode: string,
  config: SyncConfig
): Promise<string | undefined> {
  // Fetch from source
  const option = await globalThis.PIM.api.attribute_option_v1.get({
    attribute_code: attributeCode,
    code: optionCode,
  });

  const payload: Record<string, unknown> = {
    code: option.code,
    labels: option.labels,
  };
  if (option.sortOrder != null) payload.sort_order = option.sortOrder;

  const res = await destinationPatch(
    `/attributes/${encodeURIComponent(attributeCode)}/options/${encodeURIComponent(optionCode)}`,
    payload,
    config
  );
  if (res.error) {
    const bodyStr = res.body != null ? JSON.stringify(res.body) : 'null';
    return `HTTP ${res.status} — ${res.error} | body: ${bodyStr}`;
  }
  return undefined;
}

async function createReferenceEntityRecord(
  recordCode: string,
  refEntityCode: string,
  config: SyncConfig
): Promise<string | undefined> {
  const record = await globalThis.PIM.api.reference_entity_record_v1.get({
    referenceEntityCode: refEntityCode,
    recordCode,
  });

  const payload: Record<string, unknown> = {
    code: record.code,
    values: record.values,
  };

  const res = await destinationPatch(
    `/reference-entities/${encodeURIComponent(refEntityCode)}/records/${encodeURIComponent(recordCode)}`,
    payload,
    config
  );
  if (res.error) return res.error;
  return undefined;
}

async function createFamily(
  code: string,
  config: SyncConfig
): Promise<string | undefined> {
  const family = await globalThis.PIM.api.family_v1.get({ code });

  const payload: Record<string, unknown> = {
    code: family.code,
    labels: family.labels,
    attributes: family.attributes,
    attribute_as_label: family.attributeAsLabel,
    attribute_as_image: family.attributeAsImage,
    attribute_requirements: family.attributeRequirements,
  };

  const res = await destinationPatch(
    `/families/${encodeURIComponent(code)}`,
    payload,
    config
  );
  if (res.error) return res.error;
  return undefined;
}

async function createFamilyVariant(
  variantCode: string,
  familyCode: string,
  config: SyncConfig
): Promise<string | undefined> {
  const variant = await globalThis.PIM.api.family_variant_v1.get({
    familyCode,
    code: variantCode,
  });

  const payload: Record<string, unknown> = {
    code: variant.code,
    labels: variant.labels,
    variant_attribute_sets: variant.variantAttributeSets?.map((vas) => ({
      level: vas.level,
      axes: vas.axes,
      attributes: vas.attributes,
    })),
  };

  const res = await destinationPatch(
    `/families/${encodeURIComponent(familyCode)}/variants/${encodeURIComponent(variantCode)}`,
    payload,
    config
  );
  if (res.error) return res.error;
  return undefined;
}

async function createCategory(
  code: string,
  config: SyncConfig
): Promise<string | undefined> {
  const category = await globalThis.PIM.api.category_v1.get({ code });

  // If this category has a parent, ensure the parent exists first
  if (category.parent) {
    const parentCheck = await destinationGet(
      `/categories/${encodeURIComponent(category.parent)}`,
      config
    );
    if (parentCheck.status === 404) {
      // Recursively create parent
      const parentErr = await createCategory(category.parent, config);
      if (parentErr) return `Failed to create parent category "${category.parent}": ${parentErr}`;
    }
  }

  const payload: Record<string, unknown> = {
    code: category.code,
    parent: category.parent,
    labels: category.labels,
  };

  const res = await destinationPatch(
    `/categories/${encodeURIComponent(code)}`,
    payload,
    config
  );
  if (res.error) return res.error;
  return undefined;
}

async function createAssociationType(
  code: string,
  config: SyncConfig
): Promise<string | undefined> {
  const assocType = await globalThis.PIM.api.association_type_v1.get({ code });

  const payload: Record<string, unknown> = {
    code: assocType.code,
    labels: assocType.labels,
    is_quantified: assocType.isQuantified,
    is_two_way: assocType.isTwoWay,
  };

  const res = await destinationPatch(
    `/association-types/${encodeURIComponent(code)}`,
    payload,
    config
  );
  if (res.error) return res.error;
  return undefined;
}
