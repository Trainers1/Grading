"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelOrderAction } from "@/lib/orders/admin-actions";

export function CancelOrderButton({
  orderId,
  canCancel = true,
}: {
  orderId: string;
  /** 권한 없으면 버튼 자체를 숨김 (서버 액션도 별도 가드) */
  canCancel?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!canCancel) return null;

  const submit = () => {
    if (!reason.trim()) {
      setError("취소 사유를 입력해 주세요.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await cancelOrderAction({ orderId, reason });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setReason("");
      router.refresh();
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-error/40 px-4 py-2 text-sm font-medium text-error hover:bg-error/5"
      >
        주문 취소
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-error/30 bg-error/5 p-3">
      <label className="text-xs font-medium text-error">
        취소 사유 <span className="text-error">*</span>
      </label>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="고객 요청 / 결제 미완료 / 카드 미도착 등"
        rows={2}
        disabled={isPending}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
      />
      <div className="flex items-center justify-between gap-2">
        {error ? (
          <p className="text-xs text-error">{error}</p>
        ) : (
          <span className="text-[10px] text-muted-foreground">
            취소 후에는 "취소됨" 탭에서 영구 삭제할 수 있습니다.
          </span>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setReason("");
              setError(null);
            }}
            disabled={isPending}
            className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={isPending || !reason.trim()}
            className="rounded-md bg-error px-3 py-1.5 text-xs font-medium text-white hover:bg-error/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "취소 처리 중..." : "주문 취소 확정"}
          </button>
        </div>
      </div>
    </div>
  );
}
