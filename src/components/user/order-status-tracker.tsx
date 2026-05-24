"use client";


import { cn } from "@/lib/utils";
import { ORDER_STATUS_STEPS } from "@/constants/grading";
import type { OrderStatus } from "@/types";

interface OrderStatusTrackerProps {
  currentStatus: OrderStatus;
}

/**
 * 현재 상태를 8단계 스텝퍼의 step 번호로 매핑.
 */
function getStepNumber(status: OrderStatus): number {
  const found = ORDER_STATUS_STEPS.find((s) => s.key === status);
  return found?.step ?? 0;
}

export function OrderStatusTracker({ currentStatus }: OrderStatusTrackerProps) {
  const currentStep = getStepNumber(currentStatus);

  return (
    <div className="space-y-1">
      {ORDER_STATUS_STEPS.map(({ key, label, step }) => {
        const isDone = step < currentStep;
        const isCurrent = step === currentStep;

        return (
          <div key={key} className="flex items-center gap-3">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
                  isDone && "bg-primary text-primary-foreground",
                  isCurrent &&
                    "bg-primary text-primary-foreground ring-4 ring-primary/20",
                  !isDone && !isCurrent && "bg-muted text-muted-foreground"
                )}
              >
                {isDone ? "✓" : step}
              </div>
              {step < ORDER_STATUS_STEPS.length && (
                <div
                  className={cn(
                    "h-4 w-0.5",
                    isDone ? "bg-primary" : "bg-muted"
                  )}
                />
              )}
            </div>
            <span
              className={cn(
                "text-sm",
                isCurrent ? "font-semibold text-primary" : isDone ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
