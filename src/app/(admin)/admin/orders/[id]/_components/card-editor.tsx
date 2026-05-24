"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCardDetailsAction } from "@/lib/orders/admin-actions";
import type { Card } from "@/types";

export function CardEditor({
  card,
  index,
}: {
  card: Card;
  /** 카드 행 번호 (주문 내 0-based 인덱스) — 표시용 */
  index: number;
}) {
  const router = useRouter();
  const [englishName, setEnglishName] = useState(card.englishName ?? "");
  const [setName, setSetName] = useState(card.setName ?? "");
  const [cardNumber, setCardNumber] = useState(card.cardNumber ?? "");
  const [year, setYear] = useState(card.year ?? "");
  const [declaredValue, setDeclaredValue] = useState<string>(
    card.declaredValue ? String(card.declaredValue) : ""
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setEnglishName(card.englishName ?? "");
    setSetName(card.setName ?? "");
    setCardNumber(card.cardNumber ?? "");
    setYear(card.year ?? "");
    setDeclaredValue(card.declaredValue ? String(card.declaredValue) : "");
  }, [
    card.englishName,
    card.setName,
    card.cardNumber,
    card.year,
    card.declaredValue,
  ]);

  const save = () => {
    const parsedDeclared = declaredValue.trim()
      ? Number(declaredValue.replace(/,/g, ""))
      : null;
    if (
      parsedDeclared !== null &&
      (!Number.isFinite(parsedDeclared) || parsedDeclared < 0)
    ) {
      setError("신고가액은 0 이상의 숫자여야 합니다.");
      return;
    }
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await updateCardDetailsAction({
        cardId: card.id,
        englishName: englishName.trim() || undefined,
        setName: setName.trim() || undefined,
        cardNumber: cardNumber.trim() || undefined,
        year: year.trim() || undefined,
        declaredValue: parsedDeclared,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice("저장됨");
      router.refresh();
    });
  };

  return (
    <tr className="border-t border-border align-top">
      <td className="px-5 py-3 text-xs font-mono text-muted-foreground">
        #{index + 1}
      </td>
      <td className="px-5 py-3">
        <input
          type="text"
          value={englishName}
          onChange={(e) => setEnglishName(e.target.value)}
          placeholder="영문명 (예: Pikachu)"
          disabled={isPending}
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
        />
      </td>
      <td className="px-5 py-3">
        <input
          type="text"
          value={setName}
          onChange={(e) => setSetName(e.target.value)}
          placeholder="세트"
          disabled={isPending}
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
        />
      </td>
      <td className="px-5 py-3">
        <input
          type="text"
          value={cardNumber}
          onChange={(e) => setCardNumber(e.target.value)}
          placeholder="번호"
          disabled={isPending}
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
        />
      </td>
      <td className="px-5 py-3">
        <input
          type="text"
          value={year}
          onChange={(e) => setYear(e.target.value)}
          placeholder="연도"
          disabled={isPending}
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
        />
      </td>
      <td className="px-5 py-3">
        <input
          type="text"
          inputMode="numeric"
          value={declaredValue}
          onChange={(e) => setDeclaredValue(e.target.value)}
          placeholder="원"
          disabled={isPending}
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
        />
      </td>
      <td className="px-5 py-3">
        {card.gradeResult ? (
          <span className="rounded-md bg-success/10 px-2 py-1 font-medium text-success">
            {card.gradeResult}
          </span>
        ) : (
          <span className="text-muted-foreground">대기 중</span>
        )}
      </td>
      <td className="px-5 py-3 text-right">
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={save}
            disabled={isPending}
            className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isPending ? "저장 중..." : "저장"}
          </button>
          {error && <p className="text-[10px] text-error">{error}</p>}
          {notice && !error && (
            <p className="text-[10px] text-success">{notice}</p>
          )}
        </div>
      </td>
    </tr>
  );
}
