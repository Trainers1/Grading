"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  removeCardFrontImageAction,
  updateCardDetailsAction,
  uploadCardFrontImageAction,
} from "@/lib/orders/admin-actions";
import { PHOTO_UPLOAD } from "@/constants/grading";
import type { CardTemplate } from "@/lib/orders/queries";
import type { Card, Order } from "@/types";
import { useOrderFilters } from "./use-order-filters";
import { OrderFilterToolbar } from "./order-filter-toolbar";

type CardWithOrder = Card & { order: Order };

const getCardOrder = (c: CardWithOrder) => c.order;

const AUTOCOMPLETE_MIN_CHARS = 2;
const AUTOCOMPLETE_MAX_RESULTS = 8;

function isCardComplete(c: Card): boolean {
  return (
    !!c.englishName?.trim() &&
    !!c.setName?.trim() &&
    !!c.cardNumber?.trim() &&
    !!c.year?.trim()
  );
}

export function CardInfoEntryTab({
  orders,
  cards,
  templates = [],
}: {
  orders: Order[];
  cards: Card[];
  templates?: CardTemplate[];
}) {
  const cardsWithOrder = useMemo<CardWithOrder[]>(() => {
    const orderById = new Map<string, Order>();
    for (const o of orders) orderById.set(o.id, o);
    const result: CardWithOrder[] = [];
    for (const c of cards) {
      const o = orderById.get(c.orderId);
      if (o) result.push({ ...c, order: o });
    }
    return result;
  }, [orders, cards]);

  const { state, setState, filtered } = useOrderFilters(
    cardsWithOrder,
    getCardOrder
  );

  const totalCards = filtered.length;
  const pendingCards = filtered.filter((c) => !isCardComplete(c)).length;

  return (
    <div className="space-y-4">
      <OrderFilterToolbar state={state} onChange={setState} />

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border p-5">
          <h2 className="font-semibold">카드 정보 작성 (결제 완료 → 접수 완료)</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            결제 완료된 주문의 카드들이 카드별로 나열됩니다. 영문명·세트·번호·연도
            4개 항목을 모두 입력하면 저장되며, 한 주문의 모든 카드가 채워지면
            자동으로 접수 완료 단계로 이동합니다. 앞면 이미지는 선택 항목입니다.
            (빈칸 = 미입력)
          </p>
          <p className="mt-2 text-xs">
            <span className="rounded-full bg-warning/10 px-2 py-0.5 font-medium text-warning">
              미입력 {pendingCards}장
            </span>{" "}
            / 표시 {totalCards}장
          </p>
        </div>

        {filtered.length === 0 ? (
          <div className="px-5 py-10 text-center text-muted-foreground">
            {cardsWithOrder.length === 0
              ? "카드 정보 작성 대기 중인 주문이 없습니다."
              : "조건에 맞는 카드가 없습니다."}
          </div>
        ) : (
          <>
            {/* 데스크탑 테이블 (md 이상) */}
            <table className="hidden w-full text-sm md:table">
              <thead className="bg-muted/30 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-3">주문번호</th>
                  <th className="px-3 py-3">고객</th>
                  <th className="px-3 py-3">회사 / 서비스</th>
                  <th className="px-3 py-3">영문명 *</th>
                  <th className="px-3 py-3">세트 *</th>
                  <th className="px-3 py-3">번호 *</th>
                  <th className="px-3 py-3">연도 *</th>
                  <th className="px-3 py-3">신고가액</th>
                  <th className="px-3 py-3">앞면 이미지</th>
                  <th className="px-3 py-3 text-right">관리</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <CardRowDesktop
                    key={c.id}
                    card={c}
                    order={c.order}
                    templates={templates}
                  />
                ))}
              </tbody>
            </table>

            {/* 모바일 카드 리스트 (md 미만) */}
            <div className="divide-y divide-border md:hidden">
              {filtered.map((c) => (
                <CardRowMobile
                  key={c.id}
                  card={c}
                  order={c.order}
                  templates={templates}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// 카드별 인라인 편집기 상태/핸들러를 desktop·mobile 두 variant 가 공유하기 위한 훅.
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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [isImagePending, startImageTransition] = useTransition();

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

  const isComplete =
    !!englishName.trim() &&
    !!setName.trim() &&
    !!cardNumber.trim() &&
    !!year.trim();

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
      setNotice(result.promoted ? "접수 완료로 이동됨" : "저장됨");
      router.refresh();
    });
  };

  const applyTemplate = (t: CardTemplate) => {
    setEnglishName(t.englishName);
    setSetName(t.setName);
    setCardNumber(t.cardNumber);
    setYear(t.year);
    setDeclaredValue(t.declaredValue ? String(t.declaredValue) : "");
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (
      !(PHOTO_UPLOAD.acceptedFormats as readonly string[]).includes(file.type)
    ) {
      setImageError("JPG 또는 PNG 파일만 업로드할 수 있습니다.");
      return;
    }
    if (file.size > PHOTO_UPLOAD.maxSizeBytes) {
      setImageError(
        `이미지 크기는 ${PHOTO_UPLOAD.maxSizeMB}MB 이하여야 합니다.`
      );
      return;
    }

    setImageError(null);
    const formData = new FormData();
    formData.append("cardId", card.id);
    formData.append("file", file);
    startImageTransition(async () => {
      const result = await uploadCardFrontImageAction(formData);
      if (!result.ok) {
        setImageError(result.error);
        return;
      }
      router.refresh();
    });
  };

  const handleImageRemove = () => {
    if (!window.confirm("앞면 이미지를 삭제하시겠습니까?")) return;
    setImageError(null);
    startImageTransition(async () => {
      const result = await removeCardFrontImageAction({ cardId: card.id });
      if (!result.ok) {
        setImageError(result.error);
        return;
      }
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
    isComplete,
    save,
    applyTemplate,
    fileInputRef,
    imageError,
    isImagePending,
    handleImageSelect,
    handleImageRemove,
  };
}

// 영문명 자동완성 — desktop·mobile 공유. 부모 input 의 ref 위치를 fixed 로 따라간다.
function useEnglishNameAutocomplete(
  englishName: string,
  templates: CardTemplate[]
) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [pos, setPos] = useState<
    { top: number; left: number; width: number } | null
  >(null);

  const suggestions = useMemo<CardTemplate[]>(() => {
    const q = englishName.trim().toLowerCase();
    if (q.length < AUTOCOMPLETE_MIN_CHARS) return [];
    const matched: CardTemplate[] = [];
    for (const t of templates) {
      if (t.englishName.toLowerCase().includes(q)) {
        matched.push(t);
        if (matched.length >= AUTOCOMPLETE_MAX_RESULTS) break;
      }
    }
    return matched;
  }, [englishName, templates]);

  useEffect(() => {
    if (!isOpen) return;
    const update = () => {
      const el = inputRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [isOpen]);

  return { inputRef, isOpen, setIsOpen, pos, suggestions };
}

function AutocompleteDropdown({
  pos,
  suggestions,
  onPick,
}: {
  pos: { top: number; left: number; width: number };
  suggestions: CardTemplate[];
  onPick: (t: CardTemplate) => void;
}) {
  return (
    <ul
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        width: Math.max(pos.width, 280),
      }}
      className="z-50 max-h-80 overflow-auto rounded-md border border-border bg-card shadow-xl"
    >
      {suggestions.map((t, idx) => (
        <li
          key={`${t.englishName}-${t.setName}-${t.cardNumber}-${t.year}-${idx}`}
        >
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(t);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/40"
          >
            {t.frontImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={t.frontImageUrl}
                alt=""
                className="h-12 w-9 flex-shrink-0 rounded border border-border object-cover"
              />
            ) : (
              <div className="flex h-12 w-9 flex-shrink-0 items-center justify-center rounded border border-dashed border-border text-[9px] text-muted-foreground">
                없음
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-foreground">
                {t.englishName}
              </div>
              <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                {t.setName} · #{t.cardNumber} · {t.year}
                {t.declaredValue
                  ? ` · ₩${t.declaredValue.toLocaleString("ko-KR")}`
                  : ""}
              </div>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function CardRowDesktop({
  card,
  order,
  templates,
}: {
  card: Card;
  order: Order;
  templates: CardTemplate[];
}) {
  const ed = useCardEditor(card);
  const ac = useEnglishNameAutocomplete(ed.englishName, templates);

  return (
    <tr
      className={`border-t border-border align-top ${
        ed.isComplete ? "bg-success/5" : ""
      }`}
    >
      <td className="px-3 py-3">
        <Link
          href={`/admin/orders/${order.id}`}
          className="font-mono text-primary hover:underline"
        >
          {order.id}
        </Link>
      </td>
      <td className="px-3 py-3">{order.name}</td>
      <td className="px-3 py-3 text-muted-foreground">
        <div>{order.gradingCompany}</div>
        <div className="text-[10px]">{order.serviceLevel}</div>
      </td>
      <td className="px-3 py-3">
        <input
          ref={ac.inputRef}
          type="text"
          value={ed.englishName}
          onChange={(e) => {
            ed.setEnglishName(e.target.value);
            ac.setIsOpen(true);
          }}
          onFocus={() => ac.setIsOpen(true)}
          onBlur={() => {
            setTimeout(() => ac.setIsOpen(false), 120);
          }}
          placeholder="예: Pikachu"
          disabled={ed.isPending}
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
          autoComplete="off"
        />
        {ac.isOpen && ac.pos && ac.suggestions.length > 0 && (
          <AutocompleteDropdown
            pos={ac.pos}
            suggestions={ac.suggestions}
            onPick={(t) => {
              ed.applyTemplate(t);
              ac.setIsOpen(false);
            }}
          />
        )}
      </td>
      <td className="px-3 py-3">
        <input
          type="text"
          value={ed.setName}
          onChange={(e) => ed.setSetName(e.target.value)}
          placeholder="세트"
          disabled={ed.isPending}
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
        />
      </td>
      <td className="px-3 py-3">
        <input
          type="text"
          value={ed.cardNumber}
          onChange={(e) => ed.setCardNumber(e.target.value)}
          placeholder="번호"
          disabled={ed.isPending}
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
        />
      </td>
      <td className="px-3 py-3">
        <input
          type="text"
          value={ed.year}
          onChange={(e) => ed.setYear(e.target.value)}
          placeholder="연도"
          disabled={ed.isPending}
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
        />
      </td>
      <td className="px-3 py-3">
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
      <td className="px-3 py-3">
        <div className="flex flex-col items-start gap-1">
          <input
            ref={ed.fileInputRef}
            type="file"
            accept={PHOTO_UPLOAD.acceptedExtensions}
            onChange={ed.handleImageSelect}
            disabled={ed.isImagePending}
            className="hidden"
          />
          {card.frontImageUrl ? (
            <>
              <a
                href={card.frontImageUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={card.frontImageUrl}
                  alt="카드 앞면"
                  className="h-14 w-10 rounded border border-border object-cover"
                />
              </a>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => ed.fileInputRef.current?.click()}
                  disabled={ed.isImagePending}
                  className="text-[10px] text-primary hover:underline disabled:opacity-50"
                >
                  {ed.isImagePending ? "처리 중..." : "변경"}
                </button>
                <button
                  type="button"
                  onClick={ed.handleImageRemove}
                  disabled={ed.isImagePending}
                  className="text-[10px] text-error hover:underline disabled:opacity-50"
                >
                  삭제
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => ed.fileInputRef.current?.click()}
              disabled={ed.isImagePending}
              className="rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {ed.isImagePending ? "업로드 중..." : "이미지 업로드"}
            </button>
          )}
          {ed.imageError && (
            <p className="text-[10px] text-error">{ed.imageError}</p>
          )}
        </div>
      </td>
      <td className="px-3 py-3 text-right">
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

function CardRowMobile({
  card,
  order,
  templates,
}: {
  card: Card;
  order: Order;
  templates: CardTemplate[];
}) {
  const ed = useCardEditor(card);
  const ac = useEnglishNameAutocomplete(ed.englishName, templates);

  return (
    <div className={`px-4 py-3 ${ed.isComplete ? "bg-success/5" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/admin/orders/${order.id}`}
          className="font-mono text-sm font-medium text-primary hover:underline"
        >
          {order.id}
        </Link>
        <span className="shrink-0 text-xs text-muted-foreground">
          {order.gradingCompany} / {order.serviceLevel}
        </span>
      </div>
      <p className="mt-0.5 text-sm font-medium">{order.name}</p>

      <div className="mt-3 grid grid-cols-1 gap-2">
        <label className="block text-xs">
          <span className="text-muted-foreground">영문명 *</span>
          <input
            ref={ac.inputRef}
            type="text"
            value={ed.englishName}
            onChange={(e) => {
              ed.setEnglishName(e.target.value);
              ac.setIsOpen(true);
            }}
            onFocus={() => ac.setIsOpen(true)}
            onBlur={() => {
              setTimeout(() => ac.setIsOpen(false), 120);
            }}
            placeholder="예: Pikachu"
            disabled={ed.isPending}
            className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-2 text-sm"
            autoComplete="off"
          />
          {ac.isOpen && ac.pos && ac.suggestions.length > 0 && (
            <AutocompleteDropdown
              pos={ac.pos}
              suggestions={ac.suggestions}
              onPick={(t) => {
                ed.applyTemplate(t);
                ac.setIsOpen(false);
              }}
            />
          )}
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs">
            <span className="text-muted-foreground">세트 *</span>
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
            <span className="text-muted-foreground">번호 *</span>
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
            <span className="text-muted-foreground">연도 *</span>
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

        <div className="flex items-center gap-3">
          <input
            ref={ed.fileInputRef}
            type="file"
            accept={PHOTO_UPLOAD.acceptedExtensions}
            onChange={ed.handleImageSelect}
            disabled={ed.isImagePending}
            className="hidden"
          />
          {card.frontImageUrl ? (
            <>
              <a
                href={card.frontImageUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={card.frontImageUrl}
                  alt="카드 앞면"
                  className="h-14 w-10 rounded border border-border object-cover"
                />
              </a>
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => ed.fileInputRef.current?.click()}
                  disabled={ed.isImagePending}
                  className="text-xs text-primary hover:underline disabled:opacity-50"
                >
                  {ed.isImagePending ? "처리 중..." : "이미지 변경"}
                </button>
                <button
                  type="button"
                  onClick={ed.handleImageRemove}
                  disabled={ed.isImagePending}
                  className="text-xs text-error hover:underline disabled:opacity-50"
                >
                  이미지 삭제
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => ed.fileInputRef.current?.click()}
              disabled={ed.isImagePending}
              className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {ed.isImagePending ? "업로드 중..." : "앞면 이미지 업로드"}
            </button>
          )}
        </div>
        {ed.imageError && (
          <p className="text-xs text-error">{ed.imageError}</p>
        )}

        <button
          type="button"
          onClick={ed.save}
          disabled={ed.isPending}
          className="mt-1 w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {ed.isPending ? "저장 중..." : "저장"}
        </button>
        {ed.error && <p className="text-xs text-error">{ed.error}</p>}
        {ed.notice && !ed.error && (
          <p className="text-xs text-success">{ed.notice}</p>
        )}
      </div>
    </div>
  );
}
