"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  notifyOverchargeAction,
  setOverchargeAction,
} from "@/lib/orders/admin-actions";

export function OverchargeRowActions({
  orderId,
  initialAmount,
}: {
  orderId: string;
  initialAmount: number;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(String(initialAmount));
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const persistAmount = () => {
    setError(null);
    setInfo(null);
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError("0 이상의 숫자를 입력해 주세요.");
      return;
    }
    startTransition(async () => {
      const result = await setOverchargeAction({ orderId, amount: parsed });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  const sendNotice = () => {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const result = await notifyOverchargeAction({ orderId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setInfo("안내 발송이 기록되었습니다.");
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={0}
          step={1000}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-28 rounded-md border border-border bg-background px-2 py-1 text-xs"
          disabled={isPending}
        />
        <button
          type="button"
          onClick={persistAmount}
          disabled={isPending || amount === String(initialAmount)}
          className="rounded-md border border-border px-2 py-1 text-xs disabled:opacity-50"
        >
          {isPending ? "..." : "금액 저장"}
        </button>
        <button
          type="button"
          onClick={sendNotice}
          disabled={isPending}
          className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          결제 안내 발송
        </button>
      </div>
      {error && <p className="text-xs text-error">{error}</p>}
      {info && <p className="text-xs text-success">{info}</p>}
    </div>
  );
}
