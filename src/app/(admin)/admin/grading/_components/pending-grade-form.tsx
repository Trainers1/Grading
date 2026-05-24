"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GRADE_PRESETS } from "@/constants/grading";
import { bulkUpsertGradeResultsAction } from "@/lib/orders/admin-actions";
import type { GradingCompany } from "@/types";

export type PendingCard = {
  id: string;
  orderId: string;
  customerName: string;
  gradingCompany: GradingCompany;
  englishName: string | null;
  setName: string | null;
  cardNumber: string | null;
};

function describeCard(c: PendingCard): string {
  const parts: string[] = [];
  if (c.englishName) parts.push(c.englishName);
  if (c.setName) parts.push(c.setName);
  if (c.cardNumber) parts.push(c.cardNumber);
  return parts.length > 0 ? parts.join(" · ") : "정보 미입력";
}

type DraftEntry = {
  gradeResult: string;
  serialNumber: string;
  customMode: boolean;
};

const EMPTY_DRAFT: DraftEntry = {
  gradeResult: "",
  serialNumber: "",
  customMode: false,
};

export function PendingGradeForm({ cards }: { cards: PendingCard[] }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, DraftEntry>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const updateDraft = (cardId: string, patch: Partial<DraftEntry>) => {
    setDrafts((prev) => ({
      ...prev,
      [cardId]: { ...EMPTY_DRAFT, ...prev[cardId], ...patch },
    }));
  };

  const clearDraft = (cardId: string) => {
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[cardId];
      return next;
    });
  };

  const readyEntries = useMemo(() => {
    return cards
      .map((c) => {
        const d = drafts[c.id];
        if (!d) return null;
        const g = d.gradeResult.trim();
        const s = d.serialNumber.trim();
        if (!g || !s) return null;
        return { cardId: c.id, gradeResult: g, serialNumber: s };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [cards, drafts]);

  const partialCount = useMemo(() => {
    return Object.entries(drafts).reduce((sum, [cardId, d]) => {
      const g = d.gradeResult.trim();
      const s = d.serialNumber.trim();
      if ((g && !s) || (!g && s)) return sum + 1;
      return sum;
    }, 0);
  }, [drafts]);

  const handleUpload = () => {
    if (readyEntries.length === 0) {
      setError("등급과 일련번호가 모두 입력된 카드가 없습니다.");
      return;
    }
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await bulkUpsertGradeResultsAction({
        entries: readyEntries,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const promoted = result.promotedOrderIds.length;
      setNotice(
        `${result.appliedCount}건 등급 저장 완료${
          promoted > 0 ? ` · 주문 ${promoted}건 등급 확정으로 이동` : ""
        }${result.skippedCount > 0 ? ` (스킵 ${result.skippedCount}건)` : ""}`
      );
      setDrafts({});
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border p-5">
          <h2 className="font-semibold">등급 입력 대기</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            등급 버튼 + 일련번호를 입력한 뒤 하단의 "업로드" 버튼을 누르면 적용됩니다.
            한 카드라도 둘 중 하나가 비면 그 카드는 업로드되지 않습니다.
            한 주문의 모든 카드가 등급+일련번호를 가지면 주문이 자동으로 등급
            확정으로 이동합니다.
          </p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-5 py-3">주문번호</th>
              <th className="px-5 py-3">고객</th>
              <th className="px-5 py-3">회사</th>
              <th className="px-5 py-3">카드 정보</th>
              <th className="px-5 py-3">등급 입력</th>
              <th className="px-5 py-3">일련번호</th>
            </tr>
          </thead>
          <tbody>
            {cards.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-5 py-8 text-center text-muted-foreground"
                >
                  등급 입력 대기 중인 카드가 없습니다.
                </td>
              </tr>
            ) : (
              cards.map((c) => {
                const draft = drafts[c.id] ?? EMPTY_DRAFT;
                const presets = GRADE_PRESETS[c.gradingCompany];
                const ready =
                  !!draft.gradeResult.trim() && !!draft.serialNumber.trim();

                return (
                  <tr
                    key={c.id}
                    className={`border-t border-border align-top ${
                      ready ? "bg-success/5" : ""
                    }`}
                  >
                    <td className="px-5 py-3">
                      <Link
                        href={`/admin/orders/${c.orderId}`}
                        className="font-mono text-primary hover:underline"
                      >
                        {c.orderId}
                      </Link>
                    </td>
                    <td className="px-5 py-3">{c.customerName}</td>
                    <td className="px-5 py-3">{c.gradingCompany}</td>
                    <td className="px-5 py-3">
                      <p className="font-medium">{describeCard(c)}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        ID: {c.id.slice(0, 8)}
                      </p>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-col gap-1.5">
                        {!draft.customMode ? (
                          <div className="flex flex-wrap gap-1.5">
                            {presets.map((p) => {
                              const selected = draft.gradeResult === p.value;
                              return (
                                <button
                                  key={p.value}
                                  type="button"
                                  onClick={() =>
                                    updateDraft(c.id, {
                                      gradeResult: selected ? "" : p.value,
                                    })
                                  }
                                  disabled={isPending}
                                  className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                                    selected
                                      ? "border-primary bg-primary/10 text-primary"
                                      : "border-border hover:border-primary hover:bg-primary/5 hover:text-primary"
                                  }`}
                                >
                                  {p.label}
                                </button>
                              );
                            })}
                            <button
                              type="button"
                              onClick={() =>
                                updateDraft(c.id, {
                                  customMode: true,
                                  gradeResult: presets.some(
                                    (p) => p.value === draft.gradeResult
                                  )
                                    ? ""
                                    : draft.gradeResult,
                                })
                              }
                              disabled={isPending}
                              className="rounded-md border border-dashed border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-50"
                            >
                              {c.gradingCompany} N (직접 입력)
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-1.5">
                            <input
                              type="text"
                              value={draft.gradeResult}
                              onChange={(e) =>
                                updateDraft(c.id, {
                                  gradeResult: e.target.value,
                                })
                              }
                              placeholder={`예: ${c.gradingCompany} 10`}
                              disabled={isPending}
                              className="w-36 rounded-md border border-border bg-background px-2 py-1 text-xs"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() =>
                                updateDraft(c.id, {
                                  customMode: false,
                                  gradeResult: "",
                                })
                              }
                              disabled={isPending}
                              className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                            >
                              취소
                            </button>
                          </div>
                        )}
                        {(draft.gradeResult || draft.serialNumber) && (
                          <button
                            type="button"
                            onClick={() => clearDraft(c.id)}
                            disabled={isPending}
                            className="self-start text-[10px] text-muted-foreground hover:text-error"
                          >
                            입력값 비우기
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <input
                        type="text"
                        value={draft.serialNumber}
                        onChange={(e) =>
                          updateDraft(c.id, { serialNumber: e.target.value })
                        }
                        placeholder="예: 12345678"
                        disabled={isPending}
                        className="w-40 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/95 px-5 py-3 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-1 text-xs">
          <span>
            <span className="font-semibold text-success">{readyEntries.length}건</span>{" "}
            업로드 준비됨
            {partialCount > 0 && (
              <span className="ml-2 text-warning">
                · 부분 입력 {partialCount}건은 스킵됩니다
              </span>
            )}
          </span>
          {error && <span className="text-error">{error}</span>}
          {notice && <span className="text-success">{notice}</span>}
        </div>
        <button
          type="button"
          onClick={handleUpload}
          disabled={isPending || readyEntries.length === 0}
          className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "업로드 중..." : `업로드 (${readyEntries.length}건)`}
        </button>
      </div>
    </div>
  );
}
