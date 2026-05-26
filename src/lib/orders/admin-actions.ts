"use server";

// 관리자 전용 주문 상태 변경 액션.
//
// 보안: requireAdmin() 가드로 admin role 검증.
// PWA Push: orders.order_status UPDATE 시 002_redesign 의 log_orders_status_change 트리거가
//   order_status_logs row를 자동 생성하며, 003_pwa_push 의 후속 트리거가 milestone 상태인
//   경우 notifications_outbox에 enqueue 한다. 별도 dispatch 호출 불필요.

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/service";
import type { GradingCompany, OrderStatus } from "@/types/order";
import type { AdminRole } from "@/types";

const ADMIN_ROLES: ReadonlySet<AdminRole> = new Set([
  "SUPER_ADMIN",
  "GENERAL_ADMIN",
  "STORE_SHARED",
]);

function isAdminRole(v: unknown): v is AdminRole {
  return typeof v === "string" && ADMIN_ROLES.has(v as AdminRole);
}

// ── 권한 매트릭스 헬퍼 ──────────────────────────────────────────────────────
// SUPER_ADMIN   : 모든 액션 (주문 삭제, 관리자 추가, 설정 변경 포함)
// GENERAL_ADMIN : 주문 취소·정보 입력 가능 / 삭제 불가
// STORE_SHARED  : 조회 + 주문 상태 변경만 가능 / 입력·취소·삭제 모두 불가
//
// 모든 server action 은 requireAdmin() 통과 후 역할별 가드를 적용한다.

function canCancelOrder(role: AdminRole | null | undefined): boolean {
  return role === "SUPER_ADMIN" || role === "GENERAL_ADMIN";
}

function canDeleteOrder(role: AdminRole | null | undefined): boolean {
  return role === "SUPER_ADMIN";
}

function canInputData(role: AdminRole | null | undefined): boolean {
  return role === "SUPER_ADMIN" || role === "GENERAL_ADMIN";
}

const GRADING_COMPANIES_SET: ReadonlySet<GradingCompany> = new Set([
  "PSA",
  "BGS",
  "CGC",
  "BRG",
]);

type AdminActionResult = { ok: false; error: string } | { ok: true };

// 허용 전이 (단순 시퀀스 — 필요 시 도메인 룰로 강화)
const STATUS_SEQUENCE: OrderStatus[] = [
  "PAYMENT_PENDING",
  "CARD_DELIVERY_PENDING",
  "CARD_RECEIVED",
  "SHIPPED_OUT",
  "DISTRIBUTOR_SHIPPED",
  "GRADE_CONFIRMED",
  "TRAINERS_ARRIVED",
  "COMPLETED",
];

function isValidStatus(value: string): value is OrderStatus {
  return STATUS_SEQUENCE.includes(value as OrderStatus);
}

export async function updateOrderStatusAction(params: {
  orderId: string;
  newStatus: OrderStatus;
  reason?: string;
}): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, error: "관리자 권한이 필요합니다." };
  }

  if (!params.orderId) {
    return { ok: false, error: "주문번호가 필요합니다." };
  }
  if (!isValidStatus(params.newStatus)) {
    return { ok: false, error: "허용되지 않은 상태값입니다." };
  }

  const service = createServiceClient();

  const updates: Record<string, unknown> = {
    order_status: params.newStatus,
  };

  // 상태별 타임스탬프 자동 갱신 (DB 트리거가 backstop — 명시 갱신은 호출자 가시성을 위함)
  const now = new Date().toISOString();
  if (params.newStatus === "CARD_RECEIVED") {
    updates.received_at = now;
  } else if (params.newStatus === "SHIPPED_OUT") {
    updates.shipped_out_at = now;
  } else if (params.newStatus === "DISTRIBUTOR_SHIPPED") {
    updates.distributor_shipped_at = now;
  }

  const { error } = await service
    .from("orders")
    .update(updates)
    .eq("id", params.orderId);

  if (error) {
    console.error("[orders] admin status update failed", error);
    return { ok: false, error: "상태 변경에 실패했습니다." };
  }

  // 상태변경 reason 은 별도 log row 가 아닌 trigger 생성 row 에 update 로 보강
  if (params.reason?.trim()) {
    const { error: lErr } = await service
      .from("order_status_logs")
      .update({ change_reason: params.reason.trim(), changed_by: admin.adminId })
      .eq("order_id", params.orderId)
      .eq("new_status", params.newStatus)
      .order("created_at", { ascending: false })
      .limit(1);

    if (lErr) {
      console.warn("[orders] status log reason update failed (non-fatal)", lErr);
    }
  } else {
    // trigger 가 auth.uid() 기반으로 changed_by 채우지만, requireAdmin 경로에서
    // service-role 호출이므로 auth.uid() 가 null 일 수 있음 → 명시 보강
    await service
      .from("order_status_logs")
      .update({ changed_by: admin.adminId })
      .eq("order_id", params.orderId)
      .eq("new_status", params.newStatus)
      .is("changed_by", null);
  }

  // 캐시 무효화
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${params.orderId}`);
  revalidatePath("/admin/grading");

  return { ok: true };
}

// ── 다중 주문 상태 일괄 변경 ────────────────────────────────────────────────
// 어드민 주문 관리 "그레이딩사별" 탭에서 카드 단위로 다중 선택 후 호출.
// 동일 orderId가 중복돼도 한 번만 적용되도록 dedupe.

export type BulkUpdateOrderStatusResult =
  | { ok: false; error: string }
  | { ok: true; updatedCount: number };

export async function bulkUpdateOrderStatusAction(params: {
  orderIds: string[];
  newStatus: OrderStatus;
  reason?: string;
}): Promise<BulkUpdateOrderStatusResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, error: "관리자 권한이 필요합니다." };
  }

  const uniqueIds = Array.from(
    new Set((params.orderIds ?? []).filter((id) => !!id))
  );
  if (uniqueIds.length === 0) {
    return { ok: false, error: "변경할 주문을 선택해 주세요." };
  }
  if (!isValidStatus(params.newStatus)) {
    return { ok: false, error: "허용되지 않은 상태값입니다." };
  }

  const service = createServiceClient();
  const now = new Date().toISOString();

  const updates: Record<string, unknown> = {
    order_status: params.newStatus,
  };
  if (params.newStatus === "CARD_RECEIVED") {
    updates.received_at = now;
  } else if (params.newStatus === "SHIPPED_OUT") {
    updates.shipped_out_at = now;
  } else if (params.newStatus === "DISTRIBUTOR_SHIPPED") {
    updates.distributor_shipped_at = now;
  }

  const { error } = await service
    .from("orders")
    .update(updates)
    .in("id", uniqueIds);

  if (error) {
    console.error("[orders] bulk status update failed", error);
    return { ok: false, error: "일괄 상태 변경에 실패했습니다." };
  }

  // 트리거가 생성한 status log row의 changed_by/reason 보강
  const reason = params.reason?.trim() || null;
  await service
    .from("order_status_logs")
    .update({
      changed_by: admin.adminId,
      ...(reason !== null ? { change_reason: reason } : {}),
    })
    .in("order_id", uniqueIds)
    .eq("new_status", params.newStatus)
    .is("changed_by", null);

  revalidatePath("/admin/orders");
  revalidatePath("/admin/grading");

  return { ok: true, updatedCount: uniqueIds.length };
}

// ── 카드 수령 처리 ─────────────────────────────────────────────────────────
// CARD_DELIVERY_PENDING → CARD_RECEIVED 전이.
// internal_memo 보강 + received_at 갱신.

export async function receiveOrderCardsAction(params: {
  orderId: string;
  memo?: string;
}): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, error: "관리자 권한이 필요합니다." };
  }
  if (!params.orderId) {
    return { ok: false, error: "주문번호가 필요합니다." };
  }

  const service = createServiceClient();
  const now = new Date().toISOString();
  const memo = params.memo?.trim();

  const updates: Record<string, unknown> = {
    order_status: "CARD_RECEIVED" satisfies OrderStatus,
    received_at: now,
  };
  if (memo) updates.internal_memo = memo;

  const { error } = await service
    .from("orders")
    .update(updates)
    .eq("id", params.orderId);

  if (error) {
    console.error("[orders] receive cards failed", error);
    return { ok: false, error: "카드 수령 처리에 실패했습니다." };
  }

  // 로그 changed_by 보강
  await service
    .from("order_status_logs")
    .update({
      changed_by: admin.adminId,
      change_reason: memo ?? null,
    })
    .eq("order_id", params.orderId)
    .eq("new_status", "CARD_RECEIVED")
    .is("changed_by", null);

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${params.orderId}`);
  return { ok: true };
}

