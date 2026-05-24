"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCardGradeAction } from "@/lib/orders/admin-actions";
import { GRADE_PRESETS } from "@/constants/grading";
import type { GradingCompany } from "@/types";

export function GradeInput({
  cardId,
  company,
  initialValue,
}: {
  cardId: string;
  company: GradingCompany;
  initialValue: string;
}) {
  const router = useRouter();
  const presets = GRADE_PRESETS[company];
  const [customMode, setCustomMode] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pendingValue, setPendingValue] = useState<string | null>(null);

  const submit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError("등급 결과를 입력해 주세요.");
      return;
    }
    setError(null);
    setPendingValue(trimmed);
    startTransition(async () => {
      const result = await updateCardGradeAction({
        cardId,
        gradeResult: trimmed,
      });
      setPendingValue(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCustomValue("");
      setCustomMode(false);
      router.refresh();
    });
  };

  if (customMode) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex gap-2">
          <input
            type="text"
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            placeholder={`예: ${company} 10`}
            className="w-36 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            disabled={isPending}
            autoFocus
          />
          <button
            type="button"
            onClick={() => submit(customValue)}
            disabled={isPending || !customValue.trim()}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isPending ? "저장 중..." : "저장"}
          </button>
          <button
            type="button"
            onClick={() => {
              setCustomMode(false);
              setCustomValue("");
              setError(null);
            }}
            disabled={isPending}
            className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            취소
          </button>
        </div>
        {error && <p className="text-xs text-error">{error}</p>}
        {initialValue && (
          <p className="text-[10px] text-muted-foreground">
            현재 값: {initialValue}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => {
          const isPending_ = isPending && pendingValue === p.value;
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => submit(p.value)}
              disabled={isPending}
              className={`rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50 ${
                initialValue === p.value
                  ? "border-primary bg-primary/10 text-primary"
                  : ""
              }`}
            >
              {isPending_ ? "저장 중..." : p.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setCustomMode(true)}
          disabled={isPending}
          className="rounded-md border border-dashed border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-50"
        >
          {company} N (직접 입력)
        </button>
      </div>
      {error && <p className="text-xs text-error">{error}</p>}
      {initialValue && (
        <p className="text-[10px] text-muted-foreground">
          현재 값: {initialValue}
        </p>
      )}
    </div>
  );
}
