import { useState, useEffect } from 'react';
import { StepIndicator } from './components/StepIndicator';
import { ConfigStep } from './components/steps/ConfigStep';
import { DependencyCheckStep } from './components/steps/DependencyCheckStep';
import { FilterStep } from './components/steps/FilterStep';
import { SyncStep } from './components/steps/SyncStep';
import { useProductSelection } from './hooks/useProductSelection';
import { useSyncExecution } from './hooks/useSyncExecution';
import { useDependencyCheck } from './hooks/useDependencyCheck';
import { resolveSyncOrder } from './sync/dependencyResolver';
import type { SyncConfig } from './sync/types';

type Step = 1 | 2 | 3 | 4;

const DEFAULT_CONFIG: SyncConfig = {
  env2Host: '',
  credentialsCode: 'destination_pim_token',
  includeParentModels: true,
  includeGrandparentModels: true,
  overwriteExisting: true,
  skipMediaValues: true,
  skipAssociations: true,
  excludedAttributes: [],
  checkDependencies: false,
};

export default function App() {
  const [step, setStep] = useState<Step>(1);
  const [config, setConfig] = useState<SyncConfig>(() => ({
    ...DEFAULT_CONFIG,
    env2Host: String(globalThis.PIM.custom_variables.destination_pim_url ?? ''),
  }));

  const selection = useProductSelection();
  const sync = useSyncExecution();
  const depCheck = useDependencyCheck();

  // Auto-advance from step 2 (Dependencies) to step 3 (Filter) when dep check completes
  useEffect(() => {
    if (step === 2 && depCheck.phase === 'done') {
      setStep(3);
    }
  }, [step, depCheck.phase]);

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
    setStep(config.checkDependencies ? 4 : 2);
  }

  function handleNext() {
    if (config.checkDependencies) {
      // Go to dependency check step
      setStep(2);
      depCheck.startCheck(
        selection.products,
        selection.productModels,
        selection.ancestorModels,
        config
      );
    } else {
      // Skip dependency check, go straight to sync
      handleStartSync();
    }
  }

  function handleStartSyncFromFilter() {
    // Merge excluded attributes from dependency check into config
    const mergedConfig = {
      ...config,
      excludedAttributes: [
        ...new Set([...config.excludedAttributes, ...depCheck.excludedAttributes]),
      ],
    };
    const items = resolveSyncOrder(
      selection.products,
      selection.productModels,
      selection.ancestorModels,
      mergedConfig,
      selection.selectedProductUuids,
      selection.selectedModelCodes
    );
    sync.startSync(
      items,
      selection.products,
      selection.productModels,
      selection.ancestorModels,
      mergedConfig,
      depCheck.strippedCodes
    );
    setStep(4);
  }

  function handleBackToConfigure() {
    depCheck.reset();
    setStep(1);
  }

  function handleBackToReport() {
    depCheck.backToReport();
    setStep(2);
  }

  function handleBackFromSync() {
    if (config.checkDependencies) {
      setStep(3);
    } else {
      setStep(1);
    }
  }

  // Map visual step number based on whether dependency check is enabled
  const visualStep = config.checkDependencies
    ? step  // 1=Configure, 2=Dependencies, 3=Filter, 4=Sync
    : step === 1 ? 1 : 2;  // 1=Configure, 2=Sync (skip deps)

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

      <StepIndicator
        currentStep={visualStep}
        steps={config.checkDependencies
          ? ['Configure', 'Dependencies', 'Filter', 'Sync']
          : ['Configure', 'Sync']
        }
      />

      {step === 1 && (
        <ConfigStep
          loading={selection.loading}
          error={selection.error}
          warnings={selection.warnings}
          products={selection.products}
          productModels={selection.productModels}
          config={config}
          onConfigChange={setConfig}
          onNext={handleNext}
        />
      )}

      {step === 2 && config.checkDependencies && (
        <DependencyCheckStep
          depCheck={depCheck}
          config={config}
          onBack={handleBackToConfigure}
        />
      )}

      {step === 3 && config.checkDependencies && (
        <FilterStep
          depCheck={depCheck}
          products={selection.products}
          productModels={selection.productModels}
          config={config}
          onConfigChange={setConfig}
          onBack={handleBackToReport}
          onProceed={handleStartSyncFromFilter}
        />
      )}

      {((step === 2 && !config.checkDependencies) || step === 4) && (
        <SyncStep sync={sync} config={config} onBack={handleBackFromSync} backLabel={config.checkDependencies ? '← Filter' : '← Configure'} />
      )}
    </div>
  );
}
