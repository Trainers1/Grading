"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RadioGroup } from "@/components/ui/radio-group";
import { payOrderPrepaymentAction, type PaymentMethodChoice } from "@/lib/orders/actions";
import { TOSS_PAYMENT_STUB_DESCRIPTION } from "@/constants/grading";

export function PaymentForm({
  orderId,
  amount,
  gradingCompany,
  serviceLevel,
  cardCount,
}: {
  orderId: string;
  amount: number;
  gradingCompany: string;
  serviceLevel: string;
  cardCount: number;
}) {
  const router = useRouter();
  const [method, setMethod] = useState<PaymentMethodChoice>("ONSITE");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await payOrderPrepaymentAction({ orderId, method });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/apply/complete?orderIds=${orderId}`);
    });
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <h1 className="text-2xl font-bold text-center">결제</h1>
      <p className="mt-2 text-center text-sm text-muted-foreground">
        주문 내용을 확인하고 결제를 진행해 주세요.
      </p>

      <div className="mt-8 rounded-xl border border-border bg-card p-6 space-y-4">
        <h2 className="font-semibold">주문 요약</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">주문번호</span>
            <span className="font-mono font-medium">{orderId}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">등급회사</span>
            <span className="font-medium">{gradingCompany}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">서비스 등급</span>
            <span className="font-medium">{serviceLevel}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">카드 수량</span>
            <span className="font-medium">{cardCount}장</span>
          </div>
          <div className="border-t border-border pt-3">
            <div className="flex justify-between text-base font-bold">
              <span>총 결제 금액</span>
              <span className="text-primary">
                {amount.toLocaleString()}원
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 font-semibold">결제 수단 선택</h2>
        <RadioGroup
          name={`pay-method-${orderId}`}
          value={method}
          onChange={(v) => setMethod(v as PaymentMethodChoice)}
          options={[
            {
              value: "ONSITE",
              label: "현장결제",
              description:
                "트레이너스 매장에서 카드 전달 시 직접 결제합니다. 결제 처리 즉시 \"결제 완료\" 단계로 이동하고, 매장 방문 시 정산됩니다.",
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
        onClick={submit}
        disabled={isPending}
      >
        {isPending
          ? "결제 처리 중..."
          : `${amount.toLocaleString()}원 결제하기`}
      </Button>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        결제 완료 후 매장 방문 또는 택배 등의 방법으로 카드를 전달해 주세요.
      </p>
    </div>
  );
}
