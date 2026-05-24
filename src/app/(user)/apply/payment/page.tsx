import Link from "next/link";
import { Suspense } from "react";
import { getMyOrderById } from "@/lib/orders/queries";
import { PaymentForm } from "./_components/payment-form";

export const dynamic = "force-dynamic";

export default function PaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-lg px-4 py-12 text-center text-sm text-muted-foreground">
          결제 정보를 불러오는 중입니다…
        </div>
      }
    >
      <PaymentContent searchParams={searchParams} />
    </Suspense>
  );
}

async function PaymentContent({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string }>;
}) {
  const { orderId } = await searchParams;
  if (!orderId) {
    return <PaymentErrorState message="주문 정보가 누락되었습니다." />;
  }

  const result = await getMyOrderById(orderId);
  if (!result) {
    return (
      <PaymentErrorState message="결제할 주문을 찾을 수 없습니다. 마이페이지에서 다시 시도해 주세요." />
    );
  }

  const { order, cards } = result;

  if (order.cancelledAt) {
    return <PaymentErrorState message="취소된 주문은 결제할 수 없습니다." />;
  }
  if (order.paymentStatus === "PAID") {
    return (
      <PaymentErrorState
        message="이미 결제 완료된 주문입니다."
        backLink={`/mypage/orders/${order.id}`}
      />
    );
  }
  if (order.paymentStatus !== "PENDING") {
    return (
      <PaymentErrorState
        message={`현재 결제 상태(${order.paymentStatus})에서는 선결제를 진행할 수 없습니다.`}
        backLink={`/mypage/orders/${order.id}`}
      />
    );
  }

  return (
    <PaymentForm
      orderId={order.id}
      amount={order.prepaidAmount}
      gradingCompany={order.gradingCompany}
      serviceLevel={order.serviceLevel}
      cardCount={cards.length}
    />
  );
}

function PaymentErrorState({
  message,
  backLink = "/mypage/orders",
}: {
  message: string;
  backLink?: string;
}) {
  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-12 text-center">
      <h1 className="text-xl font-bold">결제 진행 불가</h1>
      <p className="text-sm text-muted-foreground">{message}</p>
      <Link
        href={backLink}
        className="inline-block rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/40"
      >
        돌아가기
      </Link>
    </div>
  );
}
