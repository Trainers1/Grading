"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  bulkArriveOrdersAction,
  bulkShipOutOrdersAction,
} from "@/lib/orders/admin-actions";
import type { Order } from "@/types";
import { useOrderFilters } from "./use-order-filters";
import { OrderFilterToolbar } from "./order-filter-toolbar";

type SubMode = "ship" | "arrive";

const identity = (o: Order) => o;

function formatCurrency(amount: number): string {
  return `₩${amount.toLocaleString("ko-KR")}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  });
}

export function ShipArriveTab({
  mode,
  orders,
  baseHref,
}: {
  mode: SubMode;
  orders: Order[];
  /** "/admin/orders?view=shipping" 등 — 서브탭 토글에 사용 */
  baseHref: string;
}) {
  const router = useRouter();
  const { state, setState, filtered } = useOrderFilters(orders, identity);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // (회사, 서비스) 그룹핑 — 필터 결과 기준
  const groups = useMemo(() => {
    const m = new Map<string, Order[]>();
    for (const o of filtered) {
      const key = `${o.gradingCompany}::${o.serviceLevel}`;
      const list = m.get(key);
      if (list) list.push(o);
      else m.set(key, [o]);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const allIds = useMemo(() => filtered.map((o) => o.id), [filtered]);
  const filteredIds = useMemo(() => new Set(allIds), [allIds]);
  const isAllSelected = allIds.length > 0 && selected.size === allIds.length;

  // 필터 변경 시 보이지 않는 행의 선택 해제
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => filteredIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [filteredIds]);

  const toggleAll = () => {
    if (isAllSelected) setSelected(new Set());
    else setSelected(new Set(allIds));
  };

  const toggleGroup = (groupOrders: Order[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const groupIds = groupOrders.map((o) => o.id);
      const allInGroup = groupIds.every((id) => next.has(id));
      if (allInGroup) for (const id of groupIds) next.delete(id);
      else for (const id of groupIds) next.add(id);
      return next;
    });
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const resetMessages = () => {
    setError(null);
    setNotice(null);
  };

  const handleAction = () => {
    if (selected.size === 0) {
      setError(
        mode === "ship"
          ? "출고 처리할 주문을 선택해 주세요."
          : "입고 처리할 주문을 선택해 주세요."
      );
      return;
    }
    const verb = mode === "ship" ? "출고" : "입고";
    const ok = window.confirm(
      `선택한 ${selected.size}건의 주문을 ${verb} 처리하시겠습니까?`
    );
    if (!ok) return;
    resetMessages();
    startTransition(async () => {
      const result =
        mode === "ship"
          ? await bulkShipOutOrdersAction({ orderIds: Array.from(selected) })
          : await bulkArriveOrdersAction({ orderIds: Array.from(selected) });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(`${result.processedCount}건 ${verb} 처리됨.`);
      setSelected(new Set());
      router.refresh();
    });
  };

  const subTabLink = (target: SubMode) => {
    const sp = new URLSearchParams(baseHref.split("?")[1] ?? "");
    sp.set("view", "shipping");
    sp.set("sub", target);
    return `/admin/orders?${sp}`;
  };

  const title =
    mode === "ship"
      ? "출고 (접수 완료 → 출고)"
      : "입고 (등급 확정 → 트레이너스 도착)";
  const desc =
    mode === "ship"
      ? "접수 완료 상태의 주문을 그레이딩사 및 서비스 단위로 묶어 일괄 출고 처리합니다."
      : "등급 확정 상태의 주문을 그레이딩사 및 서비스 단위로 묶어 일괄 입고(트레이너스 도착) 처리합니다.";
  const actionLabel = mode === "ship" ? "출고 처리" : "입고 처리";

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-border">
        <Link
          href={subTabLink("ship")}
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            mode === "ship"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          출고
        </Link>
        <Link
          href={subTabLink("arrive")}
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            mode === "arrive"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          입고
        </Link>
      </div>

      <OrderFilterToolbar state={state} onChange={setState} />

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border p-5">
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted/10 px-5 py-3">
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={isAllSelected}
              onChange={toggleAll}
              disabled={isPending || filtered.length === 0}
            />
            전체 선택 ({filtered.length}건)
          </label>
          <span className="text-xs text-muted-foreground">
            선택 {selected.size}건
          </span>
          <button
            type="button"
            onClick={handleAction}
            disabled={isPending || selected.size === 0}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "처리 중..." : `선택 ${actionLabel}`}
          </button>
        </div>

        {error && (
          <div className="border-b border-error/30 bg-error/5 px-5 py-2 text-xs text-error">
            {error}
          </div>
        )}
        {notice && (
          <div className="border-b border-success/30 bg-success/5 px-5 py-2 text-xs text-success">
            {notice}
          </div>
        )}

        {groups.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            {orders.length === 0
              ? "처리 대기 중인 주문이 없습니다."
              : "조건에 맞는 주문이 없습니다."}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {groups.map(([key, groupOrders]) => {
              const [company, service] = key.split("::");
              const groupIds = groupOrders.map((o) => o.id);
              const allGroupSelected = groupIds.every((id) =>
                selected.has(id)
              );
              const someGroupSelected =
                !allGroupSelected && groupIds.some((id) => selected.has(id));
              return (
                <section key={key}>
                  <header className="flex items-center justify-between bg-muted/20 px-5 py-2">
                    <label className="flex items-center gap-2 text-sm font-semibold">
                      <input
                        type="checkbox"
                        checked={allGroupSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someGroupSelected;
                        }}
                        onChange={() => toggleGroup(groupOrders)}
                        disabled={isPending}
                      />
                      {company}
                      <span className="text-xs font-normal text-muted-foreground">
                        · {service}
                      </span>
                    </label>
                    <span className="rounded-full bg-primary/10 px-3 py-0.5 text-xs font-medium text-primary">
                      {groupOrders.length}건
                    </span>
                  </header>
                  {/* 데스크탑 테이블 (md 이상) */}
                  <table className="hidden w-full text-sm md:table">
                    <thead className="bg-muted/10 text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="w-10 px-3 py-2"></th>
                        <th className="px-3 py-2">주문번호</th>
                        <th className="px-3 py-2">이름</th>
                        <th className="px-3 py-2">금액</th>
                        <th className="px-3 py-2">접수일</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupOrders.map((o) => {
                        const checked = selected.has(o.id);
                        return (
                          <tr
                            key={o.id}
                            className={`border-t border-border hover:bg-muted/20 ${
                              checked ? "bg-primary/5" : ""
                            }`}
                          >
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleOne(o.id)}
                                disabled={isPending}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <Link
                                href={`/admin/orders/${o.id}`}
                                className="font-mono text-primary hover:underline"
                              >
                                {o.id}
                              </Link>
                            </td>
                            <td className="px-3 py-2">{o.name}</td>
                            <td className="px-3 py-2">
                              {formatCurrency(
                                o.prepaidAmount + (o.overchargeAmount ?? 0)
                              )}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {formatDate(o.createdAt)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* 모바일 카드 리스트 (md 미만) */}
                  <div className="divide-y divide-border md:hidden">
                    {groupOrders.map((o) => {
                      const checked = selected.has(o.id);
                      return (
                        <div
                          key={o.id}
                          className={`flex items-start gap-3 px-4 py-3 ${
                            checked ? "bg-primary/5" : ""
                          }`}
                        >
                          <input
                            type="checkbox"
                            aria-label={`${o.id} 선택`}
                            checked={checked}
                            onChange={() => toggleOne(o.id)}
                            disabled={isPending}
                            className="mt-1"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <Link
                                href={`/admin/orders/${o.id}`}
                                className="font-mono text-sm font-medium text-primary hover:underline"
                              >
                                {o.id}
                              </Link>
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {formatDate(o.createdAt)}
                              </span>
                            </div>
                            <div className="mt-1 flex items-baseline justify-between gap-2 text-sm">
                              <span className="font-medium">{o.name}</span>
                              <span className="text-foreground">
                                {formatCurrency(
                                  o.prepaidAmount + (o.overchargeAmount ?? 0)
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