// ── 일련번호 일괄 업로드 ──────────────────────────────────────────────────
// grading 페이지의 "업로드" 버튼에서 호출. 각 entry 는 cardId + serial.
// 일련번호가 채워진 entry 만 적용 — 빈 카드는 무시.
// 한 주문의 모든 카드가 serial 을 가지면 'DISTRIBUTOR_SHIPPED' →
// 'GRADE_CONFIRMED' 자동 전이 (existing log/푸시 트리거 작동).
// 등급 결과(grade_result) 는 운영자가 입력하지 않고, 사용자가 그레이딩사 사이트에서
// 일련번호로 직접 조회한다.

export type BulkUpsertGradeEntry = {
  cardId: string;
  serialNumber: string;
};

export type BulkUpsertGradeResult =
  | { ok: false; error: string }
  | {
      ok: true;
      appliedCount: number;
      skippedCount: number;
      promotedOrderIds: string[];
    };

export async function bulkUpsertGradeResultsAction(params: {
  entries: BulkUpsertGradeEntry[];
}): Promise<BulkUpsertGradeResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, error: "관리자 권한이 필요합니다." };
  }
  if (!canInputData(admin.adminRole)) {
    return { ok: false, error: "매장 계정은 일련번호를 입력할 수 없습니다." };
  }

  const allEntries = params.entries ?? [];
  // 일련번호가 채워진 항목만 적용
  const applied: BulkUpsertGradeEntry[] = [];
  for (const e of allEntries) {
    const s = e.serialNumber?.trim() ?? "";
    if (!e.cardId || !s) continue;
    if (s.length > 80) {
      return { ok: false, error: `일련번호가 너무 깁니다 (80자 이내). cardId=${e.cardId}` };
    }
    applied.push({ cardId: e.cardId, serialNumber: s });
  }

  const skippedCount = allEntries.length - applied.length;

  if (applied.length === 0) {
    return {
      ok: false,
      error: "일련번호가 입력된 항목이 없습니다.",
    };
  }

  const service = createServiceClient();

  // 각 카드별 UPDATE (값이 행마다 다름 — 단일 SQL bulk UPDATE 대신 순차 처리)
  const affectedOrderIds = new Set<string>();
  for (const entry of applied) {
    const { data, error } = await service
      .from("cards")
      .update({
        serial_number: entry.serialNumber,
      })
      .eq("id", entry.cardId)
      .select("order_id")
      .maybeSingle();

    if (error || !data) {
      console.error("[cards] bulk upsert serial failed", entry.cardId, error);
      return {
        ok: false,
        error: "일부 카드 저장에 실패했습니다. 다시 시도해 주세요.",
      };
    }
    affectedOrderIds.add(data.order_id);
  }

  // 영향받은 주문 단위로 자동 승격 평가 — 일련번호 기준
  const promotedOrderIds: string[] = [];
  for (const orderId of affectedOrderIds) {
    const { data: siblings, error: sErr } = await service
      .from("cards")
      .select("serial_number")
      .eq("order_id", orderId);

    if (sErr || !siblings) {
      console.warn("[cards] sibling fetch failed (no auto-promote)", orderId, sErr);
      continue;
    }
    const allFilled =
      siblings.length > 0 &&
      siblings.every(
        (c) =>
          !!c.serial_number &&
          c.serial_number.trim().length > 0
      );
    if (!allFilled) continue;

    const { data: order, error: oErr } = await service
      .from("orders")
      .select("order_status")
      .eq("id", orderId)
      .maybeSingle();
    if (oErr || !order) continue;
    if (order.order_status !== "DISTRIBUTOR_SHIPPED") continue;

    const { error: pErr } = await service
      .from("orders")
      .update({ order_status: "GRADE_CONFIRMED" })
      .eq("id", orderId);
    if (pErr) {
      console.warn("[cards] auto-promote to GRADE_CONFIRMED failed", orderId, pErr);
      continue;
    }
    await service
      .from("order_status_logs")
      .update({ changed_by: admin.adminId })
      .eq("order_id", orderId)
      .eq("new_status", "GRADE_CONFIRMED")
      .is("changed_by", null);
    promotedOrderIds.push(orderId);
    revalidatePath(`/admin/orders/${orderId}`);
  }

  revalidatePath("/admin/grading");
  revalidatePath("/admin/orders");
  return {
    ok: true,
    appliedCount: applied.length,
    skippedCount,
    promotedOrderIds,
  };
}

// ── 주문 취소 ──────────────────────────────────────────────────────────────
// 어드민 권한으로 주문을 소프트 취소: cancelled_at + cancel_reason 기록.
// 주문 상태는 변경하지 않음 (이력 유지). 결제 환불 등 후속 처리는 별도.

