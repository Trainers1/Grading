"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ORDER_STATUS_LABELS } from "@/constants/grading";
import { updateOrderStatusAction } from "@/lib/orders/admin-actions";
import type { OrderStatus } from "@/types/order";

const STATUS_OPTIONS: OrderStatus[] = [
  "PAYMENT_PENDING",
  "CARD_DELIVERY_PENDING",
  "CARD_RECEIVED",
  "SHIPPED_OUT",
  "DISTRIBUTOR_SHIPPED",
  "GRADE_CONFIRMED",
  "TRAINERS_ARRIVED",
  "COMPLETED",
];

export function StatusChanger({
  orderId,
  currentStatus,
}: {
  orderId: string;
  currentStatus: OrderStatus;
}) {
  const router = useRouter();
  const [next, setNext] = useState<OrderStatus>(currentStatus);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = () => {
    if (next === currentStatus) {
      setError("현재 상태와 동일합니다.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateOrderStatusAction({
        orderId,
        newStatus: next,
        reason: reason.trim() || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setReason("");
      router.refresh();
    });
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="font-semibold">주문 상태 변경</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        상태 변경 시 자동으로 로그가 기록되며, milestone 단계는 고객에게 PWA
        푸시 알림이 발송됩니다.
      </p>

      {error && (
        <div className="mt-3 rounded-md border border-error/30 bg-error/5 p-3 text-xs text-error">
          {error}
        </div>
      )}

      <div className="mt-4 space-y-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            다음 상태
          </label>
          <select
            value={next}
            onChange={(e) => setNext(e.target.value as OrderStatus)}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            disabled={isPending}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {ORDER_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">
            변경 사유 (선택)
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="내부 메모 (고객에게 노출되지 않음)"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            disabled={isPending}
          />
        </div>

        <Button
          type="button"
          onClick={handleSubmit}
          disabled={isPending || next === currentStatus}
          className="w-full"
        >
          {isPending ? "변경 중..." : "상태 변경"}
        </Button>
      </div>
    </div>
  );
}
