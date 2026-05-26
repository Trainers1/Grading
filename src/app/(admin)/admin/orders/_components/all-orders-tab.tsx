"use client";

// 전체 주문 탭 — 진행 중인 모든 상태의 주문을 한 표에서 조회.
// 검색·등급회사·서비스·상태·정렬은 클라이언트 사이드 공통 툴바로 처리한다.
// 행의 주문번호/관리 링크로 상세 페이지(/admin/orders/[id])에 진입해 관리한다.

import Link from "next/link";
import {
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
} from "@/constants/grading";
import type { Order } from "@/types";
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

function formatCurrency(amount: number): string {
  return `₩${amount.toLocaleString("ko-KR")}`;
}

export function AllOrdersTab({ orders }: { orders: Order[] }) {
  const { state, setState, filtered } = useOrderFilters(orders, identity);

  return (
    <div className="space-y-4">
      <OrderFilterToolbar state={state} onChange={setState} withStatus />

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border p-5">
          <h2 className="font-semibold">전체 주문</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            진행 중인 모든 상태의 주문입니다. 주문번호 또는 관리 링크로 상세
            페이지에 들어가 상태 변경·취소 등을 처리할 수 있습니다. (표시{" "}
            {filtered.length}건 / 전체 {orders.length}건)
          </p>
        </div>
        {/* 데스크탑 테이블 (md 이상) */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-5 py-3">주문번호</th>
                <th className="px-5 py-3">고객</th>
                <th className="px-5 py-3">회사 / 서비스</th>
                <th className="px-5 py-3">상태</th>
                <th className="px-5 py-3">결제</th>
                <th className="px-5 py-3 text-right">금액</th>
                <th className="px-5 py-3">신청일</th>
                <th className="px-5 py-3 text-right">관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-5 py-10 text-center text-muted-foreground"
                  >
                    조건에 맞는 주문이 없습니다.
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
                      <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                        {ORDER_STATUS_LABELS[o.orderStatus] ?? o.orderStatus}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-muted-foreground">
                      {PAYMENT_STATUS_LABELS[o.paymentStatus] ??
                        o.paymentStatus}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {formatCurrency(
                        o.prepaidAmount + (o.overchargeAmount ?? 0)
                      )}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {formatDate(o.createdAt)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/admin/orders/${o.id}`}
                        className="text-primary hover:underline"
                      >
                        상세 →
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 모바일 카드 리스트 (md 미만) */}
        <div className="divide-y divide-border md:hidden">
          {filtered.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              조건에 맞는 주문이 없습니다.
            </p>
          ) : (
            filtered.map((o) => (
              <Link
                key={o.id}
                href={`/admin/orders/${o.id}`}
                className="block px-4 py-3 hover:bg-muted/20 active:bg-muted/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-sm font-medium text-primary">
                    {o.id}
                  </span>
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    {ORDER_STATUS_LABELS[o.orderStatus] ?? o.orderStatus}
                  </span>
                </div>
                <div className="mt-1.5 flex items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">
                    {o.name}
                  </p>
                  <p className="shrink-0 text-xs text-muted-foreground">
                    {o.phone}
                  </p>
                </div>
                <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  <span>
                    {o.gradingCompany} / {o.serviceLevel}
                  </span>
                  <span className="text-right">{formatDate(o.createdAt)}</span>
                  <span>
                    {PAYMENT_STATUS_LABELS[o.paymentStatus] ?? o.paymentStatus}
                  </span>
                  <span className="text-right font-medium text-foreground">
                    {formatCurrency(
                      o.prepaidAmount + (o.overchargeAmount ?? 0)
                    )}
                  </span>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
