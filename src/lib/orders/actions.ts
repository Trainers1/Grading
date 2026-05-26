"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { SHIPPING_FEE } from "@/constants/grading";
import {
  resolveOrderShippingAddress,
  type ProfileAddress,
} from "@/lib/address";
import { confirmTossPayment, TossConfirmError } from "@/lib/toss/server";
import type {
  GradingCompany,
  PickupMethod,
  SpoilerPreference,
} from "@/types/order";

// 사용자 결제 액션 — Toss 연동 전 임시 구현.
// 현장결제(ONSITE) 는 매장에서 카드/현금 수령으로 직접 결제하므로 즉시 PAID.
// 카드/계좌이체/간편결제(CARD/TRANSFER/EASY_PAY) 도 Toss 연동 전까지는 동일 경로로 처리하되
// payment_method 만 다르게 기록 — Toss 연결 이후 confirm 핸들러에서 별도 검증 로직 추가 필요.
//
// 효과: orders.payment_status = 'PAID' 갱신 →
//       fn_auto_promote_on_payment_paid 트리거가 order_status='CARD_DELIVERY_PENDING' 으로 승격
//       → log_orders_status_change 트리거가 status_log row 생성
//       → fn_enqueue_milestone_dispatch 트리거가 milestone push enqueue.

// 온라인 결제 수단은 모두 토스 결제 위젯을 통과한다.
// 사용자 선택은 위젯 진입 시 어떤 영역(토스페이 vs 그 외 간편결제)에
// 우선 노출할지 힌트로만 사용되고, 실제 결제수단(카드/이체/간편결제 종류)은
// 토스 위젯 안에서 결정된다. DB 에는 사용자가 처음에 선택한 라벨이 저장된다.
export type PaymentMethodChoice = "ONSITE" | "TOSSPAY" | "EXTERNAL_PAY";

const PAYMENT_METHOD_LABEL: Record<PaymentMethodChoice, string> = {
  ONSITE: "현장결제",
  TOSSPAY: "토스페이",
  EXTERNAL_PAY: "외부 간편결제",
};

type PayActionResult = { ok: false; error: string } | { ok: true };


