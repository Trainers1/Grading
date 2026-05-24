import Link from "next/link";
import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";

// 토스 결제 실패/취소 콜백.
// 토스 failUrl 로 code/message 가 전달되며, 위젯 마운트 시 인코딩한 orderIds 도 함께 들어온다.
//
// 주문은 PAYMENT_PENDING 으로 남아 있으므로 사용자가 마이페이지에서 다시 결제 시도 가능.
// 일정 시간이 지나면 011_auto_cancel_unpaid 크론이 자동 취소한다.

interface FailParams {
  code?: string;
  message?: string;
  orderId?: string;
  orderIds?: string;
}

export default function PaymentFailPage({
  searchParams,
}: {
  searchParams: Promise<FailParams>;
}) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-muted-foreground">
          결제 결과를 확인하는 중입니다…
        </div>
      }
    >
      <FailContent searchParams={searchParams} />
    </Suspense>
  );
}

async function FailContent({
  searchParams,
}: {
  searchParams: Promise<FailParams>;
}) {
  const sp = await searchParams;
  const code = sp.code ?? "UNKNOWN";
  const message = sp.message ?? "결제가 정상적으로 처리되지 않았습니다.";
  const orderIds = (sp.orderIds ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const retryHref =
    orderIds.length > 0
      ? `/apply/payment?orderIds=${encodeURIComponent(orderIds.join(","))}`
      : null;

  // 사용자 취소(PAY_PROCESS_CANCELED) 등은 "실패" 라기보다 안내 톤이 자연스럽다.
  const isUserCanceled =
    code === "PAY_PROCESS_CANCELED" || code === "USER_CANCEL";

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-16 text-center">
      <h1 className="text-xl font-bold">
        {isUserCanceled ? "결제가 취소되었습니다" : "결제 실패"}
      </h1>
      <p className="text-sm text-muted-foreground">{message}</p>
      <p className="text-[10px] text-muted-foreground/70">code: {code}</p>

      <div className="flex flex-wrap justify-center gap-3 pt-4">
        {retryHref && (
          <Link href={retryHref} className={buttonVariants()}>
            다시 결제하기
          </Link>
        )}
        <Link
          href="/mypage/orders"
          className={buttonVariants({ variant: "outline" })}
        >
          마이페이지로
        </Link>
      </div>

      <p className="pt-6 text-xs text-muted-foreground">
        주문은 아직 결제 대기 상태입니다. 일정 시간 결제가 진행되지 않으면
        자동으로 취소될 수 있습니다.
      </p>
    </div>
  );
}
