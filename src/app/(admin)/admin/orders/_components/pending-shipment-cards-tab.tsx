"use client";

// 출고 대기 카드 탭 — 카드 정보 작성 완료(접수 완료, CARD_RECEIVED) 후 출고 전 카드 목록.
// (회사, 서비스) 그룹별로 섹션 분리 + 그룹별/전체 엑셀(CSV with BOM) 내보내기 지원.

import Link from "next/link";
import { useMemo } from "react";
import { SERVICE_LEVELS } from "@/constants/grading";
import type { Card, GradingCompany, Order } from "@/types";
import { useOrderFilters } from "./use-order-filters";
import { OrderFilterToolbar } from "./order-filter-toolbar";

type CardWithOrder = Card & { order: Order };

const getCardOrder = (c: CardWithOrder) => c.order;

function formatDate(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatNumber(n?: number): string {
  if (n === undefined || n === null) return "";
  return n.toLocaleString("ko-KR");
}

function serviceLabel(company: GradingCompany, code: string): string {
  const found = SERVICE_LEVELS[company]?.find((s) => s.value === code);
  return found ? found.label : code;
}

// 파일명 안전화 — Windows/macOS 모두에서 문제 없는 문자 집합으로.
function sanitizeFileName(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "_").trim();
}

// CSV 셀 이스케이프 — 쉼표/따옴표/개행 포함 시 큰따옴표로 감싸고 내부 따옴표 escape.
function csvCell(value: string | number | undefined | null): string {
  const s = value === undefined || value === null ? "" : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildCsvRows(rows: CardWithOrder[]): string[][] {
  const header = [
    "주문번호",
    "고객명",
    "연락처",
    "등급회사",
    "서비스",
    "영문명",
    "세트",
    "카드번호",
    "연도",
    "신고가액(원)",
    "수령방법",
    "접수일",
    "앞면 이미지 URL",
  ];

  const body = rows.map((c) => [
    c.order.id,
    c.order.name,
    c.order.phone,
    c.order.gradingCompany,
    serviceLabel(c.order.gradingCompany, c.order.serviceLevel),
    c.englishName ?? "",
    c.setName ?? "",
    c.cardNumber ?? "",
    c.year ?? "",
    formatNumber(c.declaredValue),
    c.order.pickupMethod === "STORE_PICKUP" ? "매장 수령" : "택배 수령",
    formatDate(c.order.receivedAt ?? c.order.createdAt),
    c.frontImageUrl ?? "",
  ]);

  return [header, ...body];
}

function downloadCsv(filename: string, rows: CardWithOrder[]) {
  const csv = buildCsvRows(rows)
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");

  // UTF-8 BOM — Excel 한글 인코딩 보장.
  const blob = new Blob(["﻿" + csv], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

interface CardGroup {
  key: string;
  company: GradingCompany;
  serviceLevel: string;
  cards: CardWithOrder[];
}

export function PendingShipmentCardsTab({
  orders,
  cards,
}: {
  orders: Order[];
  cards: Card[];
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

  // (회사, 서비스) 그룹핑 — 회사 → 서비스 코드 순으로 정렬.
  const groups = useMemo<CardGroup[]>(() => {
    const m = new Map<string, CardGroup>();
    for (const c of filtered) {
      const key = `${c.order.gradingCompany}::${c.order.serviceLevel}`;
      const existing = m.get(key);
      if (existing) {
        existing.cards.push(c);
      } else {
        m.set(key, {
          key,
          company: c.order.gradingCompany,
          serviceLevel: c.order.serviceLevel,
          cards: [c],
        });
      }
    }
    return Array.from(m.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [filtered]);

  // 전체 CSV — 그룹 순서대로 정렬되어 같은 회사/서비스 행이 인접하게 출력됨.
  const exportAll = () => {
    if (filtered.length === 0) {
      window.alert("내보낼 카드가 없습니다.");
      return;
    }
    const ordered = groups.flatMap((g) => g.cards);
    const ts = new Date().toISOString().slice(0, 10);
    downloadCsv(`출고대기카드_전체_${ts}.csv`, ordered);
  };

  const exportGroup = (g: CardGroup) => {
    if (g.cards.length === 0) return;
    const ts = new Date().toISOString().slice(0, 10);
    const label = sanitizeFileName(
      `${g.company}_${serviceLabel(g.company, g.serviceLevel)}`
    );
    downloadCsv(`출고대기카드_${label}_${ts}.csv`, g.cards);
  };

  return (
    <div className="space-y-4">
      <OrderFilterToolbar state={state} onChange={setState} />

      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-semibold">출고 대기 카드 (접수 완료 → 출고 전)</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              카드 정보 작성이 완료되어 그레이딩사로 출고 대기 중인 카드 목록입니다.
              등급회사와 서비스별로 분리되어 표시되며, 그룹별 또는 전체를
              CSV(엑셀 호환)로 내보낼 수 있습니다.
            </p>
            <p className="mt-2 text-xs">
              <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
                표시 {filtered.length}장 · {groups.length}개 그룹
              </span>
              <span className="ml-2 text-muted-foreground">
                / 전체 {cardsWithOrder.length}장
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={exportAll}
            disabled={filtered.length === 0}
            className="w-full shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            전체 엑셀 내보내기
          </button>
        </div>

        {filtered.length === 0 ? (
          <div className="px-5 py-10 text-center text-muted-foreground">
            {cardsWithOrder.length === 0
              ? "출고 대기 중인 카드가 없습니다."
              : "조건에 맞는 카드가 없습니다."}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {groups.map((g) => (
              <GroupSection
                key={g.key}
                group={g}
                onExport={() => exportGroup(g)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function GroupSection({
  group,
  onExport,
}: {
  group: CardGroup;
  onExport: () => void;
}) {
  return (
    <section>
      <header className="flex flex-col gap-2 bg-muted/20 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">{group.company}</span>
          <span className="text-xs text-muted-foreground">
            · {serviceLabel(group.company, group.serviceLevel)}
          </span>
          <span className="rounded-full bg-primary/10 px-3 py-0.5 text-xs font-medium text-primary">
            {group.cards.length}장
          </span>
        </div>
        <button
          type="button"
          onClick={onExport}
          className="w-full shrink-0 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted/40 sm:w-auto"
        >
          이 그룹 엑셀 내보내기
        </button>
      </header>

      {/* 데스크탑 테이블 (md 이상) */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/10 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">이미지</th>
              <th className="px-3 py-2">주문번호</th>
              <th className="px-3 py-2">고객</th>
              <th className="px-3 py-2">영문명</th>
              <th className="px-3 py-2">세트</th>
              <th className="px-3 py-2">번호</th>
              <th className="px-3 py-2">연도</th>
              <th className="px-3 py-2 text-right">신고가액</th>
              <th className="px-3 py-2">접수일</th>
            </tr>
          </thead>
          <tbody>
            {group.cards.map((c) => (
              <tr
                key={c.id}
                className="border-t border-border align-top hover:bg-muted/20"
              >
                <td className="px-3 py-2">
                  {c.frontImageUrl ? (
                    <a
                      href={c.frontImageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={c.frontImageUrl}
                        alt="카드 앞면"
                        className="h-16 w-12 rounded border border-border object-cover"
                      />
                    </a>
                  ) : (
                    <div className="flex h-16 w-12 items-center justify-center rounded border border-dashed border-border text-[10px] text-muted-foreground">
                      없음
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">
                  <Link
                    href={`/admin/orders/${c.order.id}`}
                    className="font-mono text-primary hover:underline"
                  >
                    {c.order.id}
                  </Link>
                </td>
                <td className="px-3 py-2">{c.order.name}</td>
                <td className="px-3 py-2">{c.englishName ?? ""}</td>
                <td className="px-3 py-2">{c.setName ?? ""}</td>
                <td className="px-3 py-2">{c.cardNumber ?? ""}</td>
                <td className="px-3 py-2">{c.year ?? ""}</td>
                <td className="px-3 py-2 text-right">
                  {c.declaredValue ? `₩${formatNumber(c.declaredValue)}` : ""}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {formatDate(c.order.receivedAt ?? c.order.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 모바일 카드 리스트 (md 미만) */}
      <div className="divide-y divide-border md:hidden">
        {group.cards.map((c) => (
          <div key={c.id} className="flex gap-3 px-4 py-3">
            {c.frontImageUrl ? (
              <a
                href={c.frontImageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={c.frontImageUrl}
                  alt="카드 앞면"
                  className="h-20 w-14 rounded border border-border object-cover"
                />
              </a>
            ) : (
              <div className="flex h-20 w-14 shrink-0 items-center justify-center rounded border border-dashed border-border text-[10px] text-muted-foreground">
                없음
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <Link
                  href={`/admin/orders/${c.order.id}`}
                  className="font-mono text-xs font-medium text-primary hover:underline"
                >
                  {c.order.id}
                </Link>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDate(c.order.receivedAt ?? c.order.createdAt)}
                </span>
              </div>
              <p className="mt-0.5 text-sm font-medium text-foreground">
                {c.order.name}
              </p>
              {c.englishName && (
                <p className="mt-1 truncate text-sm text-foreground">
                  {c.englishName}
                </p>
              )}
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {[c.setName, c.cardNumber, c.year].filter(Boolean).join(" · ")}
              </p>
              {c.declaredValue ? (
                <p className="mt-1 text-xs">
                  신고가액{" "}
                  <span className="font-medium text-foreground">
                    ₩{formatNumber(c.declaredValue)}
                  </span>
                </p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
