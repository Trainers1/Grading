import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button";
import { confirmApplyPrepaymentAction } from "@/lib/orders/actions";

export const dynamic = "force-dynamic";

// 토스 결제 성공 콜백.
// 토스 successUrl 로 paymentKey/orderId/amount 가 query 로 전달되고,
// 위젯 마운트 단계에서 우리가 인코딩해 둔 orderIds 도 함께 들어온다.
//
// 이 페이지는 서버 컴포넌트로 confirmApplyPrepaymentAction 을 호출하여
// 결제 승인 + DB 갱신을 수행한 뒤, 성공이면 마이페이지로 redirect 한다.
//
// 사용자가 이 URL 을 새로고침해도 confirmApplyPrepaymentAction 은 (paymentKey, order_id)
// UNIQUE 인덱스로 중복 처리 방어되어 있어 안전.

interface SuccessParams {
  paymentKey?: string;
  orderId?: string; // 토스 측 orderId (우리가 발급한 tossOrderId)
  amount?: string;
  orderIds?: string; // 우리 시스템 orderIds (콤마 구분)
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
  const paymentKey = sp.paymentKey ?? "";
  const tossOrderId = sp.orderId ?? "";
  const amountNum = Number(sp.amount ?? "0");
  const orderIds = (sp.orderIds ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!paymentKey || !tossOrderId || !amountNum || orderIds.length === 0) {
    return (
      <ErrorState
        title="결제 정보 누락"
        message="결제 콜백 정보가 올바르지 않습니다. 결제는 완료되었을 수 있으니 마이페이지에서 결제 상태를 확인해 주세요."
      />
    );
  }

  const result = await confirmApplyPrepaymentAction({
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

  // 성공 — 마이페이지로 즉시 이동.
  redirect(`/mypage/orders?paid=${result.orderIds.join(",")}`);
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
