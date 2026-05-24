import Link from "next/link";
import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { generateTossOrderId } from "@/lib/toss/server";
import { SHIPPING_FEE } from "@/constants/grading";
import { TossPaymentWidget } from "./_components/toss-payment-widget";

export const dynamic = "force-dynamic";

type PayType = "prepay" | "overcharge" | "shipping";

interface PayParams {
  type?: string;
  orderIds?: string;
  /** TOSSPAY | EXTERNAL_PAY — 사용자가 선택한 결제 수단 힌트. */
  method?: string;
}

// 통합 결제 라우트 — 선결제 / 오버차지 / 택배비 모두 이 한 곳에서 위젯을 띄운다.
//
// URL: /pay?type=prepay|overcharge|shipping&orderIds=A,B[&method=TOSSPAY|EXTERNAL_PAY]
//
// 보안: orderIds 소유자 검증 + 상태(payment_status/order_status) 검증 후에만 위젯 마운트.
//      위젯에 넘기는 amount 는 서버 계산값이며, success 콜백의 confirmTossPaymentAction
//      에서 한 번 더 검증한다.
export default function PayPage({
  searchParams,
}: {
  searchParams: Promise<PayParams>;
}) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-lg px-4 py-12 text-center text-sm text-muted-foreground">
          결제 정보를 불러오는 중입니다…
        </div>
      }
    >
      <PayContent searchParams={searchParams} />
    </Suspense>
  );
}

async function PayContent({
  searchParams,
}: {
  searchParams: Promise<PayParams>;
}) {
  const params = await searchParams;
  const type = parsePayType(params.type);
  if (!type) {
    return <ErrorState message="결제 유형이 지정되지 않았습니다." />;
  }
  const orderIds = (params.orderIds ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (orderIds.length === 0) {
    return <ErrorState message="주문 정보가 누락되었습니다." />;
  }

  const preferredMethod =
    params.method === "TOSSPAY" || params.method === "EXTERNAL_PAY"
      ? params.method
      : undefined;

  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return <ErrorState message="로그인이 필요합니다." backLink="/login" />;
  }

  const service = createServiceClient();
  const { data: orderRows, error: oErr } = await service
    .from("orders")
    .select(
      "id, user_id, prepaid_amount, overcharge_amount, payment_status, order_status, pickup_method, shipment_group_id, grading_company, service_level, cancelled_at"
    )
    .in("id", orderIds);

  if (oErr || !orderRows || orderRows.length !== orderIds.length) {
    return <ErrorState message="주문 정보를 조회할 수 없습니다." />;
  }

  for (const o of orderRows) {
    if (o.user_id !== auth.user.id) {
      return <ErrorState message="본인 주문만 결제할 수 있습니다." />;
    }
    if (o.cancelled_at) {
      return <ErrorState message="취소된 주문이 포함되어 있습니다." />;
    }
  }

  // type 별 상태 검증 + 금액 계산
  let amount = 0;
  let summaryTitle = "";
  let totalLabel = "";

  if (type === "prepay") {
    for (const o of orderRows) {
      if (o.payment_status === "PAID") {
        return (
          <ErrorState
            message="이미 결제 완료된 주문이 포함되어 있습니다."
            backLink={`/mypage/orders/${orderRows[0].id}`}
          />
        );
      }
      if (o.payment_status !== "PENDING") {
        return (
          <ErrorState
            message={`결제 대기 상태가 아닌 주문이 포함되어 있습니다. (${o.payment_status})`}
          />
        );
      }
      amount += o.prepaid_amount ?? 0;
    }
    summaryTitle = "주문 요약";
    totalLabel = "총 결제 금액";
  } else if (type === "overcharge") {
    for (const o of orderRows) {
      if (o.payment_status !== "OVERCHARGE_PENDING") {
        return (
          <ErrorState message="오버차지 결제 대기 상태가 아닙니다." />
        );
      }
      if (!o.overcharge_amount || o.overcharge_amount <= 0) {
        return <ErrorState message="결제할 오버차지 금액이 없습니다." />;
      }
      amount += o.overcharge_amount;
    }
    summaryTitle = "오버차지 결제";
    totalLabel = "추가 결제 금액";
  } else {
    // shipping
    for (const o of orderRows) {
      if (o.pickup_method !== "DELIVERY") {
        return (
          <ErrorState message="택배 수령이 아닌 주문이 포함되어 있습니다." />
        );
      }
      if (o.order_status !== "TRAINERS_ARRIVED") {
        return (
          <ErrorState message="아직 택배비 결제 단계가 아닌 주문이 포함되어 있습니다." />
        );
      }
      if (o.shipment_group_id) {
        return (
          <ErrorState
            message="이미 택배비가 결제된 주문이 포함되어 있습니다."
            backLink={`/mypage/orders/${orderRows[0].id}`}
          />
        );
      }
    }
    amount = SHIPPING_FEE;
    summaryTitle = "택배비 결제";
    totalLabel = `택배비${orderRows.length > 1 ? ` (합배송 ${orderRows.length}건)` : ""}`;
  }

  if (amount <= 0) {
    return <ErrorState message="결제할 금액이 없습니다." />;
  }

  // 주문 요약 rows
  const rows =
    type === "shipping"
      ? orderRows.map((o, i) => ({
          id: o.id,
          label: `${o.grading_company} / ${o.service_level}`,
          amount: i === 0 ? SHIPPING_FEE : 0,
          meta: i === 0 ? "대표 주문" : "합배송 동승",
        }))
      : orderRows.map((o) => ({
          id: o.id,
          label: `${o.grading_company} / ${o.service_level}`,
          amount:
            type === "prepay"
              ? (o.prepaid_amount ?? 0)
              : (o.overcharge_amount ?? 0),
        }));

  const orderName =
    orderRows.length === 1
      ? `트레이너스 ${typeLabel(type)} ${orderRows[0].grading_company} ${orderRows[0].service_level}`
      : `트레이너스 ${typeLabel(type)} ${orderRows.length}건`;

  const tossOrderId = generateTossOrderId(type);

  const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
  if (!clientKey) {
    return (
      <ErrorState message="결제 모듈이 초기화되지 않았습니다. 관리자에게 문의해 주세요." />
    );
  }

  const backHref =
    orderRows.length === 1
      ? `/mypage/orders/${orderRows[0].id}`
      : "/mypage/orders";

  return (
    <TossPaymentWidget
      clientKey={clientKey}
      customerKey={auth.user.id}
      tossOrderId={tossOrderId}
      orderIds={orderRows.map((o) => o.id)}
      orderName={orderName}
      amount={amount}
      type={type}
      summary={{
        title: summaryTitle,
        rows,
        totalLabel,
      }}
      preferredMethod={preferredMethod}
      backHref={backHref}
      customerEmail={auth.user.email ?? undefined}
    />
  );
}

function parsePayType(v: string | undefined): PayType | null {
  if (v === "prepay" || v === "overcharge" || v === "shipping") return v;
  return null;
}

function typeLabel(t: PayType): string {
  switch (t) {
    case "prepay":
      return "그레이딩";
    case "overcharge":
      return "오버차지";
    case "shipping":
      return "택배비";
  }
}

function ErrorState({
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
        className={buttonVariants({ variant: "outline", className: "mt-2" })}
      >
        돌아가기
      </Link>
    </div>
  );
}
