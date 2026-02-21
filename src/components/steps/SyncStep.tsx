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
}

export function SyncStep({ sync, config }: SyncStepProps) {
  const { items, isRunning, isDone, retryFailed } = sync;

  const doneCount = items.filter((i) => i.status === 'success').length;
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
          {doneCount > 0 && (
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
              ✓ {doneCount} synced
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
              <span
                style={{
                  flex: 1,
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  color: '#11324D',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.id}
              </span>
              {item.httpStatus !== undefined && (
                <span
                  style={{
                    fontSize: '11px',
                    color: item.status === 'success' ? '#2FAF7B' : '#D4604A',
                    flexShrink: 0,
                    fontFamily: 'monospace',
                  }}
                >
                  HTTP {item.httpStatus}
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
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Actions */}
      {isDone && (
        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
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
