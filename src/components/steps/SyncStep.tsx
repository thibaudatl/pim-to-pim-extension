import { Button, Badge, Helper } from 'akeneo-design-system';
import styled from 'styled-components';
import type { UseSyncExecutionResult } from '../../hooks/useSyncExecution';
import type { SyncConfig, SyncItem } from '../../sync/types';

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

function StatusIcon({ status }: { status: SyncItem['status'] }) {
  const map: Record<SyncItem['status'], { icon: string; color: string }> = {
    pending: { icon: '○', color: '#67768A' },
    in_progress: { icon: '◑', color: '#5E4ABA' },
    success: { icon: '✓', color: '#2FAF7B' },
    error: { icon: '✗', color: '#D4604A' },
    skipped: { icon: '—', color: '#67768A' },
  };
  const { icon, color } = map[status];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '20px',
        height: '20px',
        fontSize: '14px',
        fontWeight: 700,
        color,
        flexShrink: 0,
      }}
    >
      {icon}
    </span>
  );
}

interface SyncStepProps {
  sync: UseSyncExecutionResult;
  config: SyncConfig;
  onBack: () => void;
  backLabel?: string;
}

export function SyncStep({ sync, config, onBack, backLabel = '← Configure' }: SyncStepProps) {
  const { items, isRunning, isDone, retryFailed } = sync;

  const createdCount = items.filter((i) => i.status === 'success' && i.httpStatus === 201).length;
  const updatedCount = items.filter((i) => i.status === 'success' && i.httpStatus === 204).length;
  const doneCount = createdCount + updatedCount;
  const errorCount = items.filter((i) => i.status === 'error').length;
  const skippedCount = items.filter((i) => i.status === 'skipped').length;
  const total = items.length;
  const processedCount = doneCount + errorCount + skippedCount;
  const pct = total > 0 ? Math.round((processedCount / total) * 100) : 0;

  return (
    <div>
      {/* Progress bar */}
      <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#67768A' }}>
        <span>{isRunning ? 'Syncing…' : isDone ? 'Sync complete' : ''}</span>
        <span>
          {processedCount} / {total}
        </span>
      </div>
      <ProgressBar $pct={pct} />

      {/* Summary when done */}
      {isDone && (
        <div style={{ marginBottom: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {createdCount > 0 && (
            <span
              style={{
                padding: '6px 12px',
                background: '#F0FDF4',
                border: '1px solid #2FAF7B',
                borderRadius: '4px',
                fontSize: '13px',
                color: '#2FAF7B',
                fontWeight: 600,
              }}
            >
              ✓ {createdCount} created
            </span>
          )}
          {updatedCount > 0 && (
            <span
              style={{
                padding: '6px 12px',
                background: '#F0FDF4',
                border: '1px solid #2FAF7B',
                borderRadius: '4px',
                fontSize: '13px',
                color: '#2FAF7B',
                fontWeight: 600,
              }}
            >
              ✓ {updatedCount} updated
            </span>
          )}
          {errorCount > 0 && (
            <span
              style={{
                padding: '6px 12px',
                background: '#FFF5F5',
                border: '1px solid #D4604A',
                borderRadius: '4px',
                fontSize: '13px',
                color: '#D4604A',
                fontWeight: 600,
              }}
            >
              ✗ {errorCount} failed
            </span>
          )}
          {skippedCount > 0 && (
            <span
              style={{
                padding: '6px 12px',
                background: '#F5F5F5',
                border: '1px solid #C7CCD4',
                borderRadius: '4px',
                fontSize: '13px',
                color: '#67768A',
                fontWeight: 600,
              }}
            >
              — {skippedCount} skipped
            </span>
          )}
        </div>
      )}

      {/* Item list */}
      <div
        style={{
          border: '1px solid #E8EBEE',
          borderRadius: '4px',
          overflow: 'hidden',
          maxHeight: '400px',
          overflowY: 'auto',
        }}
      >
        {items.map((item, idx) => (
          <div
            key={`${item.type}-${item.id}`}
            style={{
              borderBottom: idx < items.length - 1 ? '1px solid #F5F5FA' : 'none',
              background:
                item.status === 'error'
                  ? '#FFF5F5'
                  : item.status === 'success'
                  ? '#F0FDF4'
                  : item.status === 'in_progress'
                  ? '#F5F5FA'
                  : '#FFFFFF',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 14px',
                fontSize: '13px',
              }}
            >
              <StatusIcon status={item.status} />
              <Badge level={item.type === 'product_model' ? 'secondary' : 'primary'}>
                {item.type === 'product_model' ? 'model' : 'product'}
              </Badge>
              <div
                style={{
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.type === 'product' && item.uuid !== item.id && (
                  <span style={{ fontWeight: 500, fontSize: '13px', color: '#11324D' }}>{item.id}</span>
                )}
                {item.type === 'product' && item.uuid !== item.id && (
                  <span style={{ color: '#67768A', margin: '0 6px' }}>·</span>
                )}
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: item.type === 'product' && item.uuid !== item.id ? '11px' : '12px',
                    color: item.type === 'product' && item.uuid !== item.id ? '#67768A' : '#11324D',
                  }}
                >
                  {item.type === 'product' ? item.uuid : item.id}
                </span>
              </div>
              {item.httpStatus !== undefined && (
                <span
                  style={{
                    fontSize: '11px',
                    flexShrink: 0,
                    fontWeight: 500,
                    color: item.status === 'success' ? '#2FAF7B' : '#D4604A',
                  }}
                >
                  {item.httpStatus === 201
                    ? 'created'
                    : item.httpStatus === 204
                    ? 'updated'
                    : `HTTP ${item.httpStatus}`}
                </span>
              )}
            </div>
            {item.error && (
              <div
                style={{
                  padding: '6px 14px 10px 44px',
                  fontSize: '12px',
                  color: '#D4604A',
                }}
              >
                {item.error}
                {item.payload && Object.keys(item.payload).length > 0 && (
                  <details style={{ marginTop: '6px' }}>
                    <summary style={{ cursor: 'pointer', color: '#67768A', fontSize: '11px' }}>
                      Show payload
                    </summary>
                    <pre
                      style={{
                        marginTop: '4px',
                        padding: '8px',
                        background: '#F5F5FA',
                        borderRadius: '4px',
                        fontSize: '11px',
                        color: '#11324D',
                        overflow: 'auto',
                        maxHeight: '200px',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                      }}
                    >
                      {JSON.stringify(item.payload, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Actions */}
      {isDone && (
        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <Button level="tertiary" onClick={onBack}>
            {backLabel}
          </Button>
          {errorCount > 0 && (
            <Button level="secondary" onClick={() => retryFailed(config)}>
              Retry failed ({errorCount})
            </Button>
          )}
          <Button
            level="primary"
            onClick={() => globalThis.PIM.navigate.refresh()}
          >
            Close
          </Button>
        </div>
      )}

      {!isDone && !isRunning && items.length === 0 && (
        <div style={{ marginTop: '16px' }}>
          <Helper level="info" inline={false}>
            Preparing to sync…
          </Helper>
        </div>
      )}
    </div>
  );
}