export async function cancelOrderAction(params: {
  orderId: string;
  reason: string;
}): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, error: "관리자 권한이 필요합니다." };
  }
  if (!canCancelOrder(admin.adminRole)) {
    return {
      ok: false,
      error: "매장 계정은 주문을 취소할 수 없습니다.",
    };
  }
  if (!params.orderId) {
    return { ok: false, error: "주문번호가 필요합니다." };
  }
  const reason = params.reason?.trim();
  if (!reason) {
    return { ok: false, error: "취소 사유를 입력해 주세요." };
  }
  if (reason.length > 500) {
    return { ok: false, error: "취소 사유가 너무 깁니다 (500자 이내)." };
  }

  const service = createServiceClient();

  // 이미 취소된 경우 idempotent — 사유만 갱신
  const { data: existing, error: fErr } = await service
    .from("orders")
    .select("cancelled_at")
    .eq("id", params.orderId)
    .maybeSingle();
  if (fErr || !existing) {
    console.error("[orders] cancel lookup failed", fErr);
    return { ok: false, error: "주문을 찾을 수 없습니다." };
  }

  const now = new Date().toISOString();
  const { error } = await service
    .from("orders")
    .update({
      cancelled_at: existing.cancelled_at ?? now,
      cancel_reason: reason,
    })
    .eq("id", params.orderId);

  if (error) {
    console.error("[orders] cancel failed", error);
    return { ok: false, error: "주문 취소에 실패했습니다." };
  }

  console.info(
    `[orders] cancelled id=${params.orderId} by=${admin.adminId} reason="${reason.slice(0, 80)}"`
  );

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${params.orderId}`);
  return { ok: true };
}

// ── 주문 일괄 취소 ────────────────────────────────────────────────────────
// 어드민 주문 관리 "주문번호별" 탭에서 다중 선택 후 호출.
// 모든 선택 주문에 동일한 cancel_reason 을 기록. 이미 취소된 주문은 idempotent (건드리지 않음).

export type BulkCancelOrdersResult =
  | { ok: false; error: string }
  | { ok: true; cancelledCount: number };

export async function bulkCancelOrdersAction(params: {
  orderIds: string[];
  reason: string;
}): Promise<BulkCancelOrdersResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, error: "관리자 권한이 필요합니다." };
  }
  if (!canCancelOrder(admin.adminRole)) {
    return { ok: false, error: "매장 계정은 주문을 취소할 수 없습니다." };
  }

  const uniqueIds = Array.from(
    new Set((params.orderIds ?? []).filter((id) => !!id))
  );
  if (uniqueIds.length === 0) {
    return { ok: false, error: "취소할 주문을 선택해 주세요." };
  }

  const reason = params.reason?.trim();
  if (!reason) {
    return { ok: false, error: "취소 사유를 입력해 주세요." };
  }
  if (reason.length > 500) {
    return { ok: false, error: "취소 사유가 너무 깁니다 (500자 이내)." };
  }

  const service = createServiceClient();
  const now = new Date().toISOString();

  // 미취소 주문에만 적용 — 이미 취소된 주문은 그대로 보존
  const { data: targets, error: fErr } = await service
    .from("orders")
    .select("id")
    .in("id", uniqueIds)
    .is("cancelled_at", null);

  if (fErr) {
    console.error("[orders] bulk cancel lookup failed", fErr);
    return { ok: false, error: "주문 조회에 실패했습니다." };
  }

  const targetIds = (targets ?? []).map((r) => r.id);
  if (targetIds.length === 0) {
    return {
      ok: false,
      error: "취소 가능한 주문이 없습니다. (이미 취소되었을 수 있습니다)",
    };
  }

  const { error } = await service
    .from("orders")
    .update({ cancelled_at: now, cancel_reason: reason })
    .in("id", targetIds);

  if (error) {
    console.error("[orders] bulk cancel failed", error);
    return { ok: false, error: "일괄 취소에 실패했습니다." };
  }

  console.info(
    `[orders] bulk-cancelled count=${targetIds.length} by=${admin.adminId} reason="${reason.slice(0, 80)}"`
  );

  revalidatePath("/admin/orders");
  for (const id of targetIds) {
    revalidatePath(`/admin/orders/${id}`);
  }

  return { ok: true, cancelledCount: targetIds.length };
}

// ── 현장 환불 완료 처리 ───────────────────────────────────────────────────
// 취소된 주문 + 결제 내역이 잔존하는 경우, 운영자가 현장에서 현금/계좌이체로
// 환불을 완료했을 때 호출. 잔존 payments 행을 모두 제거하고 (현장 환불은 토스
// API 환불 흐름과 별개라 audit 행 유지 가치가 낮음), orders.payment_status 를
// 'REFUNDED' 로 갱신. 이후 deleteOrderAction 으로 영구 삭제 가능.

export async function refundOrderAction(params: {
  orderId: string;
}): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, error: "관리자 권한이 필요합니다." };
  }
  if (!canCancelOrder(admin.adminRole)) {
    return { ok: false, error: "매장 계정은 환불 처리를 할 수 없습니다." };
  }
  if (!params.orderId) {
    return { ok: false, error: "주문번호가 필요합니다." };
  }

  const service = createServiceClient();

  const { data: order, error: fErr } = await service
    .from("orders")
    .select("cancelled_at, payment_status")
    .eq("id", params.orderId)
    .maybeSingle();

  if (fErr || !order) {
    return { ok: false, error: "주문을 찾을 수 없습니다." };
  }
  if (!order.cancelled_at) {
    return {
      ok: false,
      error: "취소된 주문에 대해서만 환불 처리할 수 있습니다.",
    };
  }

  // 잔존 결제 내역 삭제 (현장 환불 — 토스 API 환불과 별도)
  const { error: dErr } = await service
    .from("payments")
    .delete()
    .eq("order_id", params.orderId);

  if (dErr) {
    console.error("[orders] refund: payments delete failed", dErr);
    return { ok: false, error: "결제 내역 정리에 실패했습니다." };
  }

  const { error: uErr } = await service
    .from("orders")
    .update({ payment_status: "REFUNDED" })
    .eq("id", params.orderId);

  if (uErr) {
    console.error("[orders] refund: payment_status update failed", uErr);
    return { ok: false, error: "결제 상태 변경에 실패했습니다." };
  }

  console.info(
    `[orders] refunded id=${params.orderId} by=${admin.adminId}`
  );

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${params.orderId}`);
  return { ok: true };
}

// ── 주문 영구 삭제 ────────────────────────────────────────────────────────
// 취소된 주문만 영구 삭제 가능 (cancelled_at IS NOT NULL).
// FK CASCADE: cards / order_status_logs 동시 삭제.
// payments / batch_orders 는 FK CASCADE 없음 — 잔존 결제/배치 링크가 있으면 거부.

export async function deleteOrderAction(params: {
  orderId: string;
}): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, error: "관리자 권한이 필요합니다." };
  }
  if (!canDeleteOrder(admin.adminRole)) {
    return {
      ok: false,
      error: "슈퍼관리자만 주문을 삭제할 수 있습니다.",
    };
  }
  if (!params.orderId) {
    return { ok: false, error: "주문번호가 필요합니다." };
  }

  const service = createServiceClient();

  const { data: order, error: fErr } = await service
    .from("orders")
    .select("cancelled_at")
    .eq("id", params.orderId)
    .maybeSingle();
  if (fErr || !order) {
    return { ok: false, error: "주문을 찾을 수 없습니다." };
  }
  if (!order.cancelled_at) {
    return {
      ok: false,
      error: "취소되지 않은 주문은 삭제할 수 없습니다. 먼저 취소해 주세요.",
    };
  }

  // 잔존 결제 / 배치 링크 존재 여부 검사 (FK 제약으로 어차피 실패하지만 사유 명시)
  const [{ count: paymentCount }, { count: batchCount }] = await Promise.all([
    service
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("order_id", params.orderId),
    service
      .from("batch_orders")
      .select("order_id", { count: "exact", head: true })
      .eq("order_id", params.orderId),
  ]);

  if ((paymentCount ?? 0) > 0) {
    return {
      ok: false,
      error: "결제 내역이 존재해 삭제할 수 없습니다. 결제를 먼저 정리해 주세요.",
    };
  }
  if ((batchCount ?? 0) > 0) {
    return {
      ok: false,
      error: "배치에 포함된 주문은 삭제할 수 없습니다. 배치에서 제거해 주세요.",
    };
  }

  const { error } = await service
    .from("orders")
    .delete()
    .eq("id", params.orderId);

  if (error) {
    console.error("[orders] delete failed", error);
    return { ok: false, error: "주문 삭제에 실패했습니다." };
  }

  console.warn(
    `[orders] DELETED id=${params.orderId} by=${admin.adminId}`
  );

  revalidatePath("/admin/orders");
  return { ok: true };
}

// ── 카드 상세 정보 수정 ────────────────────────────────────────────────────
// 어드민 주문 상세 페이지 / 카드 정보 작성 탭에서 카드 본문을 편집.
// 카드 별명(card_name) 컬럼은 013 마이그레이션으로 제거됨.
// 자동 승격: 부모 주문이 CARD_DELIVERY_PENDING 이고, 같은 주문의 모든 카드에
// 필수 필드(영문명·세트·번호·연도)가 채워지면 CARD_RECEIVED 로 자동 전이.

export type UpdateCardDetailsInput = {
  cardId: string;
  englishName?: string;
  setName?: string;
  cardNumber?: string;
  year?: string;
  declaredValue?: number | null;
};

type CardCompletenessRow = {
  english_name: string | null;
  set_name: string | null;
  card_number: string | null;
  year: string | null;
};

function isCardComplete(c: CardCompletenessRow): boolean {
  return (
    !!c.english_name?.trim() &&
    !!c.set_name?.trim() &&
    !!c.card_number?.trim() &&
    !!c.year?.trim()
  );
}

export type UpdateCardDetailsResult =
  | { ok: false; error: string }
  | { ok: true; promoted: boolean };

export async function updateCardDetailsAction(
  input: UpdateCardDetailsInput
): Promise<UpdateCardDetailsResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, error: "관리자 권한이 필요합니다." };
  }
  if (!canInputData(admin.adminRole)) {
    return { ok: false, error: "매장 계정은 카드 정보를 수정할 수 없습니다." };
  }

  if (!input.cardId) {
    return { ok: false, error: "카드 ID 가 필요합니다." };
  }

  const declared =
    input.declaredValue === undefined || input.declaredValue === null
      ? null
      : Number(input.declaredValue);
  if (declared !== null && (!Number.isFinite(declared) || declared < 0)) {
    return { ok: false, error: "신고가액이 올바르지 않습니다." };
  }

  const service = createServiceClient();
  const { data: updated, error } = await service
    .from("cards")
    .update({
      english_name: input.englishName?.trim() || null,
      set_name: input.setName?.trim() || null,
      card_number: input.cardNumber?.trim() || null,
      year: input.year?.trim() || null,
      declared_value: declared,
    })
    .eq("id", input.cardId)
    .select("order_id")
    .maybeSingle();

  if (error || !updated) {
    console.error("[cards] update details failed", error);
    return { ok: false, error: "카드 정보 수정에 실패했습니다." };
  }

  // 자동 승격 평가
  let promoted = false;
  const orderId = updated.order_id;

  const { data: order, error: oErr } = await service
    .from("orders")
    .select("order_status")
    .eq("id", orderId)
    .maybeSingle();

  if (!oErr && order?.order_status === "CARD_DELIVERY_PENDING") {
    const { data: siblings, error: sErr } = await service
      .from("cards")
      .select("english_name, set_name, card_number, year")
      .eq("order_id", orderId);
    if (!sErr && siblings && siblings.length > 0) {
      const allFilled = siblings.every(isCardComplete);
      if (allFilled) {
        const nowIso = new Date().toISOString();
        const { error: pErr } = await service
          .from("orders")
          .update({
            order_status: "CARD_RECEIVED",
            received_at: nowIso,
          })
          .eq("id", orderId);
        if (pErr) {
          console.warn(
            "[orders] auto-promote to CARD_RECEIVED failed",
            orderId,
            pErr
          );
        } else {
          await service
            .from("order_status_logs")
            .update({
              changed_by: admin.adminId,
              change_reason: "카드 정보 입력 완료로 자동 접수 완료",
            })
            .eq("order_id", orderId)
            .eq("new_status", "CARD_RECEIVED")
            .is("changed_by", null);
          promoted = true;
        }
      }
    }
  }

  revalidatePath("/admin/orders");
  if (promoted) revalidatePath(`/admin/orders/${orderId}`);
  return { ok: true, promoted };
}

