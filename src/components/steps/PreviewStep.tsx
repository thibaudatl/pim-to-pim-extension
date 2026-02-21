import { Button, Badge, Helper } from 'akeneo-design-system';
import type { SyncConfig, SyncItem } from '../../sync/types';

interface PreviewStepProps {
  items: SyncItem[];
  config: SyncConfig;
  onStart: () => void;
  onBack: () => void;
}

export function PreviewStep({ items, config, onStart, onBack }: PreviewStepProps) {
  const productCount = items.filter((i) => i.type === 'product').length;
  const modelCount = items.filter((i) => i.type === 'product_model').length;
  const ancestorCount = items.filter((i) => i.isAncestor).length;

  if (!config.env2Host) {
    return (
      <div>
        <Helper level="error" inline={false}>
          Target environment URL is not configured. Set <code>env2_host</code> in the extension's
          custom variables in PIM and reload.
        </Helper>
        <div style={{ marginTop: '16px' }}>
          <Button level="tertiary" onClick={onBack}>
            ← Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Summary */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '16px',
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            flex: 1,
            minWidth: '140px',
            padding: '12px 16px',
            border: '1px solid #E8EBEE',
            borderRadius: '4px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#5E4ABA' }}>{items.length}</div>
          <div style={{ fontSize: '12px', color: '#67768A' }}>Total items</div>
        </div>
        {productCount > 0 && (
          <div
            style={{
              flex: 1,
              minWidth: '140px',
              padding: '12px 16px',
              border: '1px solid #E8EBEE',
              borderRadius: '4px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#11324D' }}>
              {productCount}
            </div>
            <div style={{ fontSize: '12px', color: '#67768A' }}>Products</div>
          </div>
        )}
        {modelCount > 0 && (
          <div
            style={{
              flex: 1,
              minWidth: '140px',
              padding: '12px 16px',
              border: '1px solid #E8EBEE',
              borderRadius: '4px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#11324D' }}>{modelCount}</div>
            <div style={{ fontSize: '12px', color: '#67768A' }}>Product models</div>
          </div>
        )}
        {ancestorCount > 0 && (
          <div
            style={{
              flex: 1,
              minWidth: '140px',
              padding: '12px 16px',
              border: '1px solid #FFF8E1',
              background: '#FFFDE7',
              borderRadius: '4px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#B8860B' }}>
              {ancestorCount}
            </div>
            <div style={{ fontSize: '12px', color: '#67768A' }}>Added as dependencies</div>
          </div>
        )}
      </div>

      <Helper level="info" inline={false}>
        Items are listed in sync order: parent models first, then child models, then variant
        products.
      </Helper>

      {/* Item list */}
      <div
        style={{
          marginTop: '16px',
          border: '1px solid #E8EBEE',
          borderRadius: '4px',
          overflow: 'hidden',
          maxHeight: '360px',
          overflowY: 'auto',
        }}
      >
        {items.map((item, idx) => (
          <div
            key={`${item.type}-${item.id}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 14px',
              borderBottom: idx < items.length - 1 ? '1px solid #F5F5FA' : 'none',
              background: item.isAncestor ? '#FFFDE7' : '#FFFFFF',
              fontSize: '13px',
            }}
          >
            <span style={{ color: '#67768A', fontSize: '11px', minWidth: '20px' }}>
              {idx + 1}
            </span>
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
            {item.isAncestor && (
              <span style={{ fontSize: '11px', color: '#B8860B', flexShrink: 0 }}>
                dependency
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Target */}
      <div style={{ marginTop: '12px', fontSize: '12px', color: '#67768A' }}>
        Target:{' '}
        <span style={{ fontFamily: 'monospace', color: '#11324D' }}>{config.env2Host}</span>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
        <Button level="tertiary" onClick={onBack}>
          ← Back
        </Button>
        <Button level="primary" onClick={onStart} disabled={items.length === 0}>
          Start Sync →
        </Button>
      </div>
    </div>
  );
}
