import { useState } from 'react';
import { StepIndicator } from './components/StepIndicator';
import { ConfigStep } from './components/steps/ConfigStep';
import { SyncStep } from './components/steps/SyncStep';
import { useProductSelection } from './hooks/useProductSelection';
import { useSyncExecution } from './hooks/useSyncExecution';
import { resolveSyncOrder } from './sync/dependencyResolver';
import type { SyncConfig } from './sync/types';

type Step = 1 | 2;

const DEFAULT_CONFIG: SyncConfig = {
  env2Host: '',
  credentialsCode: 'destination_pim_token',
  includeParentModels: true,
  includeGrandparentModels: true,
  overwriteExisting: true,
  skipMediaValues: true,
  skipAssociations: true,
  excludedAttributes: [],
};

export default function App() {
  const [step, setStep] = useState<Step>(1);
  const [config, setConfig] = useState<SyncConfig>(() => ({
    ...DEFAULT_CONFIG,
    env2Host: String(globalThis.PIM.custom_variables.destination_pim_url ?? ''),
  }));

  const selection = useProductSelection();
  const sync = useSyncExecution();

  function handleStartSync() {
    const items = resolveSyncOrder(
      selection.products,
      selection.productModels,
      selection.ancestorModels,
      config,
      selection.selectedProductUuids,
      selection.selectedModelCodes
    );
    sync.startSync(
      items,
      selection.products,
      selection.productModels,
      selection.ancestorModels,
      config
    );
    setStep(2);
  }

  return (
    <div
      style={{
        padding: '20px',
        maxWidth: '760px',
        margin: '0 auto',
        fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
      }}
    >
      <div style={{ marginBottom: '20px' }}>
        <h1
          style={{
            fontSize: '18px',
            fontWeight: 700,
            margin: '0 0 4px 0',
            color: '#11324D',
          }}
        >
          Sync to other PIM
        </h1>
        <p style={{ fontSize: '13px', color: '#67768A', margin: 0 }}>
          Push selected products and product models to a second Akeneo environment.
        </p>
      </div>

      <StepIndicator currentStep={step} />

      {step === 1 && (
        <ConfigStep
          loading={selection.loading}
          error={selection.error}
          warnings={selection.warnings}
          products={selection.products}
          productModels={selection.productModels}
          config={config}
          onConfigChange={setConfig}
          onNext={handleStartSync}
        />
      )}

      {step === 2 && <SyncStep sync={sync} config={config} onBackToConfigure={() => setStep(1)} />}
    </div>
  );
}