// ── 현장 결제 완료 처리 ────────────────────────────────────────────────────
// 매장 직원이 ONSITE 주문의 현금/카드 결제를 받아 처리. 결제 완료 단계로 승격.
// 흐름: payment_status=PENDING + order_status=PAYMENT_PENDING
//       → payments row 추가 + payment_status=PAID + order_status=CARD_DELIVERY_PENDING.

export async function completeOnsitePaymentAction(params: {
  orderId: string;
}): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "관리자 권한이 필요합니다." };
  if (!canInputData(admin.adminRole)) {
    return { ok: false, error: "매장 계정은 결제 처리를 할 수 없습니다." };
  }
  if (!params.orderId) {
    return { ok: false, error: "주문번호가 필요합니다." };
  }

  const service = createServiceClient();
  const { data: order, error: fErr } = await service
    .from("orders")
    .select(
      "id, prepaid_amount, payment_status, order_status, cancelled_at"
    )
    .eq("id", params.orderId)
    .maybeSingle();

  if (fErr || !order) {
    return { ok: false, error: "주문을 찾을 수 없습니다." };
  }
  if (order.cancelled_at) {
    return { ok: false, error: "취소된 주문은 결제할 수 없습니다." };
  }
  if (order.payment_status !== "PENDING") {
    return {
      ok: false,
      error: `현재 결제 상태(${order.payment_status})에서는 결제 완료 처리할 수 없습니다.`,
    };
  }

  const nowIso = new Date().toISOString();
  const { error: payErr } = await service.from("payments").insert({
    order_id: order.id,
    payment_type: "PREPAYMENT",
    amount: order.prepaid_amount,
    payment_method: "현장결제",
    status: "COMPLETED",
    paid_at: nowIso,
  });
  if (payErr) {
    console.error("[orders] onsite payment insert failed", payErr);
    return { ok: false, error: "결제 기록 저장에 실패했습니다." };
  }

  const orderUpdate: {
    payment_status: "PAID";
    order_status?: "CARD_DELIVERY_PENDING";
  } = { payment_status: "PAID" };
  if (order.order_status === "PAYMENT_PENDING") {
    orderUpdate.order_status = "CARD_DELIVERY_PENDING";
  }

  const { error: updErr } = await service
    .from("orders")
    .update(orderUpdate)
    .eq("id", order.id);

  if (updErr) {
    console.error("[orders] onsite payment status update failed", updErr);
    return { ok: false, error: "결제 상태 갱신에 실패했습니다." };
  }

  console.info(
    `[orders] onsite-payment completed id=${order.id} by=${admin.adminId}`
  );

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${order.id}`);
  revalidatePath("/mypage/orders");
  return { ok: true };
}

// ── 일괄 결제 완료 처리 ─────────────────────────────────────────────────────
export type BulkCompleteOnsitePaymentResult =
  | { ok: false; error: string }
  | { ok: true; processedCount: number };

export async function bulkCompleteOnsitePaymentAction(params: {
  orderIds: string[];
}): Promise<BulkCompleteOnsitePaymentResult> {
  const ids = Array.from(new Set((params.orderIds ?? []).filter(Boolean)));
  if (ids.length === 0) {
    return { ok: false, error: "결제 처리할 주문을 선택해 주세요." };
  }
  let processedCount = 0;
  for (const orderId of ids) {
    const r = await completeOnsitePaymentAction({ orderId });
    if (r.ok) processedCount += 1;
  }
  if (processedCount === 0) {
    return { ok: false, error: "처리할 수 있는 주문이 없습니다." };
  }
  return { ok: true, processedCount };
}

// ── 일괄 출고 처리 ─────────────────────────────────────────────────────────
// 접수 완료(CARD_RECEIVED) → 출고(SHIPPED_OUT) 전이.

export type BulkShipOutResult =
  | { ok: false; error: string }
  | { ok: true; processedCount: number };

export async function bulkShipOutOrdersAction(params: {
  orderIds: string[];
}): Promise<BulkShipOutResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "관리자 권한이 필요합니다." };
  if (!canInputData(admin.adminRole)) {
    return { ok: false, error: "매장 계정은 출고 처리를 할 수 없습니다." };
  }

  const ids = Array.from(new Set((params.orderIds ?? []).filter(Boolean)));
  if (ids.length === 0) {
    return { ok: false, error: "출고할 주문을 선택해 주세요." };
  }

  const service = createServiceClient();

  const { data: targets, error: fErr } = await service
    .from("orders")
    .select("id")
    .in("id", ids)
    .eq("order_status", "CARD_RECEIVED")
    .is("cancelled_at", null);

  if (fErr) {
    console.error("[orders] bulk ship-out lookup failed", fErr);
    return {
      ok: false,
      error: `주문 조회에 실패했습니다: ${fErr.message ?? "원인 미상"}`,
    };
  }
  const targetIds = (targets ?? []).map((r) => r.id);
  if (targetIds.length === 0) {
    return {
      ok: false,
      error: "접수 완료 상태의 주문이 없습니다.",
    };
  }

  // 출고 시각은 BEFORE 트리거 fn_stamp_shipped_out_at 가 자동 기록하므로 명시 SET 생략.
  const { error } = await service
    .from("orders")
    .update({ order_status: "SHIPPED_OUT" })
    .in("id", targetIds);
  if (error) {
    console.error("[orders] bulk ship-out failed", error);
    return {
      ok: false,
      error: `출고 처리에 실패했습니다: ${error.message ?? "원인 미상"}`,
    };
  }

  await service
    .from("order_status_logs")
    .update({ changed_by: admin.adminId })
    .in("order_id", targetIds)
    .eq("new_status", "SHIPPED_OUT")
    .is("changed_by", null);

  revalidatePath("/admin/orders");
  return { ok: true, processedCount: targetIds.length };
}

// ── 일괄 입고 처리 ─────────────────────────────────────────────────────────
// 등급 확정(GRADE_CONFIRMED) → 트레이너스 도착(TRAINERS_ARRIVED) 전이.

export type BulkArriveResult =
  | { ok: false; error: string }
  | { ok: true; processedCount: number };

export async function bulkArriveOrdersAction(params: {
  orderIds: string[];
}): Promise<BulkArriveResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "관리자 권한이 필요합니다." };
  if (!canInputData(admin.adminRole)) {
    return { ok: false, error: "매장 계정은 입고 처리를 할 수 없습니다." };
  }

  const ids = Array.from(new Set((params.orderIds ?? []).filter(Boolean)));
  if (ids.length === 0) {
    return { ok: false, error: "입고 처리할 주문을 선택해 주세요." };
  }

  const service = createServiceClient();

  const { data: targets, error: fErr } = await service
    .from("orders")
    .select("id")
    .in("id", ids)
    .eq("order_status", "GRADE_CONFIRMED")
    .is("cancelled_at", null);

  if (fErr) {
    console.error("[orders] bulk arrive lookup failed", fErr);
    return {
      ok: false,
      error: `주문 조회에 실패했습니다: ${fErr.message ?? "원인 미상"}`,
    };
  }
  const targetIds = (targets ?? []).map((r) => r.id);
  if (targetIds.length === 0) {
    return {
      ok: false,
      error: "등급 확정 상태의 주문이 없습니다.",
    };
  }

  const { error } = await service
    .from("orders")
    .update({ order_status: "TRAINERS_ARRIVED" })
    .in("id", targetIds);
  if (error) {
    console.error("[orders] bulk arrive failed", error);
    return {
      ok: false,
      error: `입고 처리에 실패했습니다: ${error.message ?? "원인 미상"}`,
    };
  }

  await service
    .from("order_status_logs")
    .update({ changed_by: admin.adminId })
    .in("order_id", targetIds)
    .eq("new_status", "TRAINERS_ARRIVED")
    .is("changed_by", null);

  revalidatePath("/admin/orders");
  return { ok: true, processedCount: targetIds.length };
}

// ── 카드 등급 확정 취소 ──────────────────────────────────────────────────
// 등급 확정 내역 탭에서 호출. cards.grade_result 를 NULL 로 되돌리고,
// 부모 주문 상태가 'GRADE_CONFIRMED' 인 경우에 한해 'DISTRIBUTOR_SHIPPED' 로 되돌림.
// 주문이 이미 더 뒤 단계(TRAINERS_ARRIVED 등)로 진행되었다면 상태는 건드리지 않음.

export async function clearCardGradeAction(params: {
  cardId: string;
}): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, error: "관리자 권한이 필요합니다." };
  }
  if (!canInputData(admin.adminRole)) {
    return { ok: false, error: "매장 계정은 등급을 수정할 수 없습니다." };
  }
  if (!params.cardId) {
    return { ok: false, error: "카드 ID 가 필요합니다." };
  }

  const service = createServiceClient();
  const { data: cleared, error } = await service
    .from("cards")
    .update({ grade_result: null, serial_number: null })
    .eq("id", params.cardId)
    .select("order_id")
    .maybeSingle();

  if (error || !cleared) {
    console.error("[cards] clear grade failed", error);
    return { ok: false, error: "등급 확정 취소에 실패했습니다." };
  }

  const orderId = cleared.order_id;

  // 같은 주문의 나머지 카드 중 serial_number 가 NULL/빈값인 게 하나라도 있는지 확인
  const { data: siblings, error: sErr } = await service
    .from("cards")
    .select("serial_number")
    .eq("order_id", orderId);

  if (!sErr && siblings) {
    const hasUngraded = siblings.some(
      (c) => !c.serial_number || c.serial_number.trim().length === 0
    );

    if (hasUngraded) {
      // 주문 상태가 GRADE_CONFIRMED 일 때만 DISTRIBUTOR_SHIPPED 로 되돌림
      const { data: order, error: oErr } = await service
        .from("orders")
        .select("order_status")
        .eq("id", orderId)
        .maybeSingle();

      if (!oErr && order?.order_status === "GRADE_CONFIRMED") {
        const { error: rErr } = await service
          .from("orders")
          .update({ order_status: "DISTRIBUTOR_SHIPPED" })
          .eq("id", orderId);
        if (rErr) {
          console.warn("[cards] revert order to DISTRIBUTOR_SHIPPED failed", rErr);
        } else {
          await service
            .from("order_status_logs")
            .update({
              changed_by: admin.adminId,
              change_reason: "일련번호 확정 취소로 자동 되돌림",
            })
            .eq("order_id", orderId)
            .eq("new_status", "DISTRIBUTOR_SHIPPED")
            .is("changed_by", null);
          revalidatePath("/admin/orders");
          revalidatePath(`/admin/orders/${orderId}`);
        }
      }
    }
  }

  revalidatePath("/admin/grading");
  return { ok: true };
}

// ── 오버차지 설정 ─────────────────────────────────────────────────────────
// 오버차지 금액 입력 → orders.overcharge_amount + payment_status 전환.
// amount > 0: OVERCHARGE_PENDING / amount = 0: 기존 결제 상태 유지 (취소 의도).

export async function setOverchargeAction(params: {
  orderId: string;
  amount: number;
}): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, error: "관리자 권한이 필요합니다." };
  }
  if (!canInputData(admin.adminRole)) {
    return { ok: false, error: "매장 계정은 오버차지를 설정할 수 없습니다." };
  }
  if (!params.orderId) {
    return { ok: false, error: "주문번호가 필요합니다." };
  }
  if (!Number.isFinite(params.amount) || params.amount < 0) {
    return { ok: false, error: "유효한 금액을 입력해 주세요." };
  }

  const service = createServiceClient();
  const updates: Record<string, unknown> = {
    overcharge_amount: params.amount > 0 ? params.amount : null,
  };
  if (params.amount > 0) {
    updates.payment_status = "OVERCHARGE_PENDING";
  }

  const { error } = await service
    .from("orders")
    .update(updates)
    .eq("id", params.orderId);

  if (error) {
    console.error("[orders] overcharge update failed", error);
    return { ok: false, error: "오버차지 설정에 실패했습니다." };
  }

  revalidatePath("/admin/overcharges");
  revalidatePath(`/admin/orders/${params.orderId}`);
  return { ok: true };
}

// 결제 안내 발송 — 실제 알림톡/이메일 연동 전까지는 상태만 유지하고 로그만 남김.
// (PWA Push milestone에는 overcharge가 없으므로 별도 outbox enqueue도 생략)
export async function notifyOverchargeAction(params: {
  orderId: string;
}): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, error: "관리자 권한이 필요합니다." };
  }
  if (!canInputData(admin.adminRole)) {
    return { ok: false, error: "매장 계정은 결제 안내를 보낼 수 없습니다." };
  }
  if (!params.orderId) {
    return { ok: false, error: "주문번호가 필요합니다." };
  }

  // 안내 발송 채널 연동 전까지 dry-run 로그만 기록.
  console.info(
    `[overcharge] notify (stub) orderId=${params.orderId} by=${admin.adminId}`
  );
  return { ok: true };
}

// ── 회원 차단 토글 ─────────────────────────────────────────────────────────

export async function toggleUserBlockAction(params: {
  userId: string;
  blocked: boolean;
  reason?: string;
}): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, error: "관리자 권한이 필요합니다." };
  }
  if (!canInputData(admin.adminRole)) {
    return { ok: false, error: "매장 계정은 회원 상태를 변경할 수 없습니다." };
  }
  if (!params.userId) {
    return { ok: false, error: "회원 ID가 필요합니다." };
  }

  const service = createServiceClient();
  const reason = params.reason?.trim();

  const { error } = await service
    .from("profiles")
    .update({
      is_blocked: params.blocked,
      block_reason: params.blocked ? reason || "관리자 차단" : null,
    })
    .eq("id", params.userId);

  if (error) {
    console.error("[profiles] block toggle failed", error);
    return { ok: false, error: "회원 상태 변경에 실패했습니다." };
  }

  revalidatePath("/admin/users");
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════════════
// 서비스 가격표 관리 (SUPER_ADMIN 전용)
// ═══════════════════════════════════════════════════════════════════════

function isSuperAdmin(role: AdminRole | null | undefined): role is "SUPER_ADMIN" {
  return role === "SUPER_ADMIN";
}

export type UpsertGradingServiceInput = {
  /** undefined 면 신규 생성, 있으면 기존 행 갱신 */
  id?: string;
  company: GradingCompany;
  code: string;
  name: string;
  price: number;
  estimatedDays: string;
  description?: string;
  isActive?: boolean;
  sortOrder?: number;
  transitDays?: number;
};

export async function upsertGradingServiceAction(
  input: UpsertGradingServiceInput
): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "관리자 권한이 필요합니다." };
  if (!isSuperAdmin(admin.adminRole)) {
    return { ok: false, error: "슈퍼관리자만 변경할 수 있습니다." };
  }

  if (!GRADING_COMPANIES_SET.has(input.company)) {
    return { ok: false, error: "허용되지 않은 등급회사입니다." };
  }
  const code = input.code?.trim() ?? "";
  const name = input.name?.trim() ?? "";
  const estimatedDays = input.estimatedDays?.trim() ?? "";
  if (!code || !name || !estimatedDays) {
    return { ok: false, error: "코드/이름/예상 소요기간을 입력해 주세요." };
  }
  if (code.length > 60 || name.length > 100 || estimatedDays.length > 40) {
    return { ok: false, error: "입력값 길이를 확인해 주세요." };
  }
  if (!Number.isFinite(input.price) || input.price < 0) {
    return { ok: false, error: "가격은 0 이상의 숫자여야 합니다." };
  }

  const service = createServiceClient();
  const payload = {
    company: input.company,
    code,
    name,
    price: Math.round(input.price),
    estimated_days: estimatedDays,
    description: input.description?.trim() || null,
    is_active: input.isActive ?? true,
    sort_order: input.sortOrder ?? 0,
    transit_days: input.transitDays ?? 7,
  };

  if (input.id) {
    const { error } = await service
      .from("grading_services")
      .update(payload)
      .eq("id", input.id);
    if (error) {
      console.error("[grading_services] update failed", error);
      if (error.code === "23505") {
        return { ok: false, error: "같은 회사에 동일 코드가 이미 존재합니다." };
      }
      return { ok: false, error: "서비스 수정에 실패했습니다." };
    }
  } else {
    const { error } = await service.from("grading_services").insert(payload);
    if (error) {
      console.error("[grading_services] insert failed", error);
      if (error.code === "23505") {
        return { ok: false, error: "같은 회사에 동일 코드가 이미 존재합니다." };
      }
      return { ok: false, error: "서비스 생성에 실패했습니다." };
    }
  }

  revalidatePath("/admin/settings");
  return { ok: true };
}

export async function toggleGradingServiceActiveAction(params: {
  id: string;
  isActive: boolean;
}): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "관리자 권한이 필요합니다." };
  if (!isSuperAdmin(admin.adminRole)) {
    return { ok: false, error: "슈퍼관리자만 변경할 수 있습니다." };
  }
  if (!params.id) return { ok: false, error: "서비스 ID 가 필요합니다." };

  const service = createServiceClient();
  const { error } = await service
    .from("grading_services")
    .update({ is_active: params.isActive })
    .eq("id", params.id);

  if (error) {
    console.error("[grading_services] toggle active failed", error);
    return { ok: false, error: "활성 상태 변경에 실패했습니다." };
  }
  revalidatePath("/admin/settings");
  return { ok: true };
}

export async function deleteGradingServiceAction(params: {
  id: string;
}): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "관리자 권한이 필요합니다." };
  if (!isSuperAdmin(admin.adminRole)) {
    return { ok: false, error: "슈퍼관리자만 삭제할 수 있습니다." };
  }
  if (!params.id) return { ok: false, error: "서비스 ID 가 필요합니다." };

  const service = createServiceClient();
  const { error } = await service
    .from("grading_services")
    .delete()
    .eq("id", params.id);

  if (error) {
    console.error("[grading_services] delete failed", error);
    return {
      ok: false,
      error:
        "삭제에 실패했습니다. 진행 중인 주문이 참조 중일 수 있어 비활성화 토글을 권장합니다.",
    };
  }
  revalidatePath("/admin/settings");
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════════════
// 관리자 계정 관리 (SUPER_ADMIN 전용)
// 009 마이그레이션 이후 슈퍼관리자가 직접 관리자 추가/삭제, 본인이 비밀번호 변경
// ═══════════════════════════════════════════════════════════════════════

const DEFAULT_ADMIN_PASSWORD = "000000";
const FAKE_EMAIL_DOMAIN = "admin.trainers.local";

const NICKNAME_RE = /^[A-Za-z0-9가-힣_.-]{2,30}$/;

export async function createAdminUserAction(params: {
  nickname: string;
  name: string;
  role: AdminRole;
}): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "관리자 권한이 필요합니다." };
  if (!isSuperAdmin(admin.adminRole)) {
    return { ok: false, error: "슈퍼관리자만 관리자를 추가할 수 있습니다." };
  }

  const nickname = params.nickname?.trim() ?? "";
  const name = params.name?.trim() ?? "";
  if (!nickname || !name) {
    return { ok: false, error: "닉네임과 이름을 입력해 주세요." };
  }
  if (!NICKNAME_RE.test(nickname)) {
    return {
      ok: false,
      error: "닉네임은 2~30자, 영문/숫자/한글/_-. 만 허용됩니다.",
    };
  }
  if (!isAdminRole(params.role)) {
    return { ok: false, error: "유효한 역할을 선택해 주세요." };
  }

  const service = createServiceClient();

  // 닉네임 중복 사전 검사 (UNIQUE 제약 backstop)
  const { data: dup, error: dupErr } = await service
    .from("admin_users")
    .select("id")
    .eq("nickname", nickname)
    .maybeSingle();
  if (dupErr) {
    console.error("[admin_users] nickname dup check failed", dupErr);
    return { ok: false, error: "닉네임 중복 확인에 실패했습니다." };
  }
  if (dup) {
    return { ok: false, error: "이미 사용 중인 닉네임입니다." };
  }

  // 가짜 이메일 — Supabase Auth 매핑용 (실제 메일링 불가, 운영자 인지 불필요)
  const fakeEmail = `${crypto.randomUUID()}@${FAKE_EMAIL_DOMAIN}`;

  // service.auth.admin.createUser — Supabase 비밀번호 정책을 우회하므로 '000000' 6자도 통과
  const { data: created, error: authErr } = await service.auth.admin.createUser(
    {
      email: fakeEmail,
      password: DEFAULT_ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { name, nickname, role: params.role },
    }
  );

  if (authErr || !created?.user) {
    console.error("[admin_users] auth.admin.createUser failed", authErr);
    return {
      ok: false,
      error: `Supabase Auth 사용자 생성 실패: ${authErr?.message ?? "원인 미상"}`,
    };
  }

  const now = new Date().toISOString();
  const { error: insErr } = await service.from("admin_users").insert({
    email: fakeEmail,
    name,
    nickname,
    role: params.role,
    user_id: created.user.id,
    is_active: true,
    status: "APPROVED",
    requested_at: now,
    approved_at: now,
    approved_by: admin.adminId,
  });

  if (insErr) {
    console.error("[admin_users] insert failed", insErr);
    // 보상: auth.users 삭제 (orphan 방지)
    await service.auth.admin.deleteUser(created.user.id).catch(() => {});
    if (insErr.code === "23505") {
      return { ok: false, error: "닉네임 또는 이메일이 이미 사용 중입니다." };
    }
    return { ok: false, error: "관리자 계정 저장에 실패했습니다." };
  }

  console.info(
    `[admin_users] created nickname=${nickname} role=${params.role} by=${admin.adminId}`
  );

  revalidatePath("/admin/settings");
  revalidatePath("/admin/login");
  return { ok: true };
}

export async function deleteAdminUserAction(params: {
  adminId: string;
}): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "관리자 권한이 필요합니다." };
  if (!isSuperAdmin(admin.adminRole)) {
    return { ok: false, error: "슈퍼관리자만 삭제할 수 있습니다." };
  }
  if (!params.adminId) return { ok: false, error: "관리자 ID 가 필요합니다." };
  if (params.adminId === admin.adminId) {
    return { ok: false, error: "본인 계정은 삭제할 수 없습니다." };
  }

  const service = createServiceClient();
  const { data: row, error: lErr } = await service
    .from("admin_users")
    .select("id, user_id")
    .eq("id", params.adminId)
    .maybeSingle();
  if (lErr || !row) {
    return { ok: false, error: "관리자 계정을 찾을 수 없습니다." };
  }

  const { error: dErr } = await service
    .from("admin_users")
    .delete()
    .eq("id", params.adminId);
  if (dErr) {
    console.error("[admin_users] delete failed", dErr);
    return { ok: false, error: "관리자 계정 삭제에 실패했습니다." };
  }

  // auth.users 도 함께 제거 (세션 즉시 무효화)
  if (row.user_id) {
    const { error: aErr } = await service.auth.admin.deleteUser(row.user_id);
    if (aErr) {
      console.warn("[admin_users] auth.admin.deleteUser failed (non-fatal)", aErr);
    }
  }

  revalidatePath("/admin/settings");
  revalidatePath("/admin/login");
  return { ok: true };
}

export async function resetAdminPasswordAction(params: {
  adminId: string;
}): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "관리자 권한이 필요합니다." };
  if (!isSuperAdmin(admin.adminRole)) {
    return { ok: false, error: "슈퍼관리자만 비밀번호를 초기화할 수 있습니다." };
  }
  if (!params.adminId) return { ok: false, error: "관리자 ID 가 필요합니다." };

  const service = createServiceClient();
  const { data: row, error: lErr } = await service
    .from("admin_users")
    .select("user_id")
    .eq("id", params.adminId)
    .maybeSingle();
  if (lErr || !row?.user_id) {
    return { ok: false, error: "관리자 계정을 찾을 수 없습니다." };
  }

  const { error } = await service.auth.admin.updateUserById(row.user_id, {
    password: DEFAULT_ADMIN_PASSWORD,
  });
  if (error) {
    console.error("[admin_users] reset password failed", error);
    return { ok: false, error: `비밀번호 초기화 실패: ${error.message}` };
  }
  revalidatePath("/admin/settings");
  return { ok: true };
}

export async function changeMyAdminPasswordAction(params: {
  currentPassword: string;
  newPassword: string;
}): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "관리자 권한이 필요합니다." };

  const current = params.currentPassword ?? "";
  const next = params.newPassword ?? "";
  if (!current || !next) {
    return { ok: false, error: "현재 비밀번호와 새 비밀번호를 입력해 주세요." };
  }
  if (next.length < 6) {
    return { ok: false, error: "새 비밀번호는 6자 이상이어야 합니다." };
  }
  if (current === next) {
    return { ok: false, error: "새 비밀번호가 현재 비밀번호와 동일합니다." };
  }

  const service = createServiceClient();

  // 현재 비밀번호 검증 — admin.email 로 signInWithPassword 시뮬레이션
  // (별도 세션 — 현재 로그인 세션은 건드리지 않음)
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const probe = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInErr } = await probe.auth.signInWithPassword({
    email: admin.email,
    password: current,
  });
  if (signInErr) {
    return { ok: false, error: "현재 비밀번호가 일치하지 않습니다." };
  }

  const { error } = await service.auth.admin.updateUserById(admin.authUserId, {
    password: next,
  });
  if (error) {
    console.error("[admin_users] self password change failed", error);
    return { ok: false, error: `비밀번호 변경 실패: ${error.message}` };
  }

  return { ok: true };
}

export async function updateAdminRoleAction(params: {
  adminId: string;
  role: AdminRole;
}): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "관리자 권한이 필요합니다." };
  if (!isSuperAdmin(admin.adminRole)) {
    return { ok: false, error: "슈퍼관리자만 역할을 변경할 수 있습니다." };
  }
  if (!params.adminId) return { ok: false, error: "관리자 ID 가 필요합니다." };
  if (!isAdminRole(params.role)) {
    return { ok: false, error: "유효한 역할을 선택해 주세요." };
  }
  if (params.adminId === admin.adminId && params.role !== "SUPER_ADMIN") {
    return { ok: false, error: "본인의 슈퍼관리자 역할은 해제할 수 없습니다." };
  }

  const service = createServiceClient();
  const { error } = await service
    .from("admin_users")
    .update({ role: params.role })
    .eq("id", params.adminId)
    .eq("status", "APPROVED");

  if (error) {
    console.error("[admin_users] role update failed", error);
    return { ok: false, error: "역할 변경에 실패했습니다." };
  }
  revalidatePath("/admin/settings");
  return { ok: true };
}

export async function toggleAdminActiveAction(params: {
  adminId: string;
  isActive: boolean;
}): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "관리자 권한이 필요합니다." };
  if (!isSuperAdmin(admin.adminRole)) {
    return { ok: false, error: "슈퍼관리자만 변경할 수 있습니다." };
  }
  if (!params.adminId) return { ok: false, error: "관리자 ID 가 필요합니다." };
  if (params.adminId === admin.adminId && !params.isActive) {
    return { ok: false, error: "본인 계정은 비활성화할 수 없습니다." };
  }

  const service = createServiceClient();
  const { error } = await service
    .from("admin_users")
    .update({ is_active: params.isActive })
    .eq("id", params.adminId)
    .eq("status", "APPROVED");

  if (error) {
    console.error("[admin_users] toggle active failed", error);
    return { ok: false, error: "활성 상태 변경에 실패했습니다." };
  }
  revalidatePath("/admin/settings");
  return { ok: true };
}

// ── 내 프로필 (닉네임/이름) 수정 ───────────────────────────────────────────
// /admin/my-account 에서 호출. 본인 행만 갱신.
// 닉네임 변경 시 UNIQUE 충돌 사전 검사.

export async function updateMyAdminProfileAction(params: {
  nickname: string;
  name: string;
}): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "관리자 권한이 필요합니다." };

  const nickname = params.nickname?.trim() ?? "";
  const name = params.name?.trim() ?? "";
  if (!nickname || !name) {
    return { ok: false, error: "닉네임과 이름을 입력해 주세요." };
  }
  if (!NICKNAME_RE.test(nickname)) {
    return {
      ok: false,
      error: "닉네임은 2~30자, 영문/숫자/한글/_-. 만 허용됩니다.",
    };
  }

  const service = createServiceClient();

  // 닉네임이 본인 외 다른 행에 사용 중인지 확인
  const { data: dup, error: dupErr } = await service
    .from("admin_users")
    .select("id")
    .eq("nickname", nickname)
    .neq("id", admin.adminId)
    .maybeSingle();
  if (dupErr) {
    console.error("[admin_users] nickname dup check failed", dupErr);
    return { ok: false, error: "닉네임 중복 확인에 실패했습니다." };
  }
  if (dup) {
    return { ok: false, error: "이미 사용 중인 닉네임입니다." };
  }

  const { error } = await service
    .from("admin_users")
    .update({ nickname, name })
    .eq("id", admin.adminId);

  if (error) {
    console.error("[admin_users] self profile update failed", error);
    if (error.code === "23505") {
      return { ok: false, error: "이미 사용 중인 닉네임입니다." };
    }
    return { ok: false, error: "프로필 변경에 실패했습니다." };
  }

  revalidatePath("/admin/my-account");
  revalidatePath("/admin/settings");
  revalidatePath("/admin/login");
  return { ok: true };
}

// 택배 발송 관리 — TRAINERS_ARRIVED + pickup_method=DELIVERY 인 주문에 송장번호 기록.
// 권한: SUPER_ADMIN / GENERAL_ADMIN (canInputData) — STORE_SHARED 는 조회만.
export async function setUserTrackingNumberAction(params: {
  orderId: string;
  trackingNumber: string;
}): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, error: "관리자 권한이 필요합니다." };
  }
  if (!canInputData(admin.adminRole)) {
    return { ok: false, error: "송장번호 입력 권한이 없습니다." };
  }

  if (!params.orderId) {
    return { ok: false, error: "주문번호가 필요합니다." };
  }
  const trackingNumber = params.trackingNumber.trim();
  if (!trackingNumber) {
    return { ok: false, error: "송장번호를 입력해주세요." };
  }
  if (trackingNumber.length > 50) {
    return { ok: false, error: "송장번호는 50자 이하로 입력해주세요." };
  }

  const service = createServiceClient();

  // 대상 주문의 합배송 묶음 확인 — 묶음이 있으면 묶음 전 주문에 송장번호 일괄 적용.
  const { data: target, error: tErr } = await service
    .from("orders")
    .select("id, shipment_group_id")
    .eq("id", params.orderId)
    .maybeSingle();
  if (tErr || !target) {
    if (tErr) {
      console.error("[orders] setUserTrackingNumberAction lookup failed", tErr);
    }
    return { ok: false, error: "주문을 찾을 수 없습니다." };
  }

  // 조건부 UPDATE — TRAINERS_ARRIVED + DELIVERY 상태에서만 허용.
  // 합배송 묶음(shipment_group_id)이 있으면 묶음 전체, 없으면 해당 주문만.
  const { data, error } = await (target.shipment_group_id
    ? service
        .from("orders")
        .update({ user_tracking_number: trackingNumber })
        .eq("shipment_group_id", target.shipment_group_id)
        .eq("order_status", "TRAINERS_ARRIVED")
        .eq("pickup_method", "DELIVERY")
        .select("id")
    : service
        .from("orders")
        .update({ user_tracking_number: trackingNumber })
        .eq("id", params.orderId)
        .eq("order_status", "TRAINERS_ARRIVED")
        .eq("pickup_method", "DELIVERY")
        .select("id"));

  if (error) {
    console.error("[orders] setUserTrackingNumberAction failed", error);
    return { ok: false, error: "송장번호 저장에 실패했습니다." };
  }
  if (!data || data.length === 0) {
    return {
      ok: false,
      error: "해당 주문이 택배 발송 대상이 아니거나 상태가 변경되었습니다.",
    };
  }

  // 송장 최초 입력 시각 기록 — 5일 후 자동 수령완료의 기준 시각.
  // user_shipped_at 이 NULL 인 주문에만 기록 → 송장 수정 시 타이머 유지.
  const { error: shippedAtErr } = await (target.shipment_group_id
    ? service
        .from("orders")
        .update({ user_shipped_at: new Date().toISOString() })
        .eq("shipment_group_id", target.shipment_group_id)
        .is("user_shipped_at", null)
    : service
        .from("orders")
        .update({ user_shipped_at: new Date().toISOString() })
        .eq("id", params.orderId)
        .is("user_shipped_at", null));
  if (shippedAtErr) {
    console.error("[orders] user_shipped_at 기록 실패", shippedAtErr);
  }

  revalidatePath("/admin/batches");
  revalidatePath(`/admin/orders/${params.orderId}`);
  return { ok: true };
}

// ── 매장 수령 완료 ────────────────────────────────────────────────────────
// 매장 방문 수령(STORE_PICKUP) + 트레이너스 도착(TRAINERS_ARRIVED) 주문을
// 수령 완료(COMPLETED)로 전환. /admin/orders 의 "수령 완료" 탭에서 호출.
export async function completePickupOrderAction(params: {
  orderId: string;
}): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, error: "관리자 권한이 필요합니다." };
  }
  if (!canInputData(admin.adminRole)) {
    return { ok: false, error: "수령 완료 처리 권한이 없습니다." };
  }
  if (!params.orderId) {
    return { ok: false, error: "주문번호가 필요합니다." };
  }

  const service = createServiceClient();

  // 조건부 UPDATE — TRAINERS_ARRIVED + STORE_PICKUP + 미취소에서만 허용.
  const { data, error } = await service
    .from("orders")
    .update({ order_status: "COMPLETED" })
    .eq("id", params.orderId)
    .eq("order_status", "TRAINERS_ARRIVED")
    .eq("pickup_method", "STORE_PICKUP")
    .is("cancelled_at", null)
    .select("id");

  if (error) {
    console.error("[orders] completePickupOrderAction failed", error);
    return { ok: false, error: "수령 완료 처리에 실패했습니다." };
  }
  if (!data || data.length === 0) {
    return {
      ok: false,
      error: "해당 주문이 매장 수령 완료 대상이 아니거나 상태가 변경되었습니다.",
    };
  }

  // 상태 로그 changed_by 보강
  await service
    .from("order_status_logs")
    .update({ changed_by: admin.adminId })
    .eq("order_id", params.orderId)
    .eq("new_status", "COMPLETED")
    .is("changed_by", null);

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${params.orderId}`);
  return { ok: true };
}

