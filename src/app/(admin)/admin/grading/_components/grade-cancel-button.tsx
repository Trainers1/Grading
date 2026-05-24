"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clearCardGradeAction } from "@/lib/orders/admin-actions";

export function GradeCancelButton({
  cardId,
  cardLabel,
}: {
  cardId: string;
  cardLabel: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    const ok = window.confirm(
      `"${cardLabel}" 카드의 등급 확정을 취소하시겠습니까?\n해당 주문이 등급 확정 단계라면 그레이딩 진행 중으로 되돌아갑니다.`
    );
    if (!ok) return;
    setError(null);
    startTransition(async () => {
      const result = await clearCardGradeAction({ cardId });
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
        onClick={handleClick}
        disabled={isPending}
        className="rounded-md border border-error/40 px-3 py-1 text-xs font-medium text-error hover:bg-error/5 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "취소 중..." : "확정 취소"}
      </button>
      {error && <p className="text-[10px] text-error">{error}</p>}
    </div>
  );
}
