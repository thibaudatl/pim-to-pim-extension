import { useState, useMemo, useEffect } from 'react';
import { Button, Badge, Helper, Checkbox } from 'akeneo-design-system';
import type { UseDependencyCheckResult } from '../../hooks/useDependencyCheck';
import type { SyncConfig, DependencyType, DepSyncItem } from '../../sync/types';
import { loadAttributeTypeMap, loadAttributeMetaMap } from '../../sync/dependencyExtractor';
import type { AttributeMeta } from '../../sync/dependencyExtractor';

const TYPE_LABELS: Record<DependencyType, string> = {
  attribute: 'Attributes',
  attribute_option: 'Attribute options',
  reference_entity_record: 'Ref. entity records',
  asset: 'Assets',
  family: 'Families',
  family_variant: 'Family variants',
  category: 'Categories',
  association_type: 'Association types',
  group: 'Groups',
};

function StatusIcon({ status }: { status: DepSyncItem['status'] }) {
  const map: Record<DepSyncItem['status'], { icon: string; color: string }> = {
    pending: { icon: '○', color: '#67768A' },
    in_progress: { icon: '◑', color: '#5E4ABA' },
    success: { icon: '✓', color: '#2FAF7B' },
    error: { icon: '✗', color: '#D4604A' },
    skipped: { icon: '—', color: '#67768A' },
  };
  const { icon, color } = map[status];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: '20px', height: '20px', fontSize: '14px', fontWeight: 700, color, flexShrink: 0,
    }}>
      {icon}
    </span>
  );
}