// 수령 방법 변경 — 고객이 마이페이지 주문 상세에서 매장 수령 ↔ 택배 수령을 변경한다.
// 허용 조건: 본인 소유 + 미취소 + COMPLETED 아님 + 택배비 미결제(shipment_group_id 없음)
//           + 송장 미발급. 결제·발송 이후에는 잠금 — 환불/재정산을 회피한다.
//
// addressSource:
//   - 'MY'     : 발송 시점에 항상 최신 회원 주소를 사용. snapshot 컬럼은 fallback.
//   - 'MANUAL' : 입력한 주소(snapshot)를 그대로 사용.
export async function updateOrderPickupMethodAction(input: {
  orderId: string;
  pickupMethod: PickupMethod;
  addressSource?: "MY" | "MANUAL";
  postalCode?: string;
  deliveryAddress: string;
  deliveryAddressDetail?: string;
}): Promise<PayActionResult> {
  if (!input.orderId) return { ok: false, error: "주문번호가 누락되었습니다." };
  if (
    input.pickupMethod !== "STORE_PICKUP" &&
    input.pickupMethod !== "DELIVERY"
  ) {
    return { ok: false, error: "허용되지 않은 수령 방법입니다." };
  }
  const postalCode = input.postalCode?.trim() ?? "";
  const deliveryAddress = input.deliveryAddress.trim();
  const deliveryAddressDetail = input.deliveryAddressDetail?.trim() ?? "";
  if (input.pickupMethod === "DELIVERY" && !deliveryAddress) {
    return { ok: false, error: "택배 수령 시 배송지를 입력해 주세요." };
  }

  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return { ok: false, error: "로그인이 필요합니다." };
  }

  const { data: order, error: oErr } = await supabase
    .from("orders")
    .select(
      "id, user_id, order_status, shipment_group_id, user_tracking_number, cancelled_at"
    )
    .eq("id", input.orderId)
    .maybeSingle();

  if (oErr || !order) {
    return { ok: false, error: "주문을 찾을 수 없습니다." };
  }
  if (order.user_id !== auth.user.id) {
    return { ok: false, error: "본인 주문만 변경할 수 있습니다." };
  }
  if (order.cancelled_at) {
    return { ok: false, error: "취소된 주문은 변경할 수 없습니다." };
  }
  if (order.order_status === "COMPLETED") {
    return { ok: false, error: "수령 완료된 주문은 변경할 수 없습니다." };
  }
  if (order.shipment_group_id || order.user_tracking_number) {
    return {
      ok: false,
      error:
        "택배비 결제 또는 발송이 진행된 주문은 수령 방법을 변경할 수 없습니다.",
    };
  }

  let service;
  try {
    service = createServiceClient();
  } catch (err) {
    console.error("[orders] service-role unavailable", err);
    return { ok: false, error: "서비스가 일시적으로 불가능합니다." };
  }

  const addressSource: "MY" | "MANUAL" =
    input.pickupMethod === "DELIVERY" && input.addressSource === "MY"
      ? "MY"
      : "MANUAL";

  const { error: updErr } = await service
    .from("orders")
    .update({
      pickup_method: input.pickupMethod,
      address_source: addressSource,
      postal_code:
        input.pickupMethod === "DELIVERY" && postalCode ? postalCode : null,
      delivery_address:
        input.pickupMethod === "DELIVERY" ? deliveryAddress : null,
      delivery_address_detail:
        input.pickupMethod === "DELIVERY" && deliveryAddressDetail
          ? deliveryAddressDetail
          : null,
    })
    .eq("id", order.id);
  if (updErr) {
    console.error("[orders] updateOrderPickupMethodAction failed", updErr);
    return { ok: false, error: "수령 방법 변경에 실패했습니다." };
  }

  revalidatePath("/mypage/orders");
  revalidatePath(`/mypage/orders/${order.id}`);
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${order.id}`);
  revalidatePath("/admin/batches");
  return { ok: true };
}

// 수령 완료 확인 — 고객이 마이페이지에서 택배 수령을 직접 확인한다.
// 대상: 본인 소유 + DELIVERY + TRAINERS_ARRIVED + 송장 발급됨 + 미취소.
// 효과: order_status = COMPLETED.
//       (송장 입력 5일 후 auto_complete_delivered_orders() 도 같은 결과 —
//        먼저 도달하는 쪽이 처리하고, 나중 것은 이미 COMPLETED 라 건너뛴다.)
export async function confirmOrderReceiptAction(input: {
  orderId: string;
}): Promise<PayActionResult> {
  if (!input.orderId) return { ok: false, error: "주문번호가 누락되었습니다." };

  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return { ok: false, error: "로그인이 필요합니다." };
  }

  const { data: order, error: oErr } = await supabase
    .from("orders")
    .select(
      "id, user_id, pickup_method, order_status, user_tracking_number, cancelled_at"
    )
    .eq("id", input.orderId)
    .maybeSingle();

  if (oErr || !order) {
    return { ok: false, error: "주문을 찾을 수 없습니다." };
  }
  if (order.user_id !== auth.user.id) {
    return { ok: false, error: "본인 주문만 처리할 수 있습니다." };
  }
  if (order.cancelled_at) {
    return { ok: false, error: "취소된 주문입니다." };
  }
  if (order.pickup_method !== "DELIVERY") {
    return { ok: false, error: "택배 수령 주문이 아닙니다." };
  }
  if (order.order_status !== "TRAINERS_ARRIVED") {
    return { ok: false, error: "수령 완료 처리할 수 있는 단계가 아닙니다." };
  }
  if (!order.user_tracking_number) {
    return { ok: false, error: "아직 발송되지 않은 주문입니다." };
  }

  let service;
  try {
    service = createServiceClient();
  } catch (err) {
    console.error("[orders] service-role unavailable", err);
    return { ok: false, error: "서비스가 일시적으로 불가능합니다." };
  }

  const { error: updErr } = await service
    .from("orders")
    .update({ order_status: "COMPLETED" })
    .eq("id", order.id);
  if (updErr) {
    console.error("[orders] confirmOrderReceiptAction failed", updErr);
    return { ok: false, error: "수령 완료 처리에 실패했습니다." };
  }

  revalidatePath("/mypage/orders");
  revalidatePath(`/mypage/orders/${order.id}`);
  revalidatePath("/admin/orders");
  return { ok: true };
}

// 고객 자가 취소 — 마이페이지 주문 상세에서 본인이 주문을 취소한다.
// 허용 조건: 본인 소유 + 미취소 + 총판 발송 전(SHIPPED_OUT 이상 차단).
// 효과: orders.cancelled_at + cancel_reason 만 기록. 환불은 운영자가
//       refundOrderAction 으로 별도 처리 (Toss 환불 자동화 미구현).
const NON_CANCELLABLE_BY_USER: ReadonlySet<string> = new Set([
  "SHIPPED_OUT",
  "DISTRIBUTOR_SHIPPED",
  "GRADE_CONFIRMED",
  "TRAINERS_ARRIVED",
  "COMPLETED",
]);

export async function cancelMyOrderAction(input: {
  orderId: string;
  reason?: string;
}): Promise<PayActionResult> {
  if (!input.orderId) return { ok: false, error: "주문번호가 누락되었습니다." };

  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "로그인이 필요합니다." };

  const { data: order, error: oErr } = await supabase
    .from("orders")
    .select("id, user_id, order_status, cancelled_at, payment_status")
    .eq("id", input.orderId)
    .maybeSingle();

  if (oErr || !order) return { ok: false, error: "주문을 찾을 수 없습니다." };
  if (order.user_id !== auth.user.id) {
    return { ok: false, error: "본인 주문만 취소할 수 있습니다." };
  }
  if (order.cancelled_at) {
    return { ok: false, error: "이미 취소된 주문입니다." };
  }
  if (NON_CANCELLABLE_BY_USER.has(order.order_status)) {
    return {
      ok: false,
      error:
        "총판 발송 이후에는 취소가 불가합니다. 고객센터로 문의해 주세요.",
    };
  }

  const customReason = input.reason?.trim() ?? "";
  if (customReason.length > 500) {
    return { ok: false, error: "취소 사유가 너무 깁니다 (500자 이내)." };
  }
  const reason = customReason ? `고객 취소 — ${customReason}` : "고객 취소";

  let service;
  try {
    service = createServiceClient();
  } catch (err) {
    console.error("[orders] service-role unavailable", err);
    return { ok: false, error: "서비스가 일시적으로 불가능합니다." };
  }

  const { error: updErr } = await service
    .from("orders")
    .update({
      cancelled_at: new Date().toISOString(),
      cancel_reason: reason,
    })
    .eq("id", order.id);

  if (updErr) {
    console.error("[orders] cancelMyOrderAction failed", updErr);
    return { ok: false, error: "주문 취소에 실패했습니다." };
  }

  console.info(
    `[orders] self-cancelled id=${order.id} user=${auth.user.id} payment=${order.payment_status}`
  );

  revalidatePath("/mypage/orders");
  revalidatePath(`/mypage/orders/${order.id}`);
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${order.id}`);
  return { ok: true };
}

