import Link from "next/link";
import { Suspense } from "react";
import { getMyOrderById } from "@/lib/orders/queries";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { generateTossOrderId } from "@/lib/toss/server";
import { TossPaymentWidget } from "./_components/toss-payment-widget";

export const dynamic = "force-dynamic";

// 신청 직후 토스 결제 위젯이 마운트되는 페이지.
// 단수 orderId / 복수 orderIds 모두 지원 — 마이페이지 "결제하기" 진입도 동일 경로.
//
// 보안: 위젯에 넘기는 amount 는 서버에서 다시 계산. 클라이언트 변조 가능성이 있으나
// 최종 confirm 시점에 서버가 prepaid_amount 합계와 토스 amount 를 재검증.

export default function PaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string; orderIds?: string }>;
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
  searchParams: Promise<{ orderId?: string; orderIds?: string }>;
}) {
  const params = await searchParams;
  // 단수/복수 모두 허용 — 단수는 orderIds=A 와 동일하게 취급.
  const idList = (params.orderIds ?? params.orderId ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (idList.length === 0) {
    return <PaymentErrorState message="주문 정보가 누락되었습니다." />;
  }

  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return (
      <PaymentErrorState message="로그인이 필요합니다." backLink="/login" />
    );
  }

  // 마이페이지에서 단일 주문으로 진입한 경우는 getMyOrderById 로 간단히.
  // 그 외(신청 직후 복수 주문)는 service-role 로 일괄 조회 + 본인 소유 검증.
  type OrderSummary = {
    id: string;
    prepaidAmount: number;
    gradingCompany: string;
    serviceLevel: string;
    cardCount: number;
  };
  let orders: OrderSummary[] = [];

  if (idList.length === 1) {
    const r = await getMyOrderById(idList[0]);
    if (!r) {
      return (
        <PaymentErrorState message="결제할 주문을 찾을 수 없습니다. 마이페이지에서 다시 시도해 주세요." />
      );
    }
    if (r.order.cancelledAt) {
      return <PaymentErrorState message="취소된 주문은 결제할 수 없습니다." />;
    }
    if (r.order.paymentStatus === "PAID") {
      return (
        <PaymentErrorState
          message="이미 결제 완료된 주문입니다."
          backLink={`/mypage/orders/${r.order.id}`}
        />
      );
    }
    if (r.order.paymentStatus !== "PENDING") {
      return (
        <PaymentErrorState
          message={`현재 결제 상태(${r.order.paymentStatus})에서는 결제를 진행할 수 없습니다.`}
          backLink={`/mypage/orders/${r.order.id}`}
        />
      );
    }
    orders = [
      {
        id: r.order.id,
        prepaidAmount: r.order.prepaidAmount,
        gradingCompany: r.order.gradingCompany,
        serviceLevel: r.order.serviceLevel,
        cardCount: r.cards.length,
      },
    ];
  } else {
    const service = createServiceClient();
    const { data: orderRows, error: oErr } = await service
      .from("orders")
      .select(
        "id, user_id, prepaid_amount, payment_status, cancelled_at, grading_company, service_level"
      )
      .in("id", idList);
    if (oErr || !orderRows || orderRows.length !== idList.length) {
      return <PaymentErrorState message="주문 정보를 조회할 수 없습니다." />;
    }
    for (const o of orderRows) {
      if (o.user_id !== auth.user.id) {
        return (
          <PaymentErrorState message="본인 주문만 결제할 수 있습니다." />
        );
      }
      if (o.cancelled_at) {
        return (
          <PaymentErrorState message="취소된 주문이 포함되어 있습니다." />
        );
      }
      if (o.payment_status !== "PENDING") {
        return (
          <PaymentErrorState
            message={`결제 대기 상태가 아닌 주문이 포함되어 있습니다. (${o.payment_status})`}
          />
        );
      }
    }
    const { data: cardRows } = await service
      .from("cards")
      .select("order_id")
      .in("order_id", idList);
    const cardCounts = new Map<string, number>();
    for (const c of cardRows ?? []) {
      cardCounts.set(c.order_id, (cardCounts.get(c.order_id) ?? 0) + 1);
    }
    orders = orderRows.map((o) => ({
      id: o.id,
      prepaidAmount: o.prepaid_amount,
      gradingCompany: o.grading_company,
      serviceLevel: o.service_level,
      cardCount: cardCounts.get(o.id) ?? 0,
    }));
  }

  const totalAmount = orders.reduce((s, o) => s + o.prepaidAmount, 0);
  const totalCards = orders.reduce((s, o) => s + o.cardCount, 0);

  // 가맹점 측 tossOrderId 발급 — 위젯 마운트 시 1회 생성하여 success/fail 경로에서 그대로 사용.
  // 페이지 새로고침 시 새 ID 가 발급되지만, 결제 미완료 상태라면 동일 주문에 다른 tossOrderId 로
  // 다시 시도해도 무방하다 (confirm 단계에서 amount 검증).
  const tossOrderId = generateTossOrderId("prepay");

  // 주문 요약 텍스트 — 토스 위젯에 표시될 orderName 으로 사용.
  const orderName =
    orders.length === 1
      ? `트레이너스 그레이딩 ${orders[0].gradingCompany} ${orders[0].serviceLevel}`
      : `트레이너스 그레이딩 ${orders.length}건 (${totalCards}장)`;

  const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
  if (!clientKey) {
    return (
      <PaymentErrorState message="결제 모듈이 초기화되지 않았습니다. 관리자에게 문의해 주세요." />
    );
  }

  return (
    <TossPaymentWidget
      clientKey={clientKey}
      customerKey={auth.user.id}
      tossOrderId={tossOrderId}
      orderIds={orders.map((o) => o.id)}
      orderName={orderName}
      amount={totalAmount}
      summary={{
        orders: orders.map((o) => ({
          id: o.id,
          label: `${o.gradingCompany} / ${o.serviceLevel}`,
          cardCount: o.cardCount,
          amount: o.prepaidAmount,
        })),
        totalCards,
        totalAmount,
      }}
      customerEmail={auth.user.email ?? undefined}
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