function ExpandableError({ error }: { error: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = error.length > 80;

  if (!isLong) {
    return (
      <div style={{ fontSize: '11px', color: '#D4604A', wordBreak: 'break-word' }}>
        {error}
      </div>
    );
  }

  return (
    <div style={{
      fontSize: '11px', color: '#D4604A',
      wordBreak: 'break-word', whiteSpace: expanded ? 'pre-wrap' : undefined,
    }}>
      {expanded ? error : error.slice(0, 80) + '…'}
      <button
        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
        style={{
          marginLeft: '4px', background: 'none', border: 'none', padding: 0,
          color: '#67768A', fontSize: '11px', cursor: 'pointer', textDecoration: 'underline',
        }}
      >
        {expanded ? 'less' : 'more'}
      </button>
    </div>
  );
}

interface AttributeGroup {
  groupCode: string;
  label: string;
  codes: string[];
}

interface FilterStepProps {
  depCheck: UseDependencyCheckResult;
  products: Product[];
  productModels: ProductModel[];
  config: SyncConfig;
  onConfigChange: (config: SyncConfig) => void;
  onBack: () => void;
  onProceed: () => void;
}

export function FilterStep({
  depCheck,
  products,
  productModels,
  config,
  onConfigChange,
  onBack,
  onProceed,
}: FilterStepProps) {
  const { report, depSyncItems } = depCheck;
  const [search, setSearch] = useState('');
  const [attrMetaMap, setAttrMetaMap] = useState<Map<string, AttributeMeta>>(new Map());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const hasErrors = depSyncItems.some((i) => i.status === 'error');
  const createdCount = depSyncItems.filter((i) => i.status === 'success').length;
  const errorCount = depSyncItems.filter((i) => i.status === 'error').length;
  const noMissing = report?.totalMissing === 0;

  const catalogLocale = globalThis.PIM.context.user.catalog_locale;

  // Load cached attribute meta map (populated by loadAttributeTypeMap)
  useEffect(() => {
    loadAttributeTypeMap().then(() => {
      setAttrMetaMap(loadAttributeMetaMap());
    });
  }, []);

  // Set of attribute codes still missing (exclude successfully created ones)
  const missingAttrCodes = useMemo(() => {
    const codes = new Set<string>();
    const attrReport = report?.types.find((t) => t.type === 'attribute');
    if (attrReport) {
      for (const item of attrReport.missing) codes.add(item.code);
    }
    // Remove attributes that were successfully created during dependency sync
    for (const item of depSyncItems) {
      if (item.type === 'attribute' && item.status === 'success') {
        codes.delete(item.code);
      }
    }
    return codes;
  }, [report, depSyncItems]);

  // Auto-exclude missing attributes by default
  useEffect(() => {
    if (missingAttrCodes.size === 0) return;
    const excluded = new Set(config.excludedAttributes);
    let changed = false;
    for (const code of missingAttrCodes) {
      if (!excluded.has(code)) {
        excluded.add(code);
        changed = true;
      }
    }
    if (changed) {
      onConfigChange({ ...config, excludedAttributes: Array.from(excluded) });
    }
  }, [missingAttrCodes]);

  // All attribute codes from products/models
  const allAttributeCodes = useMemo(() => {
    const codes = new Set<string>();
    for (const p of products) {
      if (p.values) for (const code of Object.keys(p.values)) codes.add(code);
    }
    for (const m of productModels) {
      if (m.values) for (const code of Object.keys(m.values)) codes.add(code);
    }
    return codes;
  }, [products, productModels]);

  // Build grouped data structure
  const { missingCodes, groups, totalVisible } = useMemo(() => {
    const excluded = new Set(config.excludedAttributes);
    const q = search.toLowerCase().trim();

    /** Resolve the display label for an attribute */
    function attrLabel(code: string): string {
      const meta = attrMetaMap.get(code);
      if (meta?.labels) {
        return meta.labels[catalogLocale] || meta.labels['en_US'] || code;
      }
      return code;
    }

    /** Format raw PIM attribute type for display */
    function formatType(code: string): string {
      const meta = attrMetaMap.get(code);
      if (!meta) return '';
      return meta.type.replace(/^pim_catalog_/, '').replace(/_/g, ' ');
    }

    /** Check if attribute matches search */
    function matchesSearch(code: string): boolean {
      if (!q) return true;
      if (code.toLowerCase().includes(q)) return true;
      const meta = attrMetaMap.get(code);
      if (meta) {
        if (meta.type.toLowerCase().includes(q)) return true;
        const label = meta.labels[catalogLocale] || meta.labels['en_US'] || '';
        if (label.toLowerCase().includes(q)) return true;
      }
      return false;
    }

    // Separate missing from grouped
    const missingArr: string[] = [];
    const groupMap = new Map<string, { label: string; codes: { code: string; sortOrder: number }[] }>();

    for (const code of allAttributeCodes) {
      if (!matchesSearch(code)) continue;

      if (missingAttrCodes.has(code)) {
        missingArr.push(code);
      } else {
        const meta = attrMetaMap.get(code);
        const groupCode = meta?.group || 'other';
        const groupLabel = meta?.groupLabels?.[catalogLocale]
          || meta?.groupLabels?.['en_US']
          || groupCode;
        const sortOrder = meta?.sortOrder ?? 0;

        if (!groupMap.has(groupCode)) {
          groupMap.set(groupCode, { label: groupLabel, codes: [] });
        }
        groupMap.get(groupCode)!.codes.push({ code, sortOrder });
      }
    }

    // Sort missing alphabetically
    missingArr.sort((a, b) => a.localeCompare(b));

    // Build sorted groups
    const groupArr: AttributeGroup[] = Array.from(groupMap.entries())
      .sort(([, a], [, b]) => a.label.localeCompare(b.label))
      .map(([groupCode, { label, codes }]) => ({
        groupCode,
        label,
        codes: codes
          .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code))
          .map((c) => c.code),
      }));

    let total = missingArr.length;
    for (const g of groupArr) total += g.codes.length;

    return { missingCodes: missingArr, groups: groupArr, totalVisible: total };
  }, [allAttributeCodes, missingAttrCodes, attrMetaMap, search, catalogLocale, config.excludedAttributes]);

  // --- Helpers ---

  function formatAttrType(code: string): string | null {
    const meta = attrMetaMap.get(code);
    if (!meta) return null;
    return meta.type.replace(/^pim_catalog_/, '').replace(/_/g, ' ');
  }

  function getAttrLabel(code: string): string | null {
    const meta = attrMetaMap.get(code);
    if (!meta?.labels) return null;
    const label = meta.labels[catalogLocale] || meta.labels['en_US'];
    return label || null;
  }

  function toggleAttribute(code: string) {
    const excluded = new Set(config.excludedAttributes);
    if (excluded.has(code)) {
      excluded.delete(code);
    } else {
      excluded.add(code);
    }
    onConfigChange({ ...config, excludedAttributes: Array.from(excluded) });
  }

  function toggleAllAttributes() {
    const allCodes = Array.from(allAttributeCodes);
    const allExcluded = config.excludedAttributes.length === allCodes.length;
    onConfigChange({
      ...config,
      excludedAttributes: allExcluded ? [] : [...allCodes],
    });
  }

  function toggleGroup(groupCode: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupCode)) {
        next.delete(groupCode);
      } else {
        next.add(groupCode);
      }
      return next;
    });
  }

  function toggleGroupSelection(codesInGroup: string[]) {
    const excluded = new Set(config.excludedAttributes);
    const allExcluded = codesInGroup.every((c) => excluded.has(c));
    for (const code of codesInGroup) {
      if (allExcluded) {
        excluded.delete(code);
      } else {
        excluded.add(code);
      }
    }
    onConfigChange({ ...config, excludedAttributes: Array.from(excluded) });
  }

  function getGroupCheckState(codesInGroup: string[]): boolean | 'mixed' {
    const excluded = new Set(config.excludedAttributes);
    const includedCount = codesInGroup.filter((c) => !excluded.has(c)).length;
    if (includedCount === 0) return false;
    if (includedCount === codesInGroup.length) return true;
    return 'mixed';
  }

  // --- Attribute row renderer ---

  function renderAttributeRow(code: string, isMissing: boolean) {
    const isIncluded = !config.excludedAttributes.includes(code);
    const typeLabel = formatAttrType(code);
    const label = getAttrLabel(code);

    return (
      <div
        key={code}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '6px 16px',
          paddingLeft: isMissing ? '16px' : '36px',
          borderBottom: '1px solid #F5F5FA',
          cursor: isMissing ? 'default' : 'pointer',
          background: isMissing ? '#FFF5F5' : '#FFFFFF',
          opacity: isMissing ? 0.6 : 1,
        }}
        onClick={isMissing ? undefined : () => toggleAttribute(code)}
      >
        <div style={{ paddingTop: '2px' }}>
          <Checkbox
            checked={isIncluded}
            readOnly={isMissing}
            onChange={isMissing ? undefined : () => toggleAttribute(code)}
          >
            {''}
          </Checkbox>
        </div>
        <span
          style={{
            fontFamily: 'monospace',
            fontSize: '12px',
            color: isMissing ? '#D4604A' : isIncluded ? '#11324D' : '#A1A9B7',
            fontWeight: isMissing ? 600 : 400,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {code}
          {label && (
            <span style={{ fontFamily: 'sans-serif', color: '#67768A', fontWeight: 400, marginLeft: '6px' }}>
              {label}
            </span>
          )}
        </span>
        {isMissing && (
          <span style={{
            fontSize: '10px', fontWeight: 600, color: '#D4604A',
            padding: '1px 6px', background: '#FFF5F5', border: '1px solid #D4604A',
            borderRadius: '3px', flexShrink: 0,
          }}>
            missing
          </span>
        )}
        {typeLabel && (
          <span style={{
            fontSize: '11px', color: '#67768A', flexShrink: 0,
          }}>
            {typeLabel}
          </span>
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={{
        padding: '12px 16px', background: '#F5F5FA', borderRadius: '4px',
        marginBottom: '16px', fontSize: '13px', color: '#11324D', lineHeight: '1.5',
      }}>
        Uncheck attributes below to exclude them from the sync payload. Their values will be stripped before sending products and product models to the destination, which is useful for attributes that don't exist or aren't needed in the target environment.
      </div>

      {/* Dependency sync results */}
      {noMissing ? (
        <div style={{
          padding: '16px', background: '#F0FDF4', border: '1px solid #2FAF7B',
          borderRadius: '4px', marginBottom: '16px', fontSize: '13px', color: '#2FAF7B',
          fontWeight: 500, textAlign: 'center',
        }}>
          All dependencies are present in the destination environment.
        </div>
      ) : (
        <div style={{ marginBottom: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {createdCount > 0 && (
            <span style={{
              padding: '6px 12px', background: '#F0FDF4', border: '1px solid #2FAF7B',
              borderRadius: '4px', fontSize: '13px', color: '#2FAF7B', fontWeight: 600,
            }}>
              ✓ {createdCount} created
            </span>
          )}
          {errorCount > 0 && (
            <span style={{
              padding: '6px 12px', background: '#FFF5F5', border: '1px solid #D4604A',
              borderRadius: '4px', fontSize: '13px', color: '#D4604A', fontWeight: 600,
            }}>
              ✗ {errorCount} failed
            </span>
          )}
        </div>
      )}

      {/* Dependency sync item list */}
      {depSyncItems.length > 0 && (
        <div style={{
          border: '1px solid #E8EBEE', borderRadius: '4px', overflow: 'hidden',
          maxHeight: '300px', overflowY: 'auto', marginBottom: '16px',
        }}>
          {depSyncItems.map((item, idx) => (
            <div
              key={`${item.type}-${item.parentCode ?? ''}-${item.code}`}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: '10px',
                padding: '8px 14px', fontSize: '13px', flexWrap: 'wrap',
                borderBottom: idx < depSyncItems.length - 1 ? '1px solid #F5F5FA' : 'none',
                background: item.status === 'error' ? '#FFF5F5' : item.status === 'success' ? '#F0FDF4' : '#FFFFFF',
              }}
            >
              <StatusIcon status={item.status} />
              <Badge level="secondary">{TYPE_LABELS[item.type] ?? item.type}</Badge>
              <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#11324D', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.parentCode ? `${item.parentCode} → ` : ''}{item.code}
              </span>
              {item.error && (
                <div style={{ width: '100%', paddingTop: '4px' }}>
                  <ExpandableError error={item.error} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {hasErrors && (
        <div style={{ marginBottom: '16px' }}>
          <Helper level="warning" inline={false}>
            Some dependencies could not be created. Products referencing them may fail during sync.
          </Helper>
        </div>
      )}

      {/* Attribute filter — grouped by attribute group */}
      {allAttributeCodes.size > 0 && (
        <div
          style={{
            border: '1px solid #E8EBEE',
            borderRadius: '4px',
            marginBottom: '20px',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '10px 16px',
              borderBottom: '1px solid #F5F5FA',
              background: '#FAFAFA',
              fontSize: '11px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: '#67768A',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>
              Attribute filter
              {config.excludedAttributes.length > 0 && (
                <span style={{ fontWeight: 400, textTransform: 'none', marginLeft: '8px' }}>
                  ({allAttributeCodes.size - config.excludedAttributes.length}/{allAttributeCodes.size} selected)
                </span>
              )}
            </span>
          </div>

          {/* Search bar */}
          <div style={{ padding: '8px 16px', borderBottom: '1px solid #E8EBEE', background: '#FAFAFA' }}>
            <input
              type="text"
              placeholder="Search attributes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 10px',
                fontSize: '13px',
                border: '1px solid #E8EBEE',
                borderRadius: '4px',
                outline: 'none',
                color: '#11324D',
                background: '#FFFFFF',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Select all toggle */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '10px 16px',
              borderBottom: '1px solid #E8EBEE',
              background: '#FAFAFA',
              cursor: 'pointer',
            }}
            onClick={toggleAllAttributes}
          >
            <div style={{ paddingTop: '2px' }}>
              <Checkbox
                checked={config.excludedAttributes.length === 0}
                onChange={toggleAllAttributes}
              >
                {''}
              </Checkbox>
            </div>
            <div style={{ fontSize: '13px', fontWeight: 500, color: '#11324D' }}>
              {config.excludedAttributes.length === 0 ? 'Deselect all' : 'Select all'}
            </div>
          </div>

          {/* Grouped attribute list */}
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {/* Missing attributes section (ungrouped, at top) */}
            {missingCodes.length > 0 && (
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 16px',
                    background: '#FFF5F5',
                    borderBottom: '1px solid #F5D4CF',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#D4604A',
                    textTransform: 'uppercase',
                    letterSpacing: '0.03em',
                  }}
                >
                  <span>Missing in destination ({missingCodes.length})</span>
                </div>
                {missingCodes.map((code) => renderAttributeRow(code, true))}
              </div>
            )}

            {/* Attribute groups */}
            {groups.map((group) => {
              const isCollapsed = collapsedGroups.has(group.groupCode);
              const checkState = getGroupCheckState(group.codes);

              return (
                <div key={group.groupCode}>
                  {/* Group header */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 16px',
                      background: '#FAFAFA',
                      borderBottom: '1px solid #E8EBEE',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    {/* Collapse arrow */}
                    <span
                      onClick={() => toggleGroup(group.groupCode)}
                      style={{
                        fontSize: '12px',
                        color: '#67768A',
                        width: '16px',
                        textAlign: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {isCollapsed ? '▸' : '▾'}
                    </span>
                    {/* Group checkbox */}
                    <div
                      style={{ paddingTop: '2px' }}
                      onClick={(e) => { e.stopPropagation(); toggleGroupSelection(group.codes); }}
                    >
                      <Checkbox
                        checked={checkState === true}
                        undetermined={checkState === 'mixed'}
                        onChange={() => toggleGroupSelection(group.codes)}
                      >
                        {''}
                      </Checkbox>
                    </div>
                    {/* Group label + count */}
                    <span
                      onClick={() => toggleGroup(group.groupCode)}
                      style={{
                        fontSize: '13px',
                        fontWeight: 500,
                        color: '#11324D',
                        flex: 1,
                      }}
                    >
                      {group.label}
                      <span style={{
                        fontWeight: 400,
                        color: '#67768A',
                        marginLeft: '6px',
                        fontSize: '12px',
                      }}>
                        ({group.codes.length})
                      </span>
                    </span>
                  </div>

                  {/* Group attributes (collapsible) */}
                  {!isCollapsed && group.codes.map((code) => renderAttributeRow(code, false))}
                </div>
              );
            })}

            {totalVisible === 0 && (
              <div style={{ padding: '16px', textAlign: 'center', fontSize: '13px', color: '#67768A' }}>
                No attributes match "{search}"
              </div>
            )}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
        <Button level="tertiary" onClick={onBack}>
          ← Dependencies
        </Button>
        <Button level="primary" onClick={onProceed}>
          Start Sync →
        </Button>
      </div>
    </div>
  );
}
