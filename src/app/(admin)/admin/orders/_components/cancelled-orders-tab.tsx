"use client";

// 취소됨 탭 — 취소된 주문 목록. 잔존 결제 정리(환불) → 영구 삭제 흐름.
// page.tsx 의 서버 컴포넌트에서 paymentCounts(Record) 와 권한 플래그를 받아 렌더링한다.

import Link from "next/link";
import type { Order } from "@/types";
import { DeleteOrderButton } from "./delete-order-button";
import { RefundOrderButton } from "./refund-order-button";
import { useOrderFilters } from "./use-order-filters";
import { OrderFilterToolbar } from "./order-filter-toolbar";

const identity = (o: Order) => o;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  });
}

export function CancelledOrdersTab({
  orders,
  paymentCounts,
  canDelete,
  canRefund,
}: {
  orders: Order[];
  paymentCounts: Record<string, number>;
  canDelete: boolean;
  canRefund: boolean;
}) {
  const { state, setState, filtered } = useOrderFilters(orders, identity);

  return (
    <div className="space-y-4">
      <OrderFilterToolbar state={state} onChange={setState} />

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border p-5">
          <h2 className="font-semibold">취소된 주문</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            잔존 결제 내역이 있으면 먼저 "현장 환불 완료"로 정리한 뒤 삭제할 수 있습니다.
            {canDelete
              ? " 삭제 시 카드 정보와 상태 로그까지 영구 제거되며 되돌릴 수 없습니다."
              : " 영구 삭제는 슈퍼관리자만 가능합니다."}
          </p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-5 py-3">주문번호</th>
              <th className="px-5 py-3">이름</th>
              <th className="px-5 py-3">회사</th>
              <th className="px-5 py-3">취소 사유</th>
              <th className="px-5 py-3">취소일</th>
              <th className="px-5 py-3">결제내역</th>
              <th className="px-5 py-3 text-right">관리</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-5 py-10 text-center text-muted-foreground"
                >
                  {orders.length === 0
                    ? "취소된 주문이 없습니다."
                    : "조건에 맞는 주문이 없습니다."}
                </td>
              </tr>
            ) : (
              filtered.map((o) => {
                const pCount = paymentCounts[o.id] ?? 0;
                const hasPayments = pCount > 0;
                return (
                  <tr key={o.id} className="border-t border-border align-top">
                    <td className="px-5 py-3">
                      <Link
                        href={`/admin/orders/${o.id}`}
                        className="font-mono text-primary hover:underline"
                      >
                        {o.id}
                      </Link>
                    </td>
                    <td className="px-5 py-3">{o.name}</td>
                    <td className="px-5 py-3">{o.gradingCompany}</td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {o.cancelReason ?? "-"}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {o.cancelledAt ? formatDate(o.cancelledAt) : "-"}
                    </td>
                    <td className="px-5 py-3 text-xs">
                      {hasPayments ? (
                        <span className="rounded-full bg-warning/10 px-2 py-0.5 font-medium text-warning">
                          잔존 {pCount}건
                        </span>
                      ) : (
                        <span className="text-muted-foreground">없음</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {hasPayments ? (
                        <RefundOrderButton
                          orderId={o.id}
                          canRefund={canRefund}
                        />
                      ) : canDelete ? (
                        <DeleteOrderButton orderId={o.id} canDelete={canDelete} />
                      ) : (
                        <span className="text-[10px] text-muted-foreground">
                          -
                        </span>
                      )}
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
