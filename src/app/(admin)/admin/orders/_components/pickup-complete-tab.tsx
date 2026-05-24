"use client";

// 수령 완료 탭 — 매장 방문 수령(STORE_PICKUP) + 트레이너스 도착(TRAINERS_ARRIVED)
// 주문을 행 단위로 수령 완료(COMPLETED) 처리한다.

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completePickupOrderAction } from "@/lib/orders/admin-actions";
import type { Order } from "@/types";
import { useOrderFilters } from "./use-order-filters";
import { OrderFilterToolbar } from "./order-filter-toolbar";

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

export function PickupCompleteTab({ orders }: { orders: Order[] }) {
  const router = useRouter();
  const { state, setState, filtered } = useOrderFilters(orders, identity);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleComplete = (orderId: string) => {
    const ok = window.confirm(
      `주문 ${orderId} 을(를) 수령 완료 처리하시겠습니까?`
    );
    if (!ok) return;
    setError(null);
    setPendingId(orderId);
    startTransition(async () => {
      const result = await completePickupOrderAction({ orderId });
      setPendingId(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <OrderFilterToolbar state={state} onChange={setState} />

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border p-5">
          <h2 className="font-semibold">
            수령 완료 (트레이너스 도착 → 수령 완료)
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            매장 방문 수령 주문 중 트레이너스 도착 단계의 주문입니다. 고객이
            매장에서 카드를 수령해 가면 "수령 완료"를 눌러 등급 대행을
            마무리합니다. (택배 수령 주문은 택배 발송 페이지에서 처리됩니다.)
          </p>
        </div>

        {error && (
          <div className="border-b border-error/30 bg-error/5 px-5 py-2 text-xs text-error">
            {error}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-5 py-3">주문번호</th>
                <th className="px-5 py-3">고객</th>
                <th className="px-5 py-3">회사 / 서비스</th>
                <th className="px-5 py-3">금액</th>
                <th className="px-5 py-3">신청일</th>
                <th className="px-5 py-3 text-right">관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-10 text-center text-muted-foreground"
                  >
                    {orders.length === 0
                      ? "수령 대기 중인 매장 수령 주문이 없습니다."
                      : "조건에 맞는 주문이 없습니다."}
                  </td>
                </tr>
              ) : (
                filtered.map((o) => (
                  <tr
                    key={o.id}
                    className="border-t border-border align-top hover:bg-muted/20"
                  >
                    <td className="px-5 py-3">
                      <Link
                        href={`/admin/orders/${o.id}`}
                        className="font-mono text-primary hover:underline"
                      >
                        {o.id}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <p className="font-medium">{o.name}</p>
                      <p className="text-xs text-muted-foreground">{o.phone}</p>
                    </td>
                    <td className="px-5 py-3">
                      {o.gradingCompany} / {o.serviceLevel}
                    </td>
                    <td className="px-5 py-3">
                      {formatCurrency(
                        o.prepaidAmount + (o.overchargeAmount ?? 0)
                      )}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {formatDate(o.createdAt)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleComplete(o.id)}
                        disabled={isPending}
                        className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isPending && pendingId === o.id
                          ? "처리 중..."
                          : "수령 완료"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
