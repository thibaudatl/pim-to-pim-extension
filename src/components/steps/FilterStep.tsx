import { useState, useMemo, useEffect } from 'react';
import { Button, Badge, Helper, Checkbox } from 'akeneo-design-system';
import type { UseDependencyCheckResult } from '../../hooks/useDependencyCheck';
import type { SyncConfig, DependencyType, DepSyncItem } from '../../sync/types';
import { loadAttributeTypeMap } from '../../sync/dependencyExtractor';

const TYPE_LABELS: Record<DependencyType, string> = {
  attribute: 'Attributes',
  attribute_option: 'Attribute options',
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
  const isLong = error.length > 60;

  if (!isLong) {
    return (
      <span style={{ fontSize: '11px', color: '#D4604A', flexShrink: 0 }}>
        {error}
      </span>
    );
  }

  return (
    <span style={{ fontSize: '11px', color: '#D4604A', flexShrink: 0 }}>
      {expanded ? error : error.slice(0, 60) + '…'}
      <button
        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
        style={{
          marginLeft: '4px', background: 'none', border: 'none', padding: 0,
          color: '#67768A', fontSize: '11px', cursor: 'pointer', textDecoration: 'underline',
        }}
      >
        {expanded ? 'less' : 'more'}
      </button>
    </span>
  );
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
  const [attrTypeMap, setAttrTypeMap] = useState<Map<string, string>>(new Map());

  const hasErrors = depSyncItems.some((i) => i.status === 'error');
  const createdCount = depSyncItems.filter((i) => i.status === 'success').length;
  const errorCount = depSyncItems.filter((i) => i.status === 'error').length;
  const noMissing = report?.totalMissing === 0;

  // Load cached attribute type map
  useEffect(() => {
    loadAttributeTypeMap().then(setAttrTypeMap);
  }, []);

  // Set of attribute codes missing from destination
  const missingAttrCodes = useMemo(() => {
    const codes = new Set<string>();
    const attrReport = report?.types.find((t) => t.type === 'attribute');
    if (attrReport) {
      for (const item of attrReport.missing) codes.add(item.code);
    }
    return codes;
  }, [report]);

  // All attribute codes sorted: missing first, then alphabetical
  const sortedAttributeCodes = useMemo(() => {
    const codes = new Set<string>();
    for (const p of products) {
      if (p.values) for (const code of Object.keys(p.values)) codes.add(code);
    }
    for (const m of productModels) {
      if (m.values) for (const code of Object.keys(m.values)) codes.add(code);
    }
    return Array.from(codes).sort((a, b) => {
      const aMissing = missingAttrCodes.has(a);
      const bMissing = missingAttrCodes.has(b);
      if (aMissing && !bMissing) return -1;
      if (!aMissing && bMissing) return 1;
      return a.localeCompare(b);
    });
  }, [products, productModels, missingAttrCodes]);

  // Filtered by search
  const filteredAttributeCodes = useMemo(() => {
    if (!search.trim()) return sortedAttributeCodes;
    const q = search.toLowerCase();
    return sortedAttributeCodes.filter((code) => {
      if (code.toLowerCase().includes(q)) return true;
      const type = attrTypeMap.get(code);
      return type ? type.toLowerCase().includes(q) : false;
    });
  }, [sortedAttributeCodes, search, attrTypeMap]);

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
    const allExcluded = config.excludedAttributes.length === sortedAttributeCodes.length;
    onConfigChange({
      ...config,
      excludedAttributes: allExcluded ? [] : [...sortedAttributeCodes],
    });
  }

  /** Format raw PIM attribute type for display (e.g. pim_catalog_text -> text) */
  function formatAttrType(code: string): string | null {
    const raw = attrTypeMap.get(code);
    if (!raw) return null;
    return raw.replace(/^pim_catalog_/, '').replace(/_/g, ' ');
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
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '8px 14px', fontSize: '13px',
                borderBottom: idx < depSyncItems.length - 1 ? '1px solid #F5F5FA' : 'none',
                background: item.status === 'error' ? '#FFF5F5' : item.status === 'success' ? '#F0FDF4' : '#FFFFFF',
              }}
            >
              <StatusIcon status={item.status} />
              <Badge level="secondary">{TYPE_LABELS[item.type] ?? item.type}</Badge>
              <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#11324D', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.parentCode ? `${item.parentCode} → ` : ''}{item.code}
              </span>
              {item.error && (
                <ExpandableError error={item.error} />
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

      {/* Attribute filter — always expanded */}
      {sortedAttributeCodes.length > 0 && (
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
                  ({sortedAttributeCodes.length - config.excludedAttributes.length}/{sortedAttributeCodes.length} selected)
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

          {/* Attribute list */}
          <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
            {filteredAttributeCodes.map((code) => {
              const isIncluded = !config.excludedAttributes.includes(code);
              const isMissing = missingAttrCodes.has(code);
              const typeLabel = formatAttrType(code);
              return (
                <div
                  key={code}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '8px 16px',
                    borderBottom: '1px solid #F5F5FA',
                    cursor: 'pointer',
                    background: isMissing ? '#FFF5F5' : '#FFFFFF',
                  }}
                  onClick={() => toggleAttribute(code)}
                >
                  <div style={{ paddingTop: '2px' }}>
                    <Checkbox
                      checked={isIncluded}
                      onChange={() => toggleAttribute(code)}
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
                    }}
                  >
                    {code}
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
            })}
            {filteredAttributeCodes.length === 0 && (
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
