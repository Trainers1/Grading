"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { setUserTrackingNumberAction } from "@/lib/orders/admin-actions";

// 택배 발송 — 송장번호 입력 폼. 저장 성공 시 router.refresh 로 서버 컴포넌트 재조회.
export function TrackingInput({
  orderId,
  initialTrackingNumber,
  disabled,
  submitLabel = "저장",
}: {
  orderId: string;
  initialTrackingNumber?: string;
  disabled?: boolean;
  submitLabel?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialTrackingNumber ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await setUserTrackingNumberAction({
        orderId,
        trackingNumber: value,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-2">
      <div className="flex flex-1 flex-col">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="송장번호 입력"
          disabled={disabled || isPending}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono disabled:opacity-50"
        />
        {error && (
          <p className="mt-1 text-xs text-error">{error}</p>
        )}
      </div>
      <Button
        type="button"
        size="sm"
        onClick={submit}
        disabled={disabled || isPending || !value.trim()}
      >
        {isPending ? "처리 중..." : submitLabel}
      </Button>
    </div>
  );
}
