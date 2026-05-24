"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  bulkCompleteOnsitePaymentAction,
  completeOnsitePaymentAction,
} from "@/lib/orders/admin-actions";
import type { Order } from "@/types";
import { useOrderFilters } from "./use-order-filters";
import { OrderFilterToolbar } from "./order-filter-toolbar";

const identity = (o: Order) => o;

function formatCurrency(amount: number): string {
  return `₩${amount.toLocaleString("ko-KR")}`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR");
}

export function IntakeManagementTab({ orders }: { orders: Order[] }) {
  const router = useRouter();
  const { state, setState, filtered } = useOrderFilters(orders, identity);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const allIds = useMemo(() => filtered.map((o) => o.id), [filtered]);
  const filteredIds = useMemo(() => new Set(allIds), [allIds]);
  const isAllSelected = allIds.length > 0 && selected.size === allIds.length;
  const isSomeSelected = selected.size > 0 && !isAllSelected;

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

  const handleBulkComplete = () => {
    if (selected.size === 0) {
      setError("결제 완료 처리할 주문을 선택해 주세요.");
      return;
    }
    const ok = window.confirm(
      `선택한 ${selected.size}건의 현장 결제를 완료 처리하시겠습니까?`
    );
    if (!ok) return;
    resetMessages();
    startTransition(async () => {
      const result = await bulkCompleteOnsitePaymentAction({
        orderIds: Array.from(selected),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(`${result.processedCount}건 결제 완료 처리됨.`);
      setSelected(new Set());
      router.refresh();
    });
  };

  const handleSingleComplete = (orderId: string) => {
    const ok = window.confirm(
      `주문 ${orderId} 의 현장 결제를 완료 처리하시겠습니까?`
    );
    if (!ok) return;
    resetMessages();
    startTransition(async () => {
      const result = await completeOnsitePaymentAction({ orderId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(`주문 ${orderId} 결제 완료 처리됨.`);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <OrderFilterToolbar state={state} onChange={setState} />

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border p-5">
          <h2 className="font-semibold">접수 관리 (신청 완료 → 결제 완료)</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            현장 결제로 신청된 주문 목록입니다. 매장에서 결제 수령 후 "결제 완료
            처리"를 눌러 다음 단계로 진행해 주세요.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted/10 px-5 py-3">
          <span className="text-xs text-muted-foreground">
            선택 {selected.size}건
          </span>
          <button
            type="button"
            onClick={handleBulkComplete}
            disabled={isPending || selected.size === 0}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "처리 중..." : "선택 결제 완료 처리"}
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

        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  aria-label="전체 선택"
                  checked={isAllSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = isSomeSelected;
                  }}
                  onChange={toggleAll}
                  disabled={isPending || filtered.length === 0}
                />
              </th>
              <th className="px-3 py-3">주문번호</th>
              <th className="px-3 py-3">이름</th>
              <th className="px-3 py-3">회사</th>
              <th className="px-3 py-3">서비스</th>
              <th className="px-3 py-3">결제 예정</th>
              <th className="px-3 py-3">신청일</th>
              <th className="px-3 py-3 text-right">처리</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-5 py-10 text-center text-muted-foreground"
                >
                  {orders.length === 0
                    ? "결제 완료 처리 대기 중인 주문이 없습니다."
                    : "조건에 맞는 주문이 없습니다."}
                </td>
              </tr>
            ) : (
              filtered.map((o) => {
                const checked = selected.has(o.id);
                return (
                  <tr
                    key={o.id}
                    className={`border-t border-border hover:bg-muted/20 ${
                      checked ? "bg-primary/5" : ""
                    }`}
                  >
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        aria-label={`${o.id} 선택`}
                        checked={checked}
                        onChange={() => toggleOne(o.id)}
                        disabled={isPending}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <Link
                        href={`/admin/orders/${o.id}`}
                        className="font-mono text-primary hover:underline"
                      >
                        {o.id}
                      </Link>
                    </td>
                    <td className="px-3 py-3">{o.name}</td>
                    <td className="px-3 py-3">{o.gradingCompany}</td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {o.serviceLevel}
                    </td>
                    <td className="px-3 py-3">
                      {formatCurrency(o.prepaidAmount)}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {formatDateTime(o.createdAt)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleSingleComplete(o.id)}
                        disabled={isPending}
                        className="rounded-md border border-primary/40 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        결제 완료
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
