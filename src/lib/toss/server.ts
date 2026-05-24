// 토스페이먼츠 서버 측 결제 승인 헬퍼.
//
// 결제 위젯 흐름:
//   1) 클라이언트가 토스 결제 위젯에서 결제 요청 → 토스 페이지로 리다이렉트
//   2) 사용자가 토스에서 결제 완료 → 우리 successUrl 로 paymentKey/orderId/amount 와 함께 리다이렉트
//   3) 서버가 본 헬퍼로 /v1/payments/confirm 호출 → 최종 승인
//   4) 승인 응답을 받아 DB(payments, orders) 갱신
//
// 시크릿 키는 절대 클라이언트에 노출되면 안 된다. 본 모듈은 server-only.

const TOSS_API_BASE = "https://api.tosspayments.com";

export interface ConfirmTossPaymentInput {
  paymentKey: string;
  /** 가맹점이 발급한 주문번호 (우리가 widget 에 넘긴 orderId). */
  orderId: string;
  /** 결제 금액. 위젯에 전달한 금액과 일치해야 한다. */
  amount: number;
}

export interface TossPaymentResponse {
  paymentKey: string;
  orderId: string;
  orderName?: string;
  status: string;
  totalAmount: number;
  method?: string;
  approvedAt?: string;
  receipt?: { url?: string };
  card?: { issuerCode?: string; acquirerCode?: string; number?: string };
  // 그 외 필드는 raw 로 저장만 한다.
  [key: string]: unknown;
}

export class TossConfirmError extends Error {
  code: string;
  status: number;
  raw: unknown;
  constructor(code: string, message: string, status: number, raw: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.raw = raw;
  }
}

/**
 * 토스페이먼츠 결제 승인 API 호출.
 *
 * 실패 응답(4xx/5xx) 은 TossConfirmError 로 throw.
 */
export async function confirmTossPayment(
  input: ConfirmTossPaymentInput
): Promise<TossPaymentResponse> {
  const secretKey = process.env.TOSS_SECRET_KEY;
  if (!secretKey) {
    throw new TossConfirmError(
      "TOSS_SECRET_KEY_MISSING",
      "토스 시크릿 키가 설정되지 않았습니다.",
      500,
      null
    );
  }
  // Toss 인증: "{secretKey}:" 를 Base64 → Authorization: Basic <...>
  const auth = Buffer.from(`${secretKey}:`).toString("base64");

  const res = await fetch(`${TOSS_API_BASE}/v1/payments/confirm`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      paymentKey: input.paymentKey,
      orderId: input.orderId,
      amount: input.amount,
    }),
    // 결제 confirm 은 절대 캐시되면 안 된다.
    cache: "no-store",
  });

  const body = (await res.json().catch(() => null)) as
    | (TossPaymentResponse & { code?: string; message?: string })
    | null;

  if (!res.ok) {
    throw new TossConfirmError(
      body?.code ?? "TOSS_CONFIRM_FAILED",
      body?.message ?? "토스 결제 승인에 실패했습니다.",
      res.status,
      body
    );
  }
  if (!body) {
    throw new TossConfirmError(
      "TOSS_EMPTY_RESPONSE",
      "토스 응답이 비어 있습니다.",
      res.status,
      null
    );
  }
  return body;
}

/**
 * 가맹점 측 토스 orderId 생성기 — 토스 제약: 6~64자, [A-Za-z0-9_-] 만 허용.
 *
 *   prepay-<rand10>   (신청 시 선결제)
 *   overcharge-<rand10>  (오버차지)
 *   shipping-<rand10>    (택배비)
 *
 * payment_type 식별이 가능하도록 prefix 를 붙인다.
 */
export function generateTossOrderId(
  scope: "prepay" | "overcharge" | "shipping"
): string {
  const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  return `${scope}-${rand}`;
}
