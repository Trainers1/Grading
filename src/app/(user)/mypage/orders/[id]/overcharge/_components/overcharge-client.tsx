"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RadioGroup } from "@/components/ui/radio-group";
import type { Order } from "@/types";

// 오버차지는 온라인 결제만 — 매장 방문 없이 추가 결제만 받는 단계라 ONSITE 제외.
type OnlineMethod = "TOSSPAY" | "EXTERNAL_PAY";

export function OverchargeClient({ order }: { order: Order }) {
  const router = useRouter();
  const [method, setMethod] = useState<OnlineMethod>("TOSSPAY");
  const overchargeAmount = order.overchargeAmount ?? 0;

  const handleNext = () => {
    router.push(
      `/pay?type=overcharge&orderIds=${order.id}&method=${method}`
    );
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
          onChange={(v) => setMethod(v as OnlineMethod)}
          options={[
            {
              value: "TOSSPAY",
              label: "토스페이",
              description: "토스 앱으로 간편하게 결제합니다.",
            },
            {
              value: "EXTERNAL_PAY",
              label: "외부 간편결제",
              description:
                "카드/계좌이체/카카오페이/네이버페이 등 토스페이먼츠 결제창에서 결제수단을 선택합니다.",
            },
          ]}
        />
      </div>

      <Button className="mt-6 w-full" size="lg" onClick={handleNext}>
        {`${overchargeAmount.toLocaleString()}원 결제하기`}
      </Button>
    </div>
  );
}
