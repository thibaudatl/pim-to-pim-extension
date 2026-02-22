import { useState } from 'react';
import { Button, Badge, Helper, Checkbox } from 'akeneo-design-system';
import styled from 'styled-components';
import type { UseDependencyCheckResult } from '../../hooks/useDependencyCheck';
import type { SyncConfig, DependencyType, DependencyResolution, DependencyTypeReport, DepSyncItem } from '../../sync/types';

const ProgressBar = styled.div<{ $pct: number }>`
  height: 6px;
  background: #e8ebee;
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 16px;

  &::after {
    content: '';
    display: block;
    height: 100%;
    width: ${({ $pct }) => $pct}%;
    background: #5e4aba;
    border-radius: 3px;
    transition: width 0.3s ease;
  }
`;

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

const RESOLUTION_LABELS: Record<DependencyResolution, { label: string; color: string }> = {
  create: { label: 'Auto-create', color: '#2FAF7B' },
  strip: { label: 'Strip from payload', color: '#F5A623' },
  skip: { label: 'Skip (will fail)', color: '#D4604A' },
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

interface DependencyCheckStepProps {
  depCheck: UseDependencyCheckResult;
  config: SyncConfig;
  onBack: () => void;
}

export function DependencyCheckStep({ depCheck, config, onBack }: DependencyCheckStepProps) {
  const { phase, progressMessage, error, report, depSyncItems, resolve,
    excludedAttributes, excludedCategories, setExcludedAttributes, setExcludedCategories } = depCheck;

  function handleExcludeChange(type: DependencyType, excludedCodes: string[]) {
    if (type === 'attribute') setExcludedAttributes(excludedCodes);
    else if (type === 'category') setExcludedCategories(excludedCodes);
  }

  // Error phase — unexpected error (not 403 per-type)
  if (phase === 'error') {
    return (
      <div>
        <div style={{ marginBottom: '16px' }}>
          <Helper level="error" inline={false}>
            {error ?? 'An unknown error occurred while checking dependencies.'}
          </Helper>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button level="tertiary" onClick={onBack}>
            ← Configure
          </Button>
        </div>
      </div>
    );
  }

  // Analyzing phase
  if (phase === 'analyzing') {
    return (
      <div>
        <ProgressBar $pct={50} />
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: '14px', fontWeight: 500, color: '#11324D', marginBottom: '8px' }}>
            Checking destination environment…
          </div>
          <div style={{ fontSize: '13px', color: '#67768A' }}>{progressMessage}</div>
        </div>
      </div>
    );
  }

  // Report phase — show what's missing
  if (phase === 'report' && report) {
    const hasCreatable = report.types.some((t) => t.missing.length > 0 && t.resolution === 'create');
    const hasStrippable = report.types.some((t) => t.missing.length > 0 && t.resolution === 'strip');
    const hasAccessDenied = report.types.some((t) => t.accessDenied);

    return (
      <div>
        {progressMessage && (
          <div style={{ marginBottom: '16px' }}>
            <Helper level="error" inline={false}>{progressMessage}</Helper>
          </div>
        )}

        {hasAccessDenied && (
          <div style={{ marginBottom: '16px' }}>
            <Helper level="warning" inline={false}>
              Some resource types could not be checked (access denied). The destination PIM token may lack read permissions for those resources. They will be skipped during dependency check.
            </Helper>
          </div>
        )}

        {report.totalMissing > 0 ? (
          <div style={{
            padding: '12px 16px', background: '#FFF8E7', border: '1px solid #F5A623',
            borderRadius: '4px', marginBottom: '16px', fontSize: '13px', color: '#11324D',
          }}>
            <strong>{report.totalMissing}</strong> missing dependenc{report.totalMissing === 1 ? 'y' : 'ies'} detected in the destination environment.
            Choose how to handle each type below.
          </div>
        ) : (
          <div style={{
            padding: '12px 16px', background: '#F0FDF4', border: '1px solid #2FAF7B',
            borderRadius: '4px', marginBottom: '16px', fontSize: '13px', color: '#2FAF7B',
            fontWeight: 500,
          }}>
            No missing dependencies detected in the checked resource types.
          </div>
        )}

        {/* Type cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
          {report.types.map((t) => (
            <TypeCard
              key={t.type}
              typeReport={t}
              onResolutionChange={depCheck.setResolution}
              excludedCodes={t.type === 'attribute' ? excludedAttributes : t.type === 'category' ? excludedCategories : undefined}
              onExcludeChange={handleExcludeChange}
              disabled={t.type === 'category' && config.skipCategories}
            />
          ))}
        </div>

        {/* Legend */}
        {(hasCreatable || hasStrippable) && (
          <div style={{ marginBottom: '16px', fontSize: '12px', color: '#67768A' }}>
            {hasCreatable && <span style={{ marginRight: '16px' }}>Auto-create: entities will be copied from source to destination.</span>}
            {hasStrippable && <span>Strip: references will be removed from product payloads before sync.</span>}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <Button level="tertiary" onClick={onBack}>
            ← Configure
          </Button>
          <Button level="primary" onClick={() => resolve(config)}>
            Resolve & Proceed →
          </Button>
        </div>
      </div>
    );
  }

  // Resolving phase
  if (phase === 'resolving') {
    const total = depSyncItems.length;
    const done = depSyncItems.filter((i) => i.status === 'success' || i.status === 'error').length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    return (
      <div>
        <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#67768A' }}>
          <span>Creating dependencies…</span>
          <span>{done} / {total}</span>
        </div>
        <ProgressBar $pct={pct} />

        <div style={{
          border: '1px solid #E8EBEE', borderRadius: '4px', overflow: 'hidden',
          maxHeight: '400px', overflowY: 'auto',
        }}>
          {depSyncItems.map((item, idx) => (
            <div
              key={`${item.type}-${item.parentCode ?? ''}-${item.code}`}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: '10px',
                padding: '8px 14px', fontSize: '13px', flexWrap: 'wrap',
                borderBottom: idx < depSyncItems.length - 1 ? '1px solid #F5F5FA' : 'none',
                background: item.status === 'error' ? '#FFF5F5'
                  : item.status === 'success' ? '#F0FDF4'
                  : item.status === 'in_progress' ? '#F5F5FA' : '#FFFFFF',
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
      </div>
    );
  }

  // Idle / fallback
  return (
    <div style={{ padding: '20px 0', textAlign: 'center' }}>
      <Helper level="info" inline={false}>
        Preparing dependency check…
      </Helper>
    </div>
  );
}

// --------------- TypeCard sub-component ---------------

function TypeCard({
  typeReport,
  onResolutionChange,
  excludedCodes,
  onExcludeChange,
  disabled = false,
}: {
  typeReport: DependencyTypeReport;
  onResolutionChange: (type: DependencyType, resolution: DependencyResolution) => void;
  excludedCodes?: string[];
  onExcludeChange?: (type: DependencyType, excludedCodes: string[]) => void;
  disabled?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const { type, total, missing, resolution, accessDenied } = typeReport;
  const allPresent = missing.length === 0 && !accessDenied;
  const isGroupType = type === 'group';
  const supportsExclusion = (type === 'attribute' || type === 'category') && missing.length > 0;
  const excluded = excludedCodes ?? [];
  const excludedSet = new Set(excluded);

  if (disabled) {
    return (
      <div style={{
        border: '1px solid #E8EBEE', borderRadius: '4px',
        background: '#F5F5FA', overflow: 'hidden', opacity: 0.6,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '10px 14px',
        }}>
          <span style={{ fontSize: '14px', fontWeight: 700, flexShrink: 0, color: '#A1A9B7' }}>
            ⊘
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: 500, color: '#A1A9B7' }}>
              {TYPE_LABELS[type]}
            </div>
            <div style={{ fontSize: '12px', color: '#A1A9B7' }}>
              Skipped — stripped from payload
            </div>
          </div>
        </div>
      </div>
    );
  }

  const borderColor = accessDenied ? '#67768A' : allPresent ? '#2FAF7B' : resolution === 'create' ? '#F5A623' : '#D4604A';
  const bgColor = accessDenied ? '#F5F5FA' : allPresent ? '#F0FDF4' : '#FFFFFF';

  function toggleItem(code: string) {
    if (!onExcludeChange) return;
    const newExcluded = excludedSet.has(code)
      ? excluded.filter((c) => c !== code)
      : [...excluded, code];
    onExcludeChange(type, newExcluded);
  }

  function toggleAll() {
    if (!onExcludeChange) return;
    const allExcluded = excluded.length === missing.length;
    onExcludeChange(type, allExcluded ? [] : missing.map((m) => m.code));
  }

  return (
    <div style={{
      border: `1px solid ${borderColor}`, borderRadius: '4px',
      background: bgColor, overflow: 'hidden',
    }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '10px 14px', cursor: missing.length > 0 ? 'pointer' : 'default',
        }}
        onClick={() => missing.length > 0 && setExpanded(!expanded)}
      >
        <span style={{
          fontSize: '14px', fontWeight: 700, flexShrink: 0,
          color: accessDenied ? '#67768A' : allPresent ? '#2FAF7B' : '#F5A623',
        }}>
          {accessDenied ? '⊘' : allPresent ? '✓' : '!'}
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '13px', fontWeight: 500, color: '#11324D' }}>
            {TYPE_LABELS[type]}
            {supportsExclusion && excluded.length > 0 && (
              <span style={{ fontWeight: 400, fontSize: '12px', color: '#67768A', marginLeft: '8px' }}>
                ({excluded.length} excluded)
              </span>
            )}
          </div>
          <div style={{ fontSize: '12px', color: '#67768A' }}>
            {accessDenied
              ? 'Access denied — cannot check this resource'
              : allPresent
              ? `All ${total} present`
              : `${missing.length} missing out of ${total}`}
          </div>
        </div>
        {!accessDenied && !allPresent && !isGroupType && (
          <select
            value={resolution}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onResolutionChange(type, e.target.value as DependencyResolution)}
            style={{
              fontSize: '12px', padding: '4px 8px', borderRadius: '4px',
              border: '1px solid #E8EBEE', background: '#FAFAFA', color: '#11324D',
              cursor: 'pointer',
            }}
          >
            <option value="create">Auto-create</option>
            <option value="strip">Strip</option>
            <option value="skip">Skip</option>
          </select>
        )}
        {!accessDenied && !allPresent && isGroupType && (
          <span style={{ fontSize: '12px', color: '#67768A', fontStyle: 'italic' }}>
            Strip only (no group API)
          </span>
        )}
        {missing.length > 0 && (
          <span style={{ fontSize: '13px', color: '#67768A', flexShrink: 0 }}>
            {expanded ? '▾' : '▸'}
          </span>
        )}
      </div>
      {expanded && missing.length > 0 && (
        <div style={{
          borderTop: '1px solid #E8EBEE', maxHeight: '200px', overflowY: 'auto',
        }}>
          {supportsExclusion && (
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '8px 14px', borderBottom: '1px solid #E8EBEE',
                background: '#FAFAFA', cursor: 'pointer',
              }}
              onClick={(e) => { e.stopPropagation(); toggleAll(); }}
            >
              <div style={{ paddingTop: '2px' }}>
                <Checkbox
                  checked={excluded.length === 0}
                  onChange={toggleAll}
                >
                  {''}
                </Checkbox>
              </div>
              <div style={{ fontSize: '12px', fontWeight: 500, color: '#11324D' }}>
                {excluded.length === 0 ? 'Deselect all' : 'Select all'}
              </div>
            </div>
          )}
          {missing.map((item) => {
            const isExcluded = excludedSet.has(item.code);
            return (
              <div
                key={`${item.parentCode ?? ''}-${item.code}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '6px 14px',
                  cursor: supportsExclusion ? 'pointer' : 'default',
                  borderBottom: '1px solid #F5F5FA',
                }}
                onClick={supportsExclusion ? (e) => { e.stopPropagation(); toggleItem(item.code); } : undefined}
              >
                {supportsExclusion && (
                  <div style={{ paddingTop: '2px' }}>
                    <Checkbox
                      checked={!isExcluded}
                      onChange={() => toggleItem(item.code)}
                    >
                      {''}
                    </Checkbox>
                  </div>
                )}
                <span
                  style={{
                    fontFamily: 'monospace', fontSize: '11px',
                    color: isExcluded ? '#A1A9B7' : '#67768A',
                    padding: '2px 0',
                  }}
                >
                  {item.parentCode ? `${item.parentCode} → ` : ''}{item.code}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