// ── 카드 앞면 이미지 업로드 / 삭제 ─────────────────────────────────────────
// 카드 정보 작성 탭에서 카드 앞면 사진을 Supabase Storage(card-images 공개 버킷)에
// 올리고 cards.front_image_url 에 public URL 을 저장한다.
// 앞면 이미지는 선택 항목 — 카드 입력 완료 자동 승격 판정에는 영향을 주지 않는다.

const CARD_IMAGE_BUCKET = "card-images";

// MIME → 확장자 매핑 (허용 포맷)
const CARD_IMAGE_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
};

const CARD_IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10MB

// public URL 에서 버킷 내부 경로(`{cardId}/front-...`)를 추출한다.
function extractCardImagePath(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/${CARD_IMAGE_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}

export type UploadCardFrontImageResult =
  | { ok: false; error: string }
  | { ok: true; url: string };

export async function uploadCardFrontImageAction(
  formData: FormData
): Promise<UploadCardFrontImageResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, error: "관리자 권한이 필요합니다." };
  }
  if (!canInputData(admin.adminRole)) {
    return { ok: false, error: "매장 계정은 카드 정보를 수정할 수 없습니다." };
  }

  const cardId = formData.get("cardId");
  const file = formData.get("file");

  if (typeof cardId !== "string" || !cardId) {
    return { ok: false, error: "카드 ID 가 필요합니다." };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "업로드할 이미지를 선택해 주세요." };
  }

  const ext = CARD_IMAGE_EXT[file.type];
  if (!ext) {
    return { ok: false, error: "JPG 또는 PNG 파일만 업로드할 수 있습니다." };
  }
  if (file.size > CARD_IMAGE_MAX_BYTES) {
    return { ok: false, error: "이미지 크기는 10MB 이하여야 합니다." };
  }

  const service = createServiceClient();

  // 대상 카드 조회 — 주문 ID 및 기존 이미지 경로 확보
  const { data: cardRow, error: fErr } = await service
    .from("cards")
    .select("order_id, front_image_url")
    .eq("id", cardId)
    .maybeSingle();
  if (fErr || !cardRow) {
    return { ok: false, error: "카드를 찾을 수 없습니다." };
  }

  const path = `${cardId}/front-${Date.now()}.${ext}`;
  const { error: upErr } = await service.storage
    .from(CARD_IMAGE_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) {
    console.error("[cards] front image upload failed", upErr);
    return { ok: false, error: "이미지 업로드에 실패했습니다." };
  }

  const { data: pub } = service.storage
    .from(CARD_IMAGE_BUCKET)
    .getPublicUrl(path);
  const url = pub.publicUrl;

  const { error: updErr } = await service
    .from("cards")
    .update({ front_image_url: url })
    .eq("id", cardId);
  if (updErr) {
    console.error("[cards] front image url save failed", updErr);
    // 저장 실패 시 방금 올린 파일 롤백 (best-effort)
    await service.storage.from(CARD_IMAGE_BUCKET).remove([path]);
    return { ok: false, error: "이미지 정보 저장에 실패했습니다." };
  }

  // 기존 이미지 파일 정리 (best-effort — 실패해도 무시)
  const prevPath = extractCardImagePath(cardRow.front_image_url);
  if (prevPath && prevPath !== path) {
    const { error: rmErr } = await service.storage
      .from(CARD_IMAGE_BUCKET)
      .remove([prevPath]);
    if (rmErr) {
      console.warn("[cards] previous front image cleanup failed", rmErr);
    }
  }

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${cardRow.order_id}`);
  return { ok: true, url };
}

export async function removeCardFrontImageAction(params: {
  cardId: string;
}): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, error: "관리자 권한이 필요합니다." };
  }
  if (!canInputData(admin.adminRole)) {
    return { ok: false, error: "매장 계정은 카드 정보를 수정할 수 없습니다." };
  }
  if (!params.cardId) {
    return { ok: false, error: "카드 ID 가 필요합니다." };
  }

  const service = createServiceClient();
  const { data: cardRow, error: fErr } = await service
    .from("cards")
    .select("order_id, front_image_url")
    .eq("id", params.cardId)
    .maybeSingle();
  if (fErr || !cardRow) {
    return { ok: false, error: "카드를 찾을 수 없습니다." };
  }

  const { error: updErr } = await service
    .from("cards")
    .update({ front_image_url: null })
    .eq("id", params.cardId);
  if (updErr) {
    console.error("[cards] front image remove failed", updErr);
    return { ok: false, error: "이미지 삭제에 실패했습니다." };
  }

  // 스토리지 파일 정리 (best-effort)
  const prevPath = extractCardImagePath(cardRow.front_image_url);
  if (prevPath) {
    const { error: rmErr } = await service.storage
      .from(CARD_IMAGE_BUCKET)
      .remove([prevPath]);
    if (rmErr) {
      console.warn("[cards] front image file cleanup failed", rmErr);
    }
  }

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${cardRow.order_id}`);
  return { ok: true };
}
