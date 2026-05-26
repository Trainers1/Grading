"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ORDER_STATUS_LABELS } from "@/constants/grading";
import type { Order } from "@/types/order";

type FilterTab =
  | "all"
  | "in_progress"
  | "pickup_ready"
  | "completed"
  | "payment_needed";

const TABS: { key: FilterTab; label: string; accent?: "error" }[] = [
  { key: "all", label: "전체" },
  { key: "in_progress", label: "진행중" },
  { key: "pickup_ready", label: "수령 가능" },
  { key: "completed", label: "완료" },
  { key: "payment_needed", label: "결제필요", accent: "error" },
];

function getStatusColor(status: Order["orderStatus"]) {
  if (status === "COMPLETED") return "bg-muted text-muted-foreground";
  if (status === "TRAINERS_ARRIVED")
    return "bg-success/10 text-success";
  if (
    status === "PAYMENT_PENDING" ||
    status === "CARD_DELIVERY_PENDING" ||
    status === "CARD_RECEIVED"
  ) {
    return "bg-warning/10 text-warning";
  }
  return "bg-primary/10 text-primary";
}

// 신청 후 미결제 — 그레이딩 신청만 하고 선결제가 안 된 상태.
function needsPrepayment(o: Order): boolean {
  return o.orderStatus === "PAYMENT_PENDING";
}

// 오버차지 결제 필요 — 운영자가 추가 비용을 청구하고 결제 대기.
function needsOvercharge(o: Order): boolean {
  return o.paymentStatus === "OVERCHARGE_PENDING";
}

// 배송비 결제 필요 — 택배 수령 + 트레이너스 도착 + 합배송 묶음 미발급(미결제).
function needsShippingFee(o: Order): boolean {
  return (
    o.pickupMethod === "DELIVERY" &&
    o.orderStatus === "TRAINERS_ARRIVED" &&
    o.shipmentGroupId == null
  );
}

function needsAnyPayment(o: Order): boolean {
  return needsPrepayment(o) || needsOvercharge(o) || needsShippingFee(o);
}

function filterOrders(orders: Order[], tab: FilterTab): Order[] {
  switch (tab) {
    case "in_progress":
      return orders.filter(
        (o) =>
          o.orderStatus !== "COMPLETED" && o.orderStatus !== "TRAINERS_ARRIVED"
      );
    case "pickup_ready":
      return orders.filter((o) => o.orderStatus === "TRAINERS_ARRIVED");
    case "completed":
      return orders.filter((o) => o.orderStatus === "COMPLETED");
    case "payment_needed":
      return orders.filter(needsAnyPayment);
    default:
      return orders;
  }
}

export function MyOrdersList({ orders }: { orders: Order[] }) {
  const [tab, setTab] = useState<FilterTab>("all");

  const filtered = useMemo(() => filterOrders(orders, tab), [orders, tab]);

  const counts = useMemo(
    () => ({
      inProgress: orders.filter(
        (o) =>
          o.orderStatus !== "COMPLETED" && o.orderStatus !== "TRAINERS_ARRIVED"
      ).length,
      pickupReady: orders.filter((o) => o.orderStatus === "TRAINERS_ARRIVED")
        .length,
      completed: orders.filter((o) => o.orderStatus === "COMPLETED").length,
    }),
    [orders]
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold">신청 내역</h1>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-card p-4 text-center">
          <p className="text-2xl font-bold text-primary">{counts.inProgress}</p>
          <p className="mt-1 text-xs text-muted-foreground">진행중</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 text-center">
          <p className="text-2xl font-bold text-success">{counts.pickupReady}</p>
          <p className="mt-1 text-xs text-muted-foreground">수령 대기</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 text-center">
          <p className="text-2xl font-bold text-muted-foreground">
            {counts.completed}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">완료</p>
        </div>
      </div>

      <div className="mt-6 -mx-4 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0">
        <div className="flex min-w-max gap-2 sm:min-w-0">
          {TABS.map((t) => {
            const isActive = tab === t.key;
            const isAccent = t.accent === "error";
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors cursor-pointer sm:px-4",
                  isAccent && "sm:ml-auto",
                  isAccent
                    ? isActive
                      ? "border-b-2 border-error text-error"
                      : "text-error/80 hover:text-error"
                    : isActive
                    ? "border-b-2 border-primary text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            주문 내역이 없습니다.
          </div>
        ) : (
          filtered.map((order) => (
            <Link
              key={order.id}
              href={`/mypage/orders/${order.id}`}
              className="block rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/50"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-bold">{order.id}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {order.gradingCompany} / {order.serviceLevel} ·{" "}
                    {new Date(order.createdAt).toLocaleDateString("ko-KR")}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-medium",
                    getStatusColor(order.orderStatus)
                  )}
                >
                  {ORDER_STATUS_LABELS[order.orderStatus]}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">
                  결제 금액: {order.prepaidAmount.toLocaleString()}원
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {needsPrepayment(order) && (
                    <span className="text-xs font-medium text-error">
                      신청 후 미결제
                    </span>
                  )}
                  {order.overchargeAmount && needsOvercharge(order) && (
                    <span className="text-xs font-medium text-error">
                      오버차지 {order.overchargeAmount.toLocaleString()}원 미결제
                    </span>
                  )}
                  {needsShippingFee(order) && (
                    <span className="text-xs font-medium text-error">
                      배송비 미결제
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
