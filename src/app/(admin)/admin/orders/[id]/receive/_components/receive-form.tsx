"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { receiveOrderCardsAction } from "@/lib/orders/admin-actions";

export function ReceiveForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await receiveOrderCardsAction({
        orderId,
        memo: memo.trim() || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/admin/orders/${orderId}`);
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium">수령 메모</label>
        <textarea
          rows={3}
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="카드 상태, 특이사항 등을 기록하세요. (선택)"
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          disabled={isPending}
        />
      </div>

      {error && (
        <div className="rounded-md border border-error/30 bg-error/5 p-3 text-xs text-error">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Link
          href={`/admin/orders/${orderId}`}
          className="rounded-md border border-border px-4 py-2 text-sm"
        >
          취소
        </Link>
        <button
          type="button"
          onClick={submit}
          disabled={isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isPending ? "처리 중..." : "수령 완료 처리"}
        </button>
      </div>
    </div>
  );
}
