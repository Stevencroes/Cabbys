interface StepperProps {
  value: number;
  min: number;
  max?: number;
  onChange: (next: number) => void;
  testId?: string;
}

export default function Stepper({ value, min, max, onChange, testId }: StepperProps) {
  const atMin = value <= min;
  const atMax = max !== undefined && value >= max;

  return (
    <div className="stepper">
      <button
        type="button"
        aria-label="−"
        disabled={atMin}
        onClick={() => !atMin && onChange(value - 1)}
      >
        −
      </button>
      <span className="num" data-testid={testId}>{value}</span>
      <button
        type="button"
        aria-label="+"
        disabled={atMax}
        onClick={() => !atMax && onChange(value + 1)}
      >
        +
      </button>
    </div>
  );
}
