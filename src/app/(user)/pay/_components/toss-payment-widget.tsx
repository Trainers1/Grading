"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { loadTossPayments } from "@tosspayments/tosspayments-sdk";

interface OrderSummaryRow {
  id: string;
  label: string;
  amount: number;
  meta?: string;
}

export interface TossPaymentWidgetProps {
  clientKey: string;
  /** 회원별 고정 customerKey — 토스 통계/카드 자동선택에 사용. */
  customerKey: string;
  /** 가맹점 측 토스 주문 ID (prepay-xxx / overcharge-xxx / shipping-xxx). */
  tossOrderId: string;
  /** 우리 시스템 주문 ID 목록 (한 결제 세션에 묶을 주문들). */
  orderIds: string[];
  /** 토스 화면에 노출되는 상품명. */
  orderName: string;
  /** 결제 총액 (KRW). */
  amount: number;
  /** confirm/fail 콜백에서 어떤 결제 유형인지 식별하기 위한 값. */
  type: "prepay" | "overcharge" | "shipping";
  summary: {
    title: string;
    rows: OrderSummaryRow[];
    totalLabel: string;
  };
  /** 사용자가 선택한 결제 수단 힌트 — 위젯 진입 시 노출 영역 선택에 사용. */
  preferredMethod?: "TOSSPAY" | "EXTERNAL_PAY";
  /** 사용자 취소/돌아가기 시 이동할 경로 (기본 마이페이지). */
  backHref?: string;
  customerEmail?: string;
}

// 토스 결제 위젯 v2 — @tosspayments/tosspayments-sdk
//
// 흐름:
//   1) loadTossPayments(clientKey) → tossPayments 인스턴스
//   2) tossPayments.widgets({ customerKey }) → widgets 핸들
//   3) widgets.setAmount({ currency: "KRW", value }) → 결제 금액 세팅
//   4) renderPaymentMethods + renderAgreement
//   5) requestPayment({ orderId, orderName, successUrl, failUrl, ... })
//      → 토스 도메인으로 리다이렉트
//
// successUrl/failUrl 에 우리 type, orderIds 를 인코딩하여 콜백에서 식별.
export function TossPaymentWidget({
  clientKey,
  customerKey,
  tossOrderId,
  orderIds,
  orderName,
  amount,
  type,
  summary,
  preferredMethod,
  backHref = "/mypage/orders",
  customerEmail,
}: TossPaymentWidgetProps) {
  const [status, setStatus] = useState<
    "loading" | "ready" | "requesting" | "error"
  >("loading");
  const [error, setError] = useState<string | null>(null);
  const widgetsRef = useRef<Awaited<
    ReturnType<
      Awaited<ReturnType<typeof loadTossPayments>>["widgets"]
    >
  > | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const tossPayments = await loadTossPayments(clientKey);
        if (cancelled) return;
        const widgets = tossPayments.widgets({ customerKey });
        widgetsRef.current = widgets;

        // 결제 금액은 결제수단 렌더 이전에 세팅되어야 한다.
        await widgets.setAmount({ currency: "KRW", value: amount });

        await Promise.all([
          widgets.renderPaymentMethods({
            selector: "#toss-payment-method",
            variantKey: "DEFAULT",
          }),
          widgets.renderAgreement({
            selector: "#toss-agreement",
            variantKey: "AGREEMENT",
          }),
        ]);

        if (!cancelled) setStatus("ready");
      } catch (err) {
        console.error("[toss-widget] init failed", err);
        if (!cancelled) {
          setError(
            err instanceof Error
              ? `결제 모듈 초기화 실패: ${err.message}`
              : "결제 모듈을 불러오지 못했습니다."
          );
          setStatus("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientKey, customerKey, amount]);

  const handlePay = async () => {
    if (!widgetsRef.current) return;
    setError(null);
    setStatus("requesting");
    try {
      const orderIdsParam = encodeURIComponent(orderIds.join(","));
      const origin = window.location.origin;
      // type + orderIds 를 콜백 URL 에 실어 보낸다 — 토스가 그대로 echo 한다.
      const baseQuery = `type=${type}&orderIds=${orderIdsParam}`;
      await widgetsRef.current.requestPayment({
        orderId: tossOrderId,
        orderName,
        successUrl: `${origin}/pay/success?${baseQuery}`,
        failUrl: `${origin}/pay/fail?${baseQuery}`,
        customerEmail,
      });
      // 정상 흐름이면 토스 도메인으로 리다이렉트되므로 이 줄 이후는 실행되지 않는다.
    } catch (err) {
      console.error("[toss-widget] requestPayment failed", err);
      setError(
        err instanceof Error
          ? err.message
          : "결제 요청 중 오류가 발생했습니다."
      );
      setStatus("ready");
    }
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <h1 className="text-center text-2xl font-bold">결제</h1>
      <p className="mt-2 text-center text-sm text-muted-foreground">
        {preferredMethod === "TOSSPAY"
          ? "토스페이로 결제를 진행합니다."
          : "토스페이먼츠 결제창에서 결제를 진행합니다."}
      </p>

      <div className="mt-8 rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold">{summary.title}</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {summary.rows.map((o) => (
            <li
              key={o.id}
              className="flex items-center justify-between gap-3 border-b border-border/60 pb-2 last:border-0 last:pb-0"
            >
              <div>
                <p className="font-mono text-xs text-muted-foreground">
                  {o.id}
                </p>
                <p className="font-medium">{o.label}</p>
                {o.meta && (
                  <p className="text-xs text-muted-foreground">{o.meta}</p>
                )}
              </div>
              <span className="font-medium">
                {o.amount.toLocaleString()}원
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 border-t border-border pt-3">
          <div className="flex justify-between text-base font-bold">
            <span>{summary.totalLabel}</span>
            <span className="text-primary">
              {amount.toLocaleString()}원
            </span>
          </div>
        </div>
      </div>

      {status === "loading" && (
        <div className="mt-8 rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          결제 모듈을 불러오는 중입니다…
        </div>
      )}

      <div
        id="toss-payment-method"
        className={
          status === "ready" || status === "requesting"
            ? "mt-8"
            : "mt-8 hidden"
        }
      />
      <div
        id="toss-agreement"
        className={
          status === "ready" || status === "requesting"
            ? "mt-2"
            : "mt-2 hidden"
        }
      />

      {error && (
        <div className="mt-4 rounded-md border border-error/30 bg-error/5 p-3 text-sm text-error">
          {error}
        </div>
      )}

      {status !== "error" && (
        <Button
          className="mt-6 w-full"
          size="lg"
          onClick={handlePay}
          disabled={status !== "ready"}
        >
          {status === "loading"
            ? "준비 중..."
            : status === "requesting"
              ? "결제창으로 이동 중..."
              : `${amount.toLocaleString()}원 결제하기`}
        </Button>
      )}

      <div className="mt-6 text-center">
        <Link
          href={backHref}
          className="text-xs text-muted-foreground hover:underline"
        >
          나중에 결제하기
        </Link>
      </div>
    </div>
  );
}
