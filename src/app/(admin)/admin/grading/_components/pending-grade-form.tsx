"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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

export function PendingGradeForm({ cards }: { cards: PendingCard[] }) {
  const router = useRouter();
  const [serials, setSerials] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const updateSerial = (cardId: string, value: string) => {
    setSerials((prev) => ({ ...prev, [cardId]: value }));
  };

  const clearSerial = (cardId: string) => {
    setSerials((prev) => {
      const next = { ...prev };
      delete next[cardId];
      return next;
    });
  };

  const readyEntries = useMemo(() => {
    return cards
      .map((c) => {
        const s = (serials[c.id] ?? "").trim();
        if (!s) return null;
        return { cardId: c.id, serialNumber: s };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [cards, serials]);

  const handleUpload = () => {
    if (readyEntries.length === 0) {
      setError("일련번호가 입력된 카드가 없습니다.");
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
        `${result.appliedCount}건 일련번호 저장 완료${
          promoted > 0 ? ` · 주문 ${promoted}건 등급 확정으로 이동` : ""
        }`
      );
      setSerials({});
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border p-5">
          <h2 className="font-semibold">일련번호 입력 대기</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            카드별 일련번호를 입력한 뒤 하단의 "업로드" 버튼을 누르면 적용됩니다.
            한 주문의 모든 카드에 일련번호가 채워지면 주문이 자동으로 등급 확정으로
            이동합니다.
          </p>
        </div>
        {cards.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            일련번호 입력 대기 중인 카드가 없습니다.
          </p>
        ) : (
          <>
            {/* 데스크탑 테이블 (md 이상) */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3">주문번호</th>
                    <th className="px-5 py-3">고객</th>
                    <th className="px-5 py-3">회사</th>
                    <th className="px-5 py-3">카드 정보</th>
                    <th className="px-5 py-3">일련번호</th>
                  </tr>
                </thead>
                <tbody>
                  {cards.map((c) => {
                    const serial = serials[c.id] ?? "";
                    const ready = !!serial.trim();

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
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={serial}
                              onChange={(e) =>
                                updateSerial(c.id, e.target.value)
                              }
                              placeholder="예: 12345678"
                              disabled={isPending}
                              className="w-40 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                            />
                            {serial && (
                              <button
                                type="button"
                                onClick={() => clearSerial(c.id)}
                                disabled={isPending}
                                className="text-[10px] text-muted-foreground hover:text-error"
                              >
                                비우기
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 모바일 카드 리스트 (md 미만) */}
            <div className="divide-y divide-border md:hidden">
              {cards.map((c) => {
                const serial = serials[c.id] ?? "";
                const ready = !!serial.trim();
                return (
                  <div
                    key={c.id}
                    className={`px-4 py-3 ${ready ? "bg-success/5" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/admin/orders/${c.orderId}`}
                        className="font-mono text-sm font-medium text-primary hover:underline"
                      >
                        {c.orderId}
                      </Link>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {c.customerName} · {c.gradingCompany}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-medium">{describeCard(c)}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                      ID: {c.id.slice(0, 8)}
                    </p>

                    <label className="mt-2 block text-xs">
                      <span className="text-muted-foreground">일련번호</span>
                      <input
                        type="text"
                        value={serial}
                        onChange={(e) => updateSerial(c.id, e.target.value)}
                        placeholder="예: 12345678"
                        disabled={isPending}
                        className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-2 text-sm"
                      />
                    </label>
                    {serial && (
                      <button
                        type="button"
                        onClick={() => clearSerial(c.id)}
                        disabled={isPending}
                        className="mt-1 text-[10px] text-muted-foreground hover:text-error"
                      >
                        비우기
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/95 px-5 py-3 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-1 text-xs">
          <span>
            <span className="font-semibold text-success">{readyEntries.length}건</span>{" "}
            업로드 준비됨
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
