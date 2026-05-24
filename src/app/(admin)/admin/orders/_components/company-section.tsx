"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
} from "@/constants/grading";
import {
  bulkCancelOrdersAction,
  bulkUpdateOrderStatusAction,
} from "@/lib/orders/admin-actions";
import type { Card, Order, OrderStatus } from "@/types";

const STATUS_OPTIONS: OrderStatus[] = [
  "PAYMENT_PENDING",
  "CARD_DELIVERY_PENDING",
  "CARD_RECEIVED",
  "SHIPPED_OUT",
  "DISTRIBUTOR_SHIPPED",
  "GRADE_CONFIRMED",
  "TRAINERS_ARRIVED",
  "COMPLETED",
];

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

type Mode = "status" | "cancel";

export function CompanySection({
  companyLabel,
  companyDescription,
  orders,
  cards,
  canCancel,
}: {
  companyLabel: string;
  companyDescription: string;
  orders: Order[];
  cards: Card[];
  canCancel: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode>("status");
  const [nextStatus, setNextStatus] = useState<OrderStatus>("CARD_RECEIVED");
  const [reason, setReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const orderById = useMemo(() => {
    const m = new Map<string, Order>();
    for (const o of orders) m.set(o.id, o);
    return m;
  }, [orders]);

  // 카드 → 주문 매핑이 살아있는 카드만 사용
  const visibleCards = useMemo(
    () => cards.filter((c) => orderById.has(c.orderId)),
    [cards, orderById]
  );

  const allCardIds = useMemo(
    () => visibleCards.map((c) => c.id),
    [visibleCards]
  );
  const isAllSelected =
    allCardIds.length > 0 && selected.size === allCardIds.length;
  const isSomeSelected = selected.size > 0 && !isAllSelected;

  const selectedOrderIds = useMemo(() => {
    const ids = new Set<string>();
    for (const card of visibleCards) {
      if (selected.has(card.id)) ids.add(card.orderId);
    }
    return Array.from(ids);
  }, [selected, visibleCards]);

  const toggleAll = () => {
    if (isAllSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allCardIds));
    }
  };

  const toggleOne = (cardId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  };

  const resetMessages = () => {
    setError(null);
    setNotice(null);
  };

  const handleApply = () => {
    if (selectedOrderIds.length === 0) {
      setError("카드를 1장 이상 선택해 주세요.");
      return;
    }
    resetMessages();
    startTransition(async () => {
      const result = await bulkUpdateOrderStatusAction({
        orderIds: selectedOrderIds,
        newStatus: nextStatus,
        reason: reason.trim() || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(
        `${result.updatedCount}건 주문 상태를 "${ORDER_STATUS_LABELS[nextStatus]}"(으)로 변경했습니다.`
      );
      setSelected(new Set());
      setReason("");
      router.refresh();
    });
  };

  const handleCancel = () => {
    if (selectedOrderIds.length === 0) {
      setError("카드를 1장 이상 선택해 주세요.");
      return;
    }
    if (!cancelReason.trim()) {
      setError("취소 사유를 입력해 주세요.");
      return;
    }
    const ok = window.confirm(
      `선택한 카드가 속한 ${selectedOrderIds.length}건의 주문을 일괄 취소하시겠습니까?\n이미 취소된 주문은 그대로 유지됩니다.`
    );
    if (!ok) return;
    resetMessages();
    startTransition(async () => {
      const result = await bulkCancelOrdersAction({
        orderIds: selectedOrderIds,
        reason: cancelReason.trim(),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(`${result.cancelledCount}건 주문을 취소했습니다.`);
      setSelected(new Set());
      setCancelReason("");
      router.refresh();
    });
  };

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border bg-muted/20 px-5 py-3">
        <div>
          <h2 className="text-base font-semibold">{companyLabel}</h2>
          <p className="text-xs text-muted-foreground">{companyDescription}</p>
        </div>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          주문 {orders.length}건 · 카드 {visibleCards.length}장
        </span>
      </header>

      {visibleCards.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-muted-foreground">
          해당 그레이딩사 카드가 없습니다.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3 border-b border-border bg-muted/10 px-5 py-3">
            <div className="flex flex-col">
              <label className="text-xs font-medium text-muted-foreground">
                일괄 작업
              </label>
              <div className="mt-1 flex rounded-md border border-border bg-background p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setMode("status");
                    resetMessages();
                  }}
                  disabled={isPending}
                  className={`rounded px-3 py-1.5 font-medium transition-colors ${
                    mode === "status"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  상태 변경
                </button>
                {canCancel && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode("cancel");
                      resetMessages();
                    }}
                    disabled={isPending}
                    className={`rounded px-3 py-1.5 font-medium transition-colors ${
                      mode === "cancel"
                        ? "bg-error text-white"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    주문 취소
                  </button>
                )}
              </div>
            </div>

            {mode === "status" ? (
              <>
                <div className="flex flex-col">
                  <label className="text-xs font-medium text-muted-foreground">
                    선택한 카드의 주문 상태
                  </label>
                  <select
                    value={nextStatus}
                    onChange={(e) =>
                      setNextStatus(e.target.value as OrderStatus)
                    }
                    disabled={isPending}
                    className="mt-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {ORDER_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex min-w-[200px] flex-1 flex-col">
                  <label className="text-xs font-medium text-muted-foreground">
                    변경 사유 (선택)
                  </label>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="내부 메모 (고객 비노출)"
                    disabled={isPending}
                    className="mt-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <span className="text-xs text-muted-foreground">
                    카드 {selected.size}장 / 주문 {selectedOrderIds.length}건
                  </span>
                  <button
                    type="button"
                    onClick={handleApply}
                    disabled={isPending || selectedOrderIds.length === 0}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isPending ? "변경 중..." : "상태 변경"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex min-w-[240px] flex-1 flex-col">
                  <label className="text-xs font-medium text-error">
                    취소 사유 *
                  </label>
                  <input
                    type="text"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="고객 요청 / 결제 미완료 / 카드 미도착 등"
                    disabled={isPending}
                    className="mt-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <span className="text-xs text-muted-foreground">
                    카드 {selected.size}장 / 주문 {selectedOrderIds.length}건
                  </span>
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={
                      isPending ||
                      selectedOrderIds.length === 0 ||
                      !cancelReason.trim()
                    }
                    className="rounded-md bg-error px-4 py-2 text-sm font-medium text-white hover:bg-error/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isPending ? "취소 처리 중..." : "일괄 취소"}
                  </button>
                </div>
              </>
            )}
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
            <thead className="bg-muted/10 text-left text-xs uppercase text-muted-foreground">
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
                    disabled={isPending}
                  />
                </th>
                <th className="px-3 py-3">카드 정보</th>
                <th className="px-3 py-3">주문번호</th>
                <th className="px-3 py-3">고객</th>
                <th className="px-3 py-3">서비스</th>
                <th className="px-3 py-3">주문상태</th>
                <th className="px-3 py-3">결제상태</th>
                <th className="px-3 py-3">금액</th>
                <th className="px-3 py-3">접수일</th>
              </tr>
            </thead>
            <tbody>
              {visibleCards.map((card) => {
                const order = orderById.get(card.orderId);
                if (!order) return null;
                const checked = selected.has(card.id);
                return (
                  <tr
                    key={card.id}
                    className={`border-t border-border hover:bg-muted/20 ${
                      checked ? "bg-primary/5" : ""
                    }`}
                  >
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        aria-label={`카드 ${card.id.slice(0, 8)} 선택`}
                        checked={checked}
                        onChange={() => toggleOne(card.id)}
                        disabled={isPending}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-medium">
                        {[card.englishName, card.setName, card.cardNumber]
                          .filter(Boolean)
                          .join(" · ") || "정보 미입력"}
                      </div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        ID: {card.id.slice(0, 8)}
                      </div>
                    </td>
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
                      {order.serviceLevel}
                    </td>
                    <td className="px-3 py-3">
                      {ORDER_STATUS_LABELS[order.orderStatus]}
                    </td>
                    <td className="px-3 py-3">
                      {PAYMENT_STATUS_LABELS[order.paymentStatus]}
                    </td>
                    <td className="px-3 py-3">
                      {formatCurrency(
                        order.prepaidAmount + (order.overchargeAmount ?? 0)
                      )}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {formatDate(order.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