// 스포일러 설정 변경 — 등급 결과를 마이페이지에서 바로 볼지(ALLOW) 실물 수령 후 볼지(DENY).
// 허용 조건: 본인 소유 + 미취소. COMPLETED 이후에는 의미가 없지만 차단하지는 않는다.
export async function updateOrderSpoilerPreferenceAction(input: {
  orderId: string;
  spoilerPreference: SpoilerPreference;
}): Promise<PayActionResult> {
  if (!input.orderId) return { ok: false, error: "주문번호가 누락되었습니다." };
  if (
    input.spoilerPreference !== "ALLOW" &&
    input.spoilerPreference !== "DENY"
  ) {
    return { ok: false, error: "허용되지 않은 스포일러 설정입니다." };
  }

  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "로그인이 필요합니다." };

  const { data: order, error: oErr } = await supabase
    .from("orders")
    .select("id, user_id, cancelled_at")
    .eq("id", input.orderId)
    .maybeSingle();

  if (oErr || !order) return { ok: false, error: "주문을 찾을 수 없습니다." };
  if (order.user_id !== auth.user.id) {
    return { ok: false, error: "본인 주문만 변경할 수 있습니다." };
  }
  if (order.cancelled_at) {
    return { ok: false, error: "취소된 주문은 변경할 수 없습니다." };
  }

  let service;
  try {
    service = createServiceClient();
  } catch (err) {
    console.error("[orders] service-role unavailable", err);
    return { ok: false, error: "서비스가 일시적으로 불가능합니다." };
  }

  const { error: updErr } = await service
    .from("orders")
    .update({ spoiler_preference: input.spoilerPreference })
    .eq("id", order.id);

  if (updErr) {
    console.error("[orders] updateOrderSpoilerPreferenceAction failed", updErr);
    return { ok: false, error: "스포일러 설정 저장에 실패했습니다." };
  }

  revalidatePath(`/mypage/orders/${order.id}`);
  return { ok: true };
}

