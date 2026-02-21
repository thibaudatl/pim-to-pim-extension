import styled from 'styled-components';

const STEPS = ['Configure', 'Preview', 'Sync'];

const Container = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 24px;
`;

const StepItem = styled.div<{ $active: boolean; $done: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: ${({ $active }) => ($active ? 600 : 400)};
  color: ${({ $active, $done }) => ($active ? '#5E4ABA' : $done ? '#2FAF7B' : '#67768A')};
  white-space: nowrap;
`;

const Circle = styled.div<{ $active: boolean; $done: boolean }>`
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
  background: ${({ $active, $done }) =>
    $done ? '#2FAF7B' : $active ? '#5E4ABA' : '#E8EBEE'};
  color: ${({ $active, $done }) => ($active || $done ? '#FFFFFF' : '#67768A')};
`;

const Connector = styled.div`
  flex: 1;
  height: 1px;
  min-width: 16px;
  background: #e8ebee;
  margin: 0 8px;
`;

interface StepIndicatorProps {
  currentStep: number;
}

export function StepIndicator({ currentStep }: StepIndicatorProps) {
  return (
    <Container>
      {STEPS.map((label, i) => {
        const stepNum = i + 1;
        const active = stepNum === currentStep;
        const done = stepNum < currentStep;
        return (
          <>
            <StepItem key={label} $active={active} $done={done}>
              <Circle $active={active} $done={done}>
                {done ? '✓' : stepNum}
              </Circle>
              {label}
            </StepItem>
            {i < STEPS.length - 1 && <Connector key={`conn-${i}`} />}
          </>
        );
      })}
    </Container>
  );
}
