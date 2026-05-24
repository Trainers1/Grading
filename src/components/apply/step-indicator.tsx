"use client";

import { cn } from "@/lib/utils";

const STEPS = [
  { step: 1, label: "그레이딩 옵션 · 매수" },
  { step: 2, label: "수령 방식" },
  { step: 3, label: "결제" },
];

interface StepIndicatorProps {
  currentStep: number;
}

export function StepIndicator({ currentStep }: StepIndicatorProps) {
  return (
    <div className="mb-8">
      <div className="grid grid-cols-3">
        {STEPS.map(({ step, label }, index) => (
          <div key={step} className="relative flex flex-col items-center">
            {index < STEPS.length - 1 && (
              <div
                className={cn(
                  "absolute left-1/2 top-5 h-0.5 w-full -translate-y-1/2",
                  step < currentStep ? "bg-primary" : "bg-muted"
                )}
              />
            )}
            <div
              className={cn(
                "relative z-10 flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold transition-colors",
                step < currentStep &&
                  "bg-primary text-primary-foreground",
                step === currentStep &&
                  "bg-primary text-primary-foreground ring-4 ring-primary/20",
                step > currentStep &&
                  "bg-muted text-muted-foreground"
              )}
            >
              {step < currentStep ? "✓" : step}
            </div>
            <span
              className={cn(
                "mt-2 text-xs font-medium text-center",
                step <= currentStep
                  ? "text-primary"
                  : "text-muted-foreground"
              )}
            >
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
