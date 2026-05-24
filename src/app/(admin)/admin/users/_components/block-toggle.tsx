"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleUserBlockAction } from "@/lib/orders/admin-actions";

export function BlockToggle({
  userId,
  initialBlocked,
  initialReason,
}: {
  userId: string;
  initialBlocked: boolean;
  initialReason?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(initialReason ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const toggle = (blocked: boolean) => {
    setError(null);
    startTransition(async () => {
      const result = await toggleUserBlockAction({
        userId,
        blocked,
        reason: blocked ? reason : undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  };

  if (initialBlocked) {
    return (
      <button
        type="button"
        onClick={() => toggle(false)}
        disabled={isPending}
        className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
      >
        {isPending ? "..." : "차단 해제"}
      </button>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-error/30 px-2 py-1 text-xs text-error hover:bg-error/5"
      >
        차단
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="차단 사유"
        className="w-40 rounded-md border border-border bg-background px-2 py-1 text-xs"
        disabled={isPending}
      />
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-border px-2 py-1 text-xs"
          disabled={isPending}
        >
          취소
        </button>
        <button
          type="button"
          onClick={() => toggle(true)}
          disabled={isPending}
          className="rounded-md bg-error px-2 py-1 text-xs font-medium text-white hover:bg-error/90 disabled:opacity-50"
        >
          {isPending ? "..." : "차단"}
        </button>
      </div>
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