// 주문 생성 Server Action (고객 측 apply 폼)
//
// 흐름:
//   1) auth.getUser() 로 인증 확인 — 미로그인 시 거부
//   2) profiles 조회: name/phone 보강 (orders 에 NOT NULL 로 저장)
//   3) 카드를 (그레이딩사, 서비스등급) 조합으로 그룹핑
//   4) 그룹마다: grading_services 단가 스냅샷 → generate_order_id() RPC →
//      orders + 해당 그룹 cards 일괄 삽입 (service-role; RLS 우회 — 인증/소유자 검증으로 안전)
//   5) 그룹 도중 실패 시 이번 제출로 생성된 주문 전체 롤백 (all-or-nothing)
//   6) 성공 시 { ok: true, orderIds } 반환
//
// 이미지: 카드 사진은 별도 Storage 결정 전까지 NULL (마이그레이션 005 에서 컬럼 nullable 화 완료).
// 결제: 본 액션은 PAYMENT_PENDING 상태 주문만 생성. 결제 플로우는 별도 작업.

type CreateOrdersResult =
  | { ok: false; error: string }
  | {
      ok: true;
      orderIds: string[];
      /**
       * ONSITE : 매장 현장결제. 즉시 PAYMENT_PENDING 상태로 신청 완료 처리.
       * TOSS   : 온라인 결제. 주문은 PENDING 으로 생성만 되고, 후속 토스 위젯 결제가 필요.
       */
      mode: "ONSITE" | "TOSS";
    };

export type OrderGroupSubmission = {
  gradingCompany: GradingCompany;
  serviceLevel: string;
  /** 1 이상의 카드 매수. 카드별 상세 정보는 직원이 수령 시 입력. */
  quantity: number;
};

export type CreateOrdersInput = {
  groups: OrderGroupSubmission[];
  pickupMethod: PickupMethod;
  /**
   * 'MY' : 신청자 회원 정보의 최신 주소를 항상 따라간다. 내정보에서 주소가 바뀌면
   *        발송 주소도 함께 바뀐다. snapshot 컬럼은 fallback 및 감사용으로만 보관.
   * 'MANUAL' : 신청 시 입력한 주소(snapshot)를 그대로 사용. 이후 회원 정보가
   *        바뀌어도 이 주문의 주소는 변하지 않는다.
   * 매장 수령(STORE_PICKUP)이면 이 값과 무관하게 'MANUAL' 로 저장.
   */
  addressSource?: "MY" | "MANUAL";
  postalCode?: string;
  deliveryAddress: string;
  deliveryAddressDetail?: string;
  spoilerPreference: SpoilerPreference;
  customerMemo: string;
  /** 결제 수단 — 신청과 결제를 한 번에 처리한다. */
  paymentMethod: PaymentMethodChoice;
};

// 보상: 이번 제출로 생성된 주문(및 카드) 전체 삭제.
// cards 를 먼저 지운 뒤 orders 를 지운다 (FK CASCADE 여부와 무관하게 안전).
async function rollbackOrders(
  service: ReturnType<typeof createServiceClient>,
  orderIds: string[]
): Promise<void> {
  if (orderIds.length === 0) return;
  const { error: cErr } = await service
    .from("cards")
    .delete()
    .in("order_id", orderIds);
  if (cErr) {
    console.error("[orders] rollback cards failed ids=" + orderIds.join(","), cErr);
  }
  const { error: oErr } = await service
    .from("orders")
    .delete()
    .in("id", orderIds);
  if (oErr) {
    console.error("[orders] rollback orders failed ids=" + orderIds.join(","), oErr);
  }
}

