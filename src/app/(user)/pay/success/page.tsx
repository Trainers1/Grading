import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button";
import {
  confirmTossPaymentAction,
  type TossPaymentType,
} from "@/lib/orders/actions";

export const dynamic = "force-dynamic";

// 토스 결제 성공 콜백 (3가지 type 공용).
// successUrl 에서 우리가 인코딩한 type/orderIds + 토스가 echo 한 paymentKey/orderId/amount 수신.

interface SuccessParams {
  type?: string;
  paymentKey?: string;
  orderId?: string; // 토스 측 orderId
  amount?: string;
  orderIds?: string;
}

export default function PaymentSuccessPage({
  searchParams,
}: {
  searchParams: Promise<SuccessParams>;
}) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-muted-foreground">
          결제 승인 처리 중입니다…
        </div>
      }
    >
      <SuccessContent searchParams={searchParams} />
    </Suspense>
  );
}

async function SuccessContent({
  searchParams,
}: {
  searchParams: Promise<SuccessParams>;
}) {
  const sp = await searchParams;
  const type = parseType(sp.type);
  const paymentKey = sp.paymentKey ?? "";
  const tossOrderId = sp.orderId ?? "";
  const amountNum = Number(sp.amount ?? "0");
  const orderIds = (sp.orderIds ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (
    !type ||
    !paymentKey ||
    !tossOrderId ||
    !amountNum ||
    orderIds.length === 0
  ) {
    return (
      <ErrorState
        title="결제 정보 누락"
        message="결제 콜백 정보가 올바르지 않습니다. 결제는 완료되었을 수 있으니 마이페이지에서 결제 상태를 확인해 주세요."
      />
    );
  }

  const result = await confirmTossPaymentAction({
    type,
    orderIds,
    paymentKey,
    tossOrderId,
    amount: amountNum,
  });

  if (!result.ok) {
    return (
      <ErrorState
        title="결제 승인 실패"
        message={result.error}
        meta={`paymentKey: ${paymentKey}`}
      />
    );
  }

  // 성공 — type 별 적절한 화면으로 이동.
  const target =
    type === "shipping" || result.orderIds.length > 1
      ? `/mypage/orders?paid=${result.orderIds.join(",")}`
      : `/mypage/orders/${result.orderIds[0]}`;
  redirect(target);
}

function parseType(v: string | undefined): TossPaymentType | null {
  if (v === "prepay" || v === "overcharge" || v === "shipping") return v;
  return null;
}

function ErrorState({
  title,
  message,
  meta,
}: {
  title: string;
  message: string;
  meta?: string;
}) {
  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-16 text-center">
      <h1 className="text-xl font-bold text-error">{title}</h1>
      <p className="text-sm text-muted-foreground">{message}</p>
      {meta && (
        <p className="text-[10px] text-muted-foreground/70">{meta}</p>
      )}
      <div className="flex justify-center gap-3 pt-2">
        <Link
          href="/mypage/orders"
          className={buttonVariants({ variant: "outline" })}
        >
          마이페이지로
        </Link>
      </div>
    </div>
  );
}
