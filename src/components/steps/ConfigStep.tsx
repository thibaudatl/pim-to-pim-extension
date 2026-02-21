import { Button, Helper, Checkbox, Badge } from 'akeneo-design-system';
import type { SyncConfig } from '../../sync/types';

interface ConfigStepProps {
  loading: boolean;
  error: string | null;
  warnings: string[];
  products: Product[];
  productModels: ProductModel[];
  config: SyncConfig;
  onConfigChange: (config: SyncConfig) => void;
  onNext: () => void;
}

export function ConfigStep({
  loading,
  error,
  warnings,
  products,
  productModels,
  config,
  onConfigChange,
  onNext,
}: ConfigStepProps) {
  function toggle(key: keyof SyncConfig) {
    onConfigChange({ ...config, [key]: !config[key] });
  }

  const productCount = products.length;
  const modelCount = productModels.length;
  const totalSelected = productCount + modelCount;

  return (
    <div>
      {/* Loading indicator */}
      {loading && (
        <div style={{ marginBottom: '16px' }}>
          <Helper level="info" inline={false}>
            Loading selected items…
          </Helper>
        </div>
      )}

      {/* Fatal error */}
      {error && (
        <div style={{ marginBottom: '16px' }}>
          <Helper level="error" inline={false}>
            {error}
          </Helper>
        </div>
      )}

      {/* Item count summary (once loaded) */}
      {!loading && !error && (
        <div
          style={{
            padding: '12px 16px',
            background: '#F5F5FA',
            borderRadius: '4px',
            marginBottom: '16px',
            fontSize: '13px',
            color: '#11324D',
          }}
        >
          <strong>{totalSelected}</strong> item(s) selected:{' '}
          {productCount > 0 && (
            <span>
              {productCount} product{productCount !== 1 ? 's' : ''}
            </span>
          )}
          {productCount > 0 && modelCount > 0 && ', '}
          {modelCount > 0 && (
            <span>
              {modelCount} product model{modelCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {/* Selected items list */}
      {!loading && !error && totalSelected > 0 && (
        <div
          style={{
            border: '1px solid #E8EBEE',
            borderRadius: '4px',
            marginBottom: '16px',
            overflow: 'hidden',
            maxHeight: '280px',
            overflowY: 'auto',
          }}
        >
          {products.map((p, idx) => (
            <div
              key={p.uuid}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 14px',
                borderBottom:
                  idx < products.length - 1 || productModels.length > 0
                    ? '1px solid #F5F5FA'
                    : 'none',
                fontSize: '13px',
              }}
            >
              <Badge level="primary">product</Badge>
              <div
                style={{
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {p.identifier && (
                  <span style={{ fontWeight: 500, color: '#11324D' }}>{p.identifier}</span>
                )}
                {p.identifier && (
                  <span style={{ color: '#67768A', margin: '0 6px' }}>·</span>
                )}
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '11px',
                    color: '#67768A',
                  }}
                >
                  {p.uuid}
                </span>
              </div>
            </div>
          ))}
          {productModels.map((m, idx) => (
            <div
              key={m.code}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 14px',
                borderBottom: idx < productModels.length - 1 ? '1px solid #F5F5FA' : 'none',
                fontSize: '13px',
              }}
            >
              <Badge level="secondary">model</Badge>
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
                {m.code}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Target environment */}
      <div
        style={{
          padding: '12px 16px',
          border: '1px solid #E8EBEE',
          borderRadius: '4px',
          marginBottom: '16px',
          fontSize: '13px',
        }}
      >
        <div style={{ color: '#67768A', marginBottom: '4px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Target environment
        </div>
        {config.env2Host ? (
          <div style={{ fontFamily: 'monospace', color: '#11324D', wordBreak: 'break-all' }}>
            {config.env2Host}
          </div>
        ) : (
          <div style={{ color: '#D4604A' }}>
            Not configured — set <code>env2_host</code> in the extension's custom variables.
          </div>
        )}
      </div>

      {/* Warnings */}
      {warnings.map((w) => (
        <div key={w} style={{ marginBottom: '12px' }}>
          <Helper level="warning" inline={false}>
            {w}
          </Helper>
        </div>
      ))}

      {/* Config toggles */}
      <div
        style={{
          border: '1px solid #E8EBEE',
          borderRadius: '4px',
          marginBottom: '20px',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '10px 16px', borderBottom: '1px solid #F5F5FA', background: '#FAFAFA', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#67768A' }}>
          Sync options
        </div>
        {[
          {
            key: 'includeParentModels' as const,
            label: 'Include parent product models',
            description: 'Push parent models for any selected variant products.',
          },
          {
            key: 'includeGrandparentModels' as const,
            label: 'Include grandparent models',
            description: 'Also push root models in 2-level variant hierarchies.',
          },
          {
            key: 'overwriteExisting' as const,
            label: 'Overwrite existing products',
            description: 'PATCH items that already exist in the target environment.',
          },
          {
            key: 'skipMediaValues' as const,
            label: 'Skip media attribute values',
            description:
              'Omit image/file attribute values — media files cannot be transferred between environments.',
          },
        ].map(({ key, label, description }) => (
          <div
            key={key}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              padding: '12px 16px',
              borderBottom: '1px solid #F5F5FA',
              cursor: 'pointer',
            }}
            onClick={() => toggle(key)}
          >
            <div style={{ paddingTop: '2px' }}>
              <Checkbox
                checked={config[key] as boolean}
                onChange={() => toggle(key)}
              >
                {''}
              </Checkbox>
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 500, color: '#11324D' }}>{label}</div>
              <div style={{ fontSize: '12px', color: '#67768A', marginTop: '2px' }}>{description}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          level="primary"
          onClick={onNext}
          disabled={loading || !!error || totalSelected === 0 || !config.env2Host}
        >
          Start Sync →
        </Button>
      </div>
    </div>
  );
}