export async function createOrdersAction(
  input: CreateOrdersInput
): Promise<CreateOrdersResult> {
  // 1) 인증
  let authUserId: string;
  let authEmail: string | null;
  try {
    const supabase = await createServerClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      return { ok: false, error: "로그인이 필요합니다." };
    }
    authUserId = data.user.id;
    authEmail = data.user.email ?? null;
  } catch (err) {
    console.error("[orders] create auth failed", err);
    return { ok: false, error: "인증 확인 중 오류가 발생했습니다." };
  }

  // 폼 기본 검증
  if (!input.groups || input.groups.length === 0) {
    return { ok: false, error: "신청 항목을 1건 이상 추가해 주세요." };
  }
  for (const [i, g] of input.groups.entries()) {
    if (!g.gradingCompany) {
      return {
        ok: false,
        error: `주문 #${i + 1}: 그레이딩사를 선택해 주세요.`,
      };
    }
    if (!g.serviceLevel) {
      return {
        ok: false,
        error: `주문 #${i + 1}: 서비스 등급을 선택해 주세요.`,
      };
    }
    if (
      !Number.isFinite(g.quantity) ||
      g.quantity < 1 ||
      !Number.isInteger(g.quantity)
    ) {
      return {
        ok: false,
        error: `주문 #${i + 1}: 카드 매수는 1 이상의 정수여야 합니다.`,
      };
    }
  }
  if (input.pickupMethod === "DELIVERY" && !input.deliveryAddress?.trim()) {
    return { ok: false, error: "배송 주소를 입력해 주세요." };
  }
  if (!PAYMENT_METHOD_LABEL[input.paymentMethod]) {
    return { ok: false, error: "결제 수단을 선택해 주세요." };
  }

  let service;
  try {
    service = createServiceClient();
  } catch (err) {
    console.error("[orders] create service-role unavailable", err);
    return { ok: false, error: "서비스가 일시적으로 불가능합니다." };
  }

  // 2) profiles 조회
  const { data: profile, error: pErr } = await service
    .from("profiles")
    .select("id, name, phone, email")
    .eq("id", authUserId)
    .maybeSingle();

  if (pErr || !profile) {
    console.error("[orders] create profile lookup failed", pErr);
    return {
      ok: false,
      error: "회원 정보를 찾을 수 없습니다. 다시 로그인해 주세요.",
    };
  }
  if (!profile.name || !profile.phone) {
    return {
      ok: false,
      error:
        "회원 정보(성함/연락처)가 누락되어 있습니다. 마이페이지에서 먼저 등록해 주세요.",
    };
  }

  // 3) (그레이딩사, 서비스등급) 조합별로 매수 합산
  const groups = new Map<
    string,
    { gradingCompany: GradingCompany; serviceLevel: string; quantity: number }
  >();
  for (const g of input.groups) {
    const key = `${g.gradingCompany}::${g.serviceLevel}`;
    const existing = groups.get(key);
    if (existing) {
      existing.quantity += g.quantity;
    } else {
      groups.set(key, {
        gradingCompany: g.gradingCompany,
        serviceLevel: g.serviceLevel,
        quantity: g.quantity,
      });
    }
  }

  const createdOrderIds: string[] = [];

  // 4) 그룹마다 주문 생성
  for (const group of groups.values()) {
    const { gradingCompany, serviceLevel, quantity } = group;

    // 4a) 서비스 단가 스냅샷
    const { data: svc, error: sErr } = await service
      .from("grading_services")
      .select("price, is_active, code, company")
      .eq("company", gradingCompany)
      .eq("code", serviceLevel)
      .maybeSingle();

    if (sErr || !svc) {
      await rollbackOrders(service, createdOrderIds);
      console.error("[orders] create grading_services lookup failed", sErr);
      return { ok: false, error: "선택한 서비스 등급을 찾을 수 없습니다." };
    }
    if (!svc.is_active) {
      await rollbackOrders(service, createdOrderIds);
      return { ok: false, error: "선택한 서비스는 현재 신청을 받지 않습니다." };
    }

    // 4b) 신규 ID
    const { data: idData, error: idErr } = await service.rpc(
      "generate_order_id"
    );
    if (idErr || !idData) {
      await rollbackOrders(service, createdOrderIds);
      console.error("[orders] generate_order_id RPC failed", idErr);
      return {
        ok: false,
        error: "주문번호 발급에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      };
    }
    const newOrderId = idData as string;

    // 4c) orders 삽입
    const prepaidAmount = svc.price * quantity;
    const addressSource: "MY" | "MANUAL" =
      input.pickupMethod === "DELIVERY" && input.addressSource === "MY"
        ? "MY"
        : "MANUAL";
    const { error: oInsertErr } = await service.from("orders").insert({
      id: newOrderId,
      user_id: authUserId,
      name: profile.name,
      phone: profile.phone,
      pickup_method: input.pickupMethod,
      address_source: addressSource,
      postal_code:
        input.pickupMethod === "DELIVERY" && input.postalCode?.trim()
          ? input.postalCode.trim()
          : null,
      delivery_address:
        input.pickupMethod === "DELIVERY" ? input.deliveryAddress : null,
      delivery_address_detail:
        input.pickupMethod === "DELIVERY" && input.deliveryAddressDetail?.trim()
          ? input.deliveryAddressDetail.trim()
          : null,
      grading_company: gradingCompany,
      service_level: svc.code,
      service_price_snapshot: svc.price,
      payment_status: "PENDING",
      prepaid_amount: prepaidAmount,
      shipping_fee: 0,
      order_status: "PAYMENT_PENDING",
      spoiler_preference: input.spoilerPreference ?? "ALLOW",
      customer_memo: input.customerMemo?.trim() || null,
    });

    if (oInsertErr) {
      await rollbackOrders(service, createdOrderIds);
      console.error("[orders] insert orders failed", oInsertErr);
      return {
        ok: false,
        error: "주문 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      };
    }
    createdOrderIds.push(newOrderId);

    // 4d) cards 삽입 — quantity 만큼 빈 row 생성. 카드별 상세 정보는
    //     매장 직원이 카드 수령 시 어드민 페이지에서 보강한다.
    const cardRows = Array.from({ length: quantity }, () => ({
      order_id: newOrderId,
      english_name: null,
      set_name: null,
      card_number: null,
      year: null,
      declared_value: null,
      front_image_url: null,
      back_image_url: null,
    }));

    const { error: cInsertErr } = await service.from("cards").insert(cardRows);
    if (cInsertErr) {
      await rollbackOrders(service, createdOrderIds);
      console.error(
        "[orders] insert cards failed (orders rolled back)",
        cInsertErr
      );
      return {
        ok: false,
        error: "카드 정보 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      };
    }
  }

  // 5) 결제 처리
  //    - ONSITE: 매장 방문 후 직원이 별도 처리. PAYMENT_PENDING 유지 → "신청 완료" 상태.
  //    - 온라인(CARD/TRANSFER/EASY_PAY): 주문만 PAYMENT_PENDING 으로 생성하고 응답에 mode='TOSS'
  //      를 실어 보낸다. 클라이언트는 /apply/payment 로 이동해 토스 결제 위젯에서 결제를 마치고,
  //      성공 시 /apply/payment/success 의 confirmApplyPrepaymentAction 이 payments 행을 만들고
  //      orders 를 PAID + CARD_DELIVERY_PENDING 으로 승격한다.
  const paymentLabel = PAYMENT_METHOD_LABEL[input.paymentMethod];
  const isOnsite = input.paymentMethod === "ONSITE";

  if (isOnsite) {
    // 현장결제는 매장에서 직원이 별도 처리. 별도 payments 행은 만들지 않는다.
  }

  // 작업자 추적용 로깅 (PII 최소화)
  const maskedEmail = authEmail
    ? authEmail.replace(/^(.).*(@.*)$/, "$1***$2")
    : "unknown";
  const totalCards = Array.from(groups.values()).reduce(
    (sum, g) => sum + g.quantity,
    0
  );
  console.info(
    `[orders] ${isOnsite ? "created (onsite-pending)" : "created (toss-pending)"} ids=${createdOrderIds.join(",")} user=${maskedEmail} orders=${createdOrderIds.length} cards=${totalCards} method=${paymentLabel}`
  );

  revalidatePath("/mypage/orders");
  revalidatePath("/admin/orders");
  return {
    ok: true,
    orderIds: createdOrderIds,
    mode: isOnsite ? "ONSITE" : "TOSS",
  };
}


// ── 토스 결제 위젯 — 통합 confirm 핸들러 ─────────────────────────────────────
//
// 흐름 (3가지 type 공통):
//   1) 클라이언트가 토스 위젯에서 결제 완료 → /pay/success?type=...&orderIds=...&paymentKey=...
//   2) success 페이지가 이 액션 호출 → 토스 /v1/payments/confirm 호출
//   3) type 별 DB 갱신:
//        prepay     : payments(PREPAYMENT) + orders.payment_status=PAID + order_status=CARD_DELIVERY_PENDING
//        overcharge : payments(OVERCHARGE) + orders.payment_status=OVERCHARGE_PAID
//        shipping   : payments(SHIPPING, 대표 주문 1건) + orders.shipment_group_id 부여 + shipping_fee
//
// 멱등성: (toss_payment_key, order_id) UNIQUE 인덱스가 중복 insert 를 막아준다.
//         success 페이지 새로고침/중복 호출에도 안전.

export type TossPaymentType = "prepay" | "overcharge" | "shipping";

export type ConfirmTossPaymentResult =
  | { ok: false; error: string }
  | { ok: true; type: TossPaymentType; orderIds: string[] };

export interface ConfirmTossPaymentInput {
  type: TossPaymentType;
  orderIds: string[];
  paymentKey: string;
  tossOrderId: string;
  amount: number;
}

export async function confirmTossPaymentAction(
  input: ConfirmTossPaymentInput
): Promise<ConfirmTossPaymentResult> {
  const orderIds = Array.from(
    new Set((input.orderIds ?? []).filter(Boolean))
  );
  if (orderIds.length === 0) {
    return { ok: false, error: "주문 정보가 누락되었습니다." };
  }
  if (!input.paymentKey || !input.tossOrderId) {
    return { ok: false, error: "결제 정보가 누락되었습니다." };
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, error: "결제 금액이 올바르지 않습니다." };
  }
  if (
    input.type !== "prepay" &&
    input.type !== "overcharge" &&
    input.type !== "shipping"
  ) {
    return { ok: false, error: "결제 유형이 올바르지 않습니다." };
  }

  // 1) 인증
  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return { ok: false, error: "로그인이 필요합니다." };
  }

  // 2) 주문 조회 (service-role)
  let service;
  try {
    service = createServiceClient();
  } catch (err) {
    console.error("[toss-confirm] service-role unavailable", err);
    return { ok: false, error: "서비스가 일시적으로 불가능합니다." };
  }

  const { data: orders, error: oErr } = await service
    .from("orders")
    .select(
      "id, user_id, prepaid_amount, overcharge_amount, payment_status, order_status, pickup_method, shipment_group_id, cancelled_at"
    )
    .in("id", orderIds);

  if (oErr) {
    console.error("[toss-confirm] order fetch failed", oErr);
    return { ok: false, error: "주문 조회 중 오류가 발생했습니다." };
  }
  if (!orders || orders.length !== orderIds.length) {
    return { ok: false, error: "일부 주문을 찾을 수 없습니다." };
  }

  // 3) type 별 사전 검증 + 기대 금액 계산
  let expectedTotal = 0;
  for (const o of orders) {
    if (o.user_id !== auth.user.id) {
      return { ok: false, error: "본인 주문에만 결제할 수 있습니다." };
    }
    if (o.cancelled_at) {
      return { ok: false, error: "취소된 주문이 포함되어 있습니다." };
    }

    if (input.type === "prepay") {
      if (o.payment_status === "PAID") continue; // 멱등 통과
      if (o.payment_status !== "PENDING") {
        return {
          ok: false,
          error: `현재 결제 상태(${o.payment_status})에서는 선결제할 수 없습니다.`,
        };
      }
      expectedTotal += o.prepaid_amount ?? 0;
    } else if (input.type === "overcharge") {
      if (o.payment_status === "OVERCHARGE_PAID") continue; // 멱등
      if (o.payment_status !== "OVERCHARGE_PENDING") {
        return {
          ok: false,
          error: "오버차지 결제 대기 상태가 아닙니다.",
        };
      }
      if (!o.overcharge_amount || o.overcharge_amount <= 0) {
        return { ok: false, error: "결제할 오버차지 금액이 없습니다." };
      }
      expectedTotal += o.overcharge_amount;
    } else {
      // shipping
      if (o.pickup_method !== "DELIVERY") {
        return {
          ok: false,
          error: "택배 수령이 아닌 주문이 포함되어 있습니다.",
        };
      }
      if (o.order_status !== "TRAINERS_ARRIVED") {
        return {
          ok: false,
          error: "아직 택배비 결제 단계가 아닌 주문이 포함되어 있습니다.",
        };
      }
      if (o.shipment_group_id) {
        // 멱등 — 이미 결제된 묶음. 검증만 통과시키고 후속 insert 는 skip.
        continue;
      }
    }
  }

  if (input.type === "shipping") {
    expectedTotal = SHIPPING_FEE;
  }

  // 금액 검증 — 클라이언트 변조 차단
  if (expectedTotal !== input.amount) {
    console.error(
      `[toss-confirm] amount mismatch type=${input.type} expected=${expectedTotal} got=${input.amount} orders=${orderIds.join(",")}`
    );
    return {
      ok: false,
      error: "결제 금액이 주문 금액과 일치하지 않습니다.",
    };
  }

  // 4) 토스 승인
  let tossResp;
  try {
    tossResp = await confirmTossPayment({
      paymentKey: input.paymentKey,
      orderId: input.tossOrderId,
      amount: input.amount,
    });
  } catch (err) {
    if (err instanceof TossConfirmError) {
      console.error(
        `[toss-confirm] toss api failed type=${input.type} code=${err.code} status=${err.status} paymentKey=${input.paymentKey}`,
        err.raw
      );
      return {
        ok: false,
        error: `결제 승인에 실패했습니다. (${err.code}) ${err.message}`,
      };
    }
    console.error("[toss-confirm] toss api unexpected error", err);
    return { ok: false, error: "결제 승인 중 오류가 발생했습니다." };
  }

  const paidAtIso = tossResp.approvedAt ?? new Date().toISOString();
  const methodLabel = (tossResp.method as string) ?? "토스페이먼츠";

  // 5) type 별 DB 갱신
  try {
    if (input.type === "prepay") {
      for (const o of orders) {
        if (o.payment_status === "PAID") continue;
        const { error: payErr } = await service.from("payments").insert({
          order_id: o.id,
          payment_type: "PREPAYMENT",
          amount: o.prepaid_amount,
          payment_method: methodLabel,
          toss_order_id: input.tossOrderId,
          toss_payment_key: input.paymentKey,
          status: "COMPLETED",
          paid_at: paidAtIso,
          raw_response: tossResp as unknown as object,
        });
        if (payErr) throw payErr;
        const { error: updErr } = await service
          .from("orders")
          .update({
            payment_status: "PAID",
            order_status: "CARD_DELIVERY_PENDING",
          })
          .eq("id", o.id);
        if (updErr) throw updErr;
      }
    } else if (input.type === "overcharge") {
      for (const o of orders) {
        if (o.payment_status === "OVERCHARGE_PAID") continue;
        // 위 검증 루프에서 overcharge_amount > 0 보장됨.
        const overchargeAmt = o.overcharge_amount ?? 0;
        const { error: payErr } = await service.from("payments").insert({
          order_id: o.id,
          payment_type: "OVERCHARGE",
          amount: overchargeAmt,
          payment_method: methodLabel,
          toss_order_id: input.tossOrderId,
          toss_payment_key: input.paymentKey,
          status: "COMPLETED",
          paid_at: paidAtIso,
          raw_response: tossResp as unknown as object,
        });
        if (payErr) throw payErr;
        const { error: updErr } = await service
          .from("orders")
          .update({ payment_status: "OVERCHARGE_PAID" })
          .eq("id", o.id);
        if (updErr) throw updErr;
      }
    } else {
      // shipping — 합배송: 미결제 주문들이 새 shipment_group_id 를 공유.
      const unshippedOrderIds = orders
        .filter((o) => !o.shipment_group_id)
        .map((o) => o.id);

      if (unshippedOrderIds.length > 0) {
        const shipmentGroupId = randomUUID();
        const primaryOrderId = unshippedOrderIds[0];

        const { error: payErr } = await service.from("payments").insert({
          order_id: primaryOrderId,
          payment_type: "SHIPPING",
          amount: SHIPPING_FEE,
          payment_method: methodLabel,
          toss_order_id: input.tossOrderId,
          toss_payment_key: input.paymentKey,
          status: "COMPLETED",
          paid_at: paidAtIso,
          raw_response: tossResp as unknown as object,
        });
        if (payErr) throw payErr;

        const { error: grpErr } = await service
          .from("orders")
          .update({ shipment_group_id: shipmentGroupId })
          .in("id", unshippedOrderIds);
        if (grpErr) throw grpErr;

        const { error: feeErr } = await service
          .from("orders")
          .update({ shipping_fee: SHIPPING_FEE })
          .eq("id", primaryOrderId);
        if (feeErr) throw feeErr;
      }
    }
  } catch (err) {
    console.error(
      `[toss-confirm] db update failed type=${input.type} paymentKey=${input.paymentKey} orders=${orderIds.join(",")}`,
      err
    );
    return {
      ok: false,
      error:
        "결제는 완료되었으나 주문 상태 갱신에 실패했습니다. 고객센터에 문의해 주세요.",
    };
  }

  console.info(
    `[toss-confirm] paid type=${input.type} orders=${orderIds.join(",")} paymentKey=${input.paymentKey} amount=${input.amount}`
  );

  revalidatePath("/mypage/orders");
  for (const id of orderIds) {
    revalidatePath(`/mypage/orders/${id}`);
  }
  revalidatePath("/admin/orders");
  if (input.type === "shipping") {
    revalidatePath("/admin/batches");
  }
  return { ok: true, type: input.type, orderIds };
}
