"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { refundOrderAction } from "@/lib/orders/admin-actions";

export function RefundOrderButton({
  orderId,
  canRefund = true,
}: {
  orderId: string;
  /** 권한 없으면 버튼 자체를 숨김 */
  canRefund?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!canRefund) return null;

  const handle = () => {
    const ok = window.confirm(
      `주문 ${orderId} 의 현장 환불을 완료 처리하시겠습니까?\n잔존 결제 내역이 삭제되고 결제 상태가 "환불 완료"로 변경됩니다. 이후 주문 영구 삭제가 가능합니다.`
    );
    if (!ok) return;
    setError(null);
    startTransition(async () => {
      const result = await refundOrderAction({ orderId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handle}
        disabled={isPending}
        className="rounded-md border border-warning/40 bg-warning/5 px-3 py-1.5 text-xs font-medium text-warning hover:bg-warning/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "처리 중..." : "현장 환불 완료"}
      </button>
      {error && (
        <p className="max-w-[220px] text-right text-[10px] text-error">
          {error}
        </p>
      )}
    </div>
  );
}
