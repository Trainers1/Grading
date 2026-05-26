"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCardDetailsAction } from "@/lib/orders/admin-actions";
import type { Card } from "@/types";

// 카드 편집 상태/핸들러 공유 훅 — desktop·mobile 두 variant 에서 사용.
function useCardEditor(card: Card) {
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

  return {
    englishName,
    setEnglishName,
    setName,
    setSetName,
    cardNumber,
    setCardNumber,
    year,
    setYear,
    declaredValue,
    setDeclaredValue,
    error,
    notice,
    isPending,
    save,
  };
}

export function CardEditor({
  card,
  index,
}: {
  card: Card;
  /** 카드 행 번호 (주문 내 0-based 인덱스) — 표시용 */
  index: number;
}) {
  const ed = useCardEditor(card);

  return (
    <tr className="border-t border-border align-top">
      <td className="px-5 py-3 text-xs font-mono text-muted-foreground">
        #{index + 1}
      </td>
      <td className="px-5 py-3">
        <input
          type="text"
          value={ed.englishName}
          onChange={(e) => ed.setEnglishName(e.target.value)}
          placeholder="영문명 (예: Pikachu)"
          disabled={ed.isPending}
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
        />
      </td>
      <td className="px-5 py-3">
        <input
          type="text"
          value={ed.setName}
          onChange={(e) => ed.setSetName(e.target.value)}
          placeholder="세트"
          disabled={ed.isPending}
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
        />
      </td>
      <td className="px-5 py-3">
        <input
          type="text"
          value={ed.cardNumber}
          onChange={(e) => ed.setCardNumber(e.target.value)}
          placeholder="번호"
          disabled={ed.isPending}
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
        />
      </td>
      <td className="px-5 py-3">
        <input
          type="text"
          value={ed.year}
          onChange={(e) => ed.setYear(e.target.value)}
          placeholder="연도"
          disabled={ed.isPending}
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
        />
      </td>
      <td className="px-5 py-3">
        <input
          type="text"
          inputMode="numeric"
          value={ed.declaredValue}
          onChange={(e) => ed.setDeclaredValue(e.target.value)}
          placeholder="원"
          disabled={ed.isPending}
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
        />
      </td>
      <td className="px-5 py-3">
        {card.serialNumber ? (
          <span className="rounded-md bg-success/10 px-2 py-1 font-mono text-xs text-success">
            {card.serialNumber}
          </span>
        ) : (
          <span className="text-muted-foreground">대기 중</span>
        )}
      </td>
      <td className="px-5 py-3 text-right">
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={ed.save}
            disabled={ed.isPending}
            className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {ed.isPending ? "저장 중..." : "저장"}
          </button>
          {ed.error && <p className="text-[10px] text-error">{ed.error}</p>}
          {ed.notice && !ed.error && (
            <p className="text-[10px] text-success">{ed.notice}</p>
          )}
        </div>
      </td>
    </tr>
  );
}

// 모바일용 카드 편집기 — div 기반 stacked 레이아웃. 부모는 desktop CardEditor 와 함께 마운트.
export function CardEditorMobile({
  card,
  index,
}: {
  card: Card;
  index: number;
}) {
  const ed = useCardEditor(card);

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-medium text-muted-foreground">
          카드 #{index + 1}
        </span>
        {card.serialNumber ? (
          <span className="rounded-md bg-success/10 px-2 py-0.5 font-mono text-xs text-success">
            {card.serialNumber}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">일련번호 대기</span>
        )}
      </div>

      <div className="mt-2 space-y-2">
        <label className="block text-xs">
          <span className="text-muted-foreground">영문명</span>
          <input
            type="text"
            value={ed.englishName}
            onChange={(e) => ed.setEnglishName(e.target.value)}
            placeholder="영문명 (예: Pikachu)"
            disabled={ed.isPending}
            className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-2 text-sm"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs">
            <span className="text-muted-foreground">세트</span>
            <input
              type="text"
              value={ed.setName}
              onChange={(e) => ed.setSetName(e.target.value)}
              placeholder="세트"
              disabled={ed.isPending}
              className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-2 text-sm"
            />
          </label>
          <label className="block text-xs">
            <span className="text-muted-foreground">번호</span>
            <input
              type="text"
              value={ed.cardNumber}
              onChange={(e) => ed.setCardNumber(e.target.value)}
              placeholder="번호"
              disabled={ed.isPending}
              className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-2 text-sm"
            />
          </label>
          <label className="block text-xs">
            <span className="text-muted-foreground">연도</span>
            <input
              type="text"
              value={ed.year}
              onChange={(e) => ed.setYear(e.target.value)}
              placeholder="연도"
              disabled={ed.isPending}
              className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-2 text-sm"
            />
          </label>
          <label className="block text-xs">
            <span className="text-muted-foreground">신고가액</span>
            <input
              type="text"
              inputMode="numeric"
              value={ed.declaredValue}
              onChange={(e) => ed.setDeclaredValue(e.target.value)}
              placeholder="원"
              disabled={ed.isPending}
              className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-2 text-sm"
            />
          </label>
        </div>
      </div>

      <button
        type="button"
        onClick={ed.save}
        disabled={ed.isPending}
        className="mt-2 w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {ed.isPending ? "저장 중..." : "저장"}
      </button>
      {ed.error && <p className="mt-1 text-xs text-error">{ed.error}</p>}
      {ed.notice && !ed.error && (
        <p className="mt-1 text-xs text-success">{ed.notice}</p>
      )}
    </div>
  );
}
