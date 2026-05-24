"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { loadTossPayments } from "@tosspayments/tosspayments-sdk";

interface OrderSummaryRow {
  id: string;
  label: string;
  cardCount: number;
  amount: number;
}

export interface TossPaymentWidgetProps {
  clientKey: string;
  /** 회원별 고정 customerKey — 토스 통계/카드 자동선택에 사용. */
  customerKey: string;
  /** 가맹점 측 토스 주문 ID (prepay-xxxxxx 형식). */
  tossOrderId: string;
  /** 우리 시스템 주문 ID 목록 (한 결제 세션에 묶을 주문들). */
  orderIds: string[];
  /** 토스 화면에 노출되는 상품명. */
  orderName: string;
  /** 결제 총액 (KRW). */
  amount: number;
  summary: {
    orders: OrderSummaryRow[];
    totalCards: number;
    totalAmount: number;
  };
  customerEmail?: string;
}

// 토스 결제 위젯 v2 — @tosspayments/tosspayments-sdk
//
// 흐름:
//   1) loadTossPayments(clientKey) → tossPayments 인스턴스
//   2) tossPayments.widgets({ customerKey }) → widgets 핸들
//   3) widgets.setAmount({ currency: "KRW", value }) → 결제 금액 세팅 (필수, 결제수단 렌더 전에)
//   4) widgets.renderPaymentMethods({ selector, variantKey: "DEFAULT" })
//      widgets.renderAgreement({ selector, variantKey: "AGREEMENT" })
//   5) requestPayment({ orderId, orderName, successUrl, failUrl, ... })
//      → 토스 결제 페이지로 리다이렉트
//
// successUrl 에 우리 orderIds 를 인코딩하여, 콜백에서 어떤 주문을 PAID 처리할지 식별한다.
export function TossPaymentWidget({
  clientKey,
  customerKey,
  tossOrderId,
  orderIds,
  orderName,
  amount,
  summary,
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
      await widgetsRef.current.requestPayment({
        orderId: tossOrderId,
        orderName,
        // success/fail 모두 동일한 orderIds 컨텍스트를 넘긴다.
        successUrl: `${origin}/apply/payment/success?orderIds=${orderIdsParam}`,
        failUrl: `${origin}/apply/payment/fail?orderIds=${orderIdsParam}`,
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
        토스페이먼츠로 결제를 진행합니다.
      </p>

      <div className="mt-8 rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold">주문 요약</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {summary.orders.map((o) => (
            <li
              key={o.id}
              className="flex items-center justify-between gap-3 border-b border-border/60 pb-2 last:border-0 last:pb-0"
            >
              <div>
                <p className="font-mono text-xs text-muted-foreground">
                  {o.id}
                </p>
                <p className="font-medium">{o.label}</p>
                <p className="text-xs text-muted-foreground">
                  카드 {o.cardCount}장
                </p>
              </div>
              <span className="font-medium">
                {o.amount.toLocaleString()}원
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 border-t border-border pt-3">
          <div className="flex justify-between text-base font-bold">
            <span>
              총 결제 금액
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                (카드 {summary.totalCards}장)
              </span>
            </span>
            <span className="text-primary">
              {summary.totalAmount.toLocaleString()}원
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

      <p className="mt-4 text-center text-xs text-muted-foreground">
        결제 완료 후 매장 방문 또는 택배 등의 방법으로 카드를 전달해 주세요.
      </p>

      <div className="mt-6 text-center">
        <Link
          href="/mypage/orders"
          className="text-xs text-muted-foreground hover:underline"
        >
          나중에 결제하기 (마이페이지로)
        </Link>
      </div>
    </div>
  );
}
