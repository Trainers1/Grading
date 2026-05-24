"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RadioGroup } from "@/components/ui/radio-group";
import {
  payOrderOverchargeAction,
  type PaymentMethodChoice,
} from "@/lib/orders/actions";
import { TOSS_PAYMENT_STUB_DESCRIPTION } from "@/constants/grading";
import type { Order } from "@/types";

export function OverchargeClient({ order }: { order: Order }) {
  const router = useRouter();
  const [method, setMethod] = useState<PaymentMethodChoice>("ONSITE");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const overchargeAmount = order.overchargeAmount ?? 0;

  const handlePayment = () => {
    setError(null);
    startTransition(async () => {
      const result = await payOrderOverchargeAction({
        orderId: order.id,
        method,
      });
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

      <h1 className="mt-4 text-2xl font-bold">오버차지 결제</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        추가 결제를 완료해야 카드를 수령할 수 있습니다.
      </p>

      <div className="mt-8 rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">주문번호</span>
            <span className="font-medium font-mono">{order.id}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">기존 결제 금액</span>
            <span className="font-medium">
              {order.prepaidAmount.toLocaleString()}원
            </span>
          </div>
          <div className="border-t border-border pt-3">
            <div className="flex justify-between text-base font-bold">
              <span>추가 결제 금액</span>
              <span className="text-error">
                {overchargeAmount.toLocaleString()}원
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 font-semibold">결제 수단 선택</h2>
        <RadioGroup
          name={`overcharge-method-${order.id}`}
          value={method}
          onChange={(v) => setMethod(v as PaymentMethodChoice)}
          options={[
            {
              value: "ONSITE",
              label: "현장결제",
              description:
                "트레이너스 매장에서 카드 수령 시 직접 결제합니다. 결제 처리 즉시 다음 단계로 이동합니다.",
            },
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
          : `${overchargeAmount.toLocaleString()}원 결제하기`}
      </Button>
    </div>
  );
}
