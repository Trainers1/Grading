"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteOrderAction } from "@/lib/orders/admin-actions";

export function DeleteOrderButton({
  orderId,
  size = "sm",
  redirectTo,
  canDelete = true,
}: {
  orderId: string;
  size?: "sm" | "md";
  /** 삭제 성공 시 router.refresh() 대신 이 경로로 router.push */
  redirectTo?: string;
  /** 권한 없으면 버튼 자체를 숨김 (서버 액션도 별도 가드) */
  canDelete?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!canDelete) return null;

  const handle = () => {
    const ok = window.confirm(
      `주문 ${orderId} 을(를) 영구 삭제하시겠습니까?\n취소된 주문만 삭제 가능하며, 카드 정보와 상태 로그도 함께 삭제됩니다. 되돌릴 수 없습니다.`
    );
    if (!ok) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteOrderAction({ orderId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    });
  };

  const cls =
    size === "sm"
      ? "px-2 py-1 text-xs"
      : "px-3 py-1.5 text-sm";

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handle}
        disabled={isPending}
        className={`rounded-md border border-error/40 font-medium text-error hover:bg-error/5 disabled:cursor-not-allowed disabled:opacity-50 ${cls}`}
      >
        {isPending ? "삭제 중..." : "삭제"}
      </button>
      {error && <p className="max-w-[200px] text-right text-[10px] text-error">{error}</p>}
    </div>
  );
}
