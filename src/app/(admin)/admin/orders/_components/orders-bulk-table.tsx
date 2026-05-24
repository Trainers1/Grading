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
import type { Order, OrderStatus } from "@/types";

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

export function OrdersBulkTable({
  orders,
  canCancel,
}: {
  orders: Order[];
  canCancel: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode>("status");
  const [nextStatus, setNextStatus] = useState<OrderStatus>("CARD_RECEIVED");
  const [statusReason, setStatusReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const allIds = useMemo(() => orders.map((o) => o.id), [orders]);
  const isAllSelected =
    allIds.length > 0 && selected.size === allIds.length;
  const isSomeSelected = selected.size > 0 && !isAllSelected;

  const selectedIds = useMemo(() => Array.from(selected), [selected]);

  const toggleAll = () => {
    if (isAllSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allIds));
    }
  };

  const toggleOne = (orderId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const resetMessages = () => {
    setError(null);
    setNotice(null);
  };

  const handleStatusApply = () => {
    if (selectedIds.length === 0) {
      setError("주문을 1건 이상 선택해 주세요.");
      return;
    }
    resetMessages();
    startTransition(async () => {
      const result = await bulkUpdateOrderStatusAction({
        orderIds: selectedIds,
        newStatus: nextStatus,
        reason: statusReason.trim() || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(
        `${result.updatedCount}건 주문 상태를 "${ORDER_STATUS_LABELS[nextStatus]}"(으)로 변경했습니다.`
      );
      setSelected(new Set());
      setStatusReason("");
      router.refresh();
    });
  };

  const handleCancelApply = () => {
    if (selectedIds.length === 0) {
      setError("주문을 1건 이상 선택해 주세요.");
      return;
    }
    if (!cancelReason.trim()) {
      setError("취소 사유를 입력해 주세요.");
      return;
    }
    const ok = window.confirm(
      `선택한 ${selectedIds.length}건의 주문을 일괄 취소하시겠습니까?\n이미 취소된 주문은 그대로 유지됩니다.`
    );
    if (!ok) return;
    resetMessages();
    startTransition(async () => {
      const result = await bulkCancelOrdersAction({
        orderIds: selectedIds,
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
    <div className="overflow-hidden rounded-xl border border-border bg-card">
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
                다음 상태
              </label>
              <select
                value={nextStatus}
                onChange={(e) => setNextStatus(e.target.value as OrderStatus)}
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
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                placeholder="내부 메모 (고객 비노출)"
                disabled={isPending}
                className="mt-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="flex items-end gap-2">
              <span className="text-xs text-muted-foreground">
                선택 {selectedIds.length}건
              </span>
              <button
                type="button"
                onClick={handleStatusApply}
                disabled={isPending || selectedIds.length === 0}
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
                선택 {selectedIds.length}건
              </span>
              <button
                type="button"
                onClick={handleCancelApply}
                disabled={
                  isPending ||
                  selectedIds.length === 0 ||
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
                disabled={isPending || orders.length === 0}
              />
            </th>
            <th className="px-3 py-3">주문번호</th>
            <th className="px-3 py-3">이름</th>
            <th className="px-3 py-3">회사</th>
            <th className="px-3 py-3">서비스</th>
            <th className="px-3 py-3">주문상태</th>
            <th className="px-3 py-3">결제상태</th>
            <th className="px-3 py-3">금액</th>
            <th className="px-3 py-3">접수일</th>
          </tr>
        </thead>
        <tbody>
          {orders.length === 0 ? (
            <tr>
              <td
                colSpan={9}
                className="px-5 py-10 text-center text-muted-foreground"
              >
                조건에 맞는 주문이 없습니다.
              </td>
            </tr>
          ) : (
            orders.map((o) => {
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
                    {ORDER_STATUS_LABELS[o.orderStatus]}
                  </td>
                  <td className="px-3 py-3">
                    {PAYMENT_STATUS_LABELS[o.paymentStatus]}
                  </td>
                  <td className="px-3 py-3">
                    {formatCurrency(
                      o.prepaidAmount + (o.overchargeAmount ?? 0)
                    )}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {formatDate(o.createdAt)}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
