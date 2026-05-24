"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RadioGroup } from "@/components/ui/radio-group";
import {
  payShippingFeeAction,
  type PaymentMethodChoice,
} from "@/lib/orders/actions";
import { SHIPPING_FEE, TOSS_PAYMENT_STUB_DESCRIPTION } from "@/constants/grading";
import {
  formatFullAddress,
  resolveOrderShippingAddress,
  type ProfileAddress,
} from "@/lib/address";
import type { Order } from "@/types";

// 택배비 결제 — 택배 수령 주문이므로 현장결제(ONSITE)는 제외, 온라인 수단만 노출.
// 합배송: 배송지가 같은 다른 트레이너스 도착 주문을 함께 선택하면 한 번에 결제된다.
// 택배비는 묶음 수와 무관하게 3,000원 고정.
export function ShippingClient({
  order,
  combinableOrders,
  profileAddress,
}: {
  order: Order;
  combinableOrders: Order[];
  /** 회원 정보의 최신 주소 — addressSource='MY' 주문 표시 시 사용. */
  profileAddress: ProfileAddress | null;
}) {
  const router = useRouter();
  const [method, setMethod] = useState<PaymentMethodChoice>("CARD");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 현재 주문은 항상 포함, 선택된 합배송 주문을 추가.
  const orderIds = useMemo(
    () => [
      order.id,
      ...combinableOrders
        .filter((o) => selectedIds.has(o.id))
        .map((o) => o.id),
    ],
    [order.id, combinableOrders, selectedIds]
  );

  const handlePayment = () => {
    setError(null);
    startTransition(async () => {
      const result = await payShippingFeeAction({ orderIds, method });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/mypage/orders/${order.id}`);
      router.refresh();
    });
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <Link
        href={`/mypage/orders/${order.id}`}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← 주문 상세로
      </Link>

      <h1 className="mt-4 text-2xl font-bold">택배비 결제</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        택배비 결제를 완료하면 카드 발송이 진행됩니다.
      </p>

      <div className="mt-8 rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex justify-between gap-6 text-sm">
          <span className="text-muted-foreground">배송지</span>
          <span className="text-right font-medium">
            {formatFullAddress(
              resolveOrderShippingAddress(order, profileAddress),
              "-"
            )}
            {order.addressSource === "MY" && (
              <span className="ml-1 text-[10px] text-primary">(내 주소)</span>
            )}
          </span>
        </div>

        <div className="border-t border-border pt-4">
          <h2 className="text-sm font-semibold">발송 주문</h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            <li className="flex items-center justify-between gap-3">
              <span className="font-mono">{order.id}</span>
              <span className="text-xs text-muted-foreground">
                {order.gradingCompany} · 현재 주문
              </span>
            </li>
          </ul>
        </div>

        {combinableOrders.length > 0 && (
          <div className="border-t border-border pt-4">
            <h2 className="text-sm font-semibold">합배송으로 함께 보내기</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              배송지가 같은 다른 주문을 함께 선택하면 한 번에 발송되며,
              택배비는 {SHIPPING_FEE.toLocaleString()}원으로 동일합니다.
            </p>
            <ul className="mt-3 space-y-2">
              {combinableOrders.map((o) => (
                <li key={o.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2 text-sm hover:border-primary">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(o.id)}
                      onChange={() => toggle(o.id)}
                      disabled={isPending}
                      className="h-4 w-4"
                    />
                    <span className="font-mono">{o.id}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {o.gradingCompany}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="border-t border-border pt-4">
          <div className="flex justify-between text-base font-bold">
            <span>
              택배비
              {orderIds.length > 1 && (
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  (합배송 {orderIds.length}건)
                </span>
              )}
            </span>
            <span className="text-error">
              {SHIPPING_FEE.toLocaleString()}원
            </span>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 font-semibold">결제 수단 선택</h2>
        <RadioGroup
          name={`shipping-method-${order.id}`}
          value={method}
          onChange={(v) => setMethod(v as PaymentMethodChoice)}
          options={[
            {
              value: "CARD",
              label: "신용카드 (토스페이먼츠)",
              description: TOSS_PAYMENT_STUB_DESCRIPTION,
            },
            {
              value: "TRANSFER",
              label: "계좌이체 (토스페이먼츠)",
              description: TOSS_PAYMENT_STUB_DESCRIPTION,
            },
            {
              value: "EASY_PAY",
              label: "간편결제 (토스페이먼츠)",
              description: TOSS_PAYMENT_STUB_DESCRIPTION,
            },
          ]}
        />
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-error/30 bg-error/5 p-3 text-sm text-error">
          {error}
        </div>
      )}

      <Button
        className="mt-6 w-full"
        size="lg"
        onClick={handlePayment}
        disabled={isPending}
      >
        {isPending
          ? "결제 처리 중..."
          : `${SHIPPING_FEE.toLocaleString()}원 결제하기`}
      </Button>
    </div>
  );
}
