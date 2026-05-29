// 주문 조회 헬퍼 (Server Component / Server Action 전용)
//
// 권한 정책:
//   - getMyOrders / getMyOrderById: anon 클라이언트 + RLS (auth.uid() = user_id)
//   - getAllOrdersForAdmin / getOrderForAdmin / getOrdersByStatusesForAdmin
//     / getOrdersForUserDelivery / getAllProfilesForAdmin: service-role
//     + requireAdmin() 가드 (호출측 의무)
//
// 변환:
//   DB는 snake_case → 도메인 타입은 camelCase. 단일 매핑 헬퍼 적용.

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { Card, Order, GradingService } from "@/types/order";
import type { User, AdminUser } from "@/types";
import type { Database } from "@/lib/supabase/database.types";

type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
type CardRow = Database["public"]["Tables"]["cards"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type AdminUserRow = Database["public"]["Tables"]["admin_users"]["Row"];
type GradingServiceRow =
  Database["public"]["Tables"]["grading_services"]["Row"];

function mapOrder(r: OrderRow): Order {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    phone: r.phone,
    pickupMethod: r.pickup_method,
    postalCode: r.postal_code ?? undefined,
    deliveryAddress: r.delivery_address ?? undefined,
    deliveryAddressDetail: r.delivery_address_detail ?? undefined,
    addressSource: r.address_source,
    gradingCompany: r.grading_company,
    serviceLevel: r.service_level,
    servicePriceSnapshot: r.service_price_snapshot,
    paymentStatus: r.payment_status,
    prepaidAmount: r.prepaid_amount,
    overchargeAmount: r.overcharge_amount ?? undefined,
    shippingFee: r.shipping_fee,
    orderStatus: r.order_status,
    spoilerPreference: r.spoiler_preference,
    receivedAt: r.received_at ?? undefined,
    shippedOutAt: r.shipped_out_at ?? undefined,
    distributorShippedAt: r.distributor_shipped_at ?? undefined,
    distributorTrackingNumber: r.distributor_tracking_number ?? undefined,
    userTrackingNumber: r.user_tracking_number ?? undefined,
    shipmentGroupId: r.shipment_group_id ?? undefined,
    userShippedAt: r.user_shipped_at ?? undefined,
    customerMemo: r.customer_memo ?? undefined,
    internalMemo: r.internal_memo ?? undefined,
    cancelledAt: r.cancelled_at ?? undefined,
    cancelReason: r.cancel_reason ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapCard(r: CardRow): Card {
  return {
    id: r.id,
    orderId: r.order_id,
    englishName: r.english_name ?? undefined,
    setName: r.set_name ?? undefined,
    cardNumber: r.card_number ?? undefined,
    year: r.year ?? undefined,
    declaredValue: r.declared_value ?? undefined,
    frontImageUrl: r.front_image_url ?? undefined,
    backImageUrl: r.back_image_url ?? undefined,
    conditionPhotoUrl: r.condition_photo_url ?? undefined,
    gradeResult: r.grade_result ?? undefined,
    serialNumber: r.serial_number ?? undefined,
    slabPhotoUrl: r.slab_photo_url ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function getMyOrders(): Promise<Order[]> {
  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];

  // 취소된 주문(cancelled_at IS NOT NULL)은 신청내역에서 숨긴다.
  // 직접 URL 로 접근하는 상세 페이지(getMyOrderById)는 그대로 노출 — 이력 보존.
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("user_id", auth.user.id)
    .is("cancelled_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[orders] getMyOrders failed", error);
    return [];
  }
  return (data ?? []).map(mapOrder);
}

export async function getMyOrderById(
  orderId: string
): Promise<{ order: Order; cards: Card[] } | null> {
  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data: orderRow, error: oErr } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (oErr || !orderRow) {
    if (oErr) console.error("[orders] getMyOrderById order failed", oErr);
    return null;
  }

  const { data: cardRows, error: cErr } = await supabase
    .from("cards")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });

  if (cErr) {
    console.error("[orders] getMyOrderById cards failed", cErr);
    return { order: mapOrder(orderRow), cards: [] };
  }

  return {
    order: mapOrder(orderRow),
    cards: (cardRows ?? []).map(mapCard),
  };
}

// ── Admin (service-role) ─────────────────────────────────────────────────
// 호출측에서 requireAdmin() 가드 후 호출할 것.

export async function getAllOrdersForAdmin(filters?: {
  status?: Order["orderStatus"];
  company?: Order["gradingCompany"];
  /** active = 미취소만 / cancelled = 취소된 것만 / all = 전체 */
  scope?: "active" | "cancelled" | "all";
}): Promise<Order[]> {
  const supabase = createServiceClient();
  let q = supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });

  if (filters?.status) q = q.eq("order_status", filters.status);
  if (filters?.company) q = q.eq("grading_company", filters.company);

  const scope = filters?.scope ?? "active";
  if (scope === "active") q = q.is("cancelled_at", null);
  else if (scope === "cancelled") q = q.not("cancelled_at", "is", null);

  const { data, error } = await q;
  if (error) {
    console.error("[orders] getAllOrdersForAdmin failed", error);
    return [];
  }
  return (data ?? []).map(mapOrder);
}

export async function getOrderForAdmin(
  orderId: string
): Promise<{ order: Order; cards: Card[]; paymentCount: number } | null> {
  const supabase = createServiceClient();

  const { data: orderRow, error: oErr } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();

  if (oErr || !orderRow) {
    if (oErr) console.error("[orders] getOrderForAdmin order failed", oErr);
    return null;
  }

  const [cardsResult, paymentsResult] = await Promise.all([
    supabase
      .from("cards")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true }),
    supabase
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("order_id", orderId),
  ]);

  if (cardsResult.error) {
    console.error("[orders] getOrderForAdmin cards failed", cardsResult.error);
  }
  if (paymentsResult.error) {
    console.error(
      "[orders] getOrderForAdmin payments count failed",
      paymentsResult.error
    );
  }

  return {
    order: mapOrder(orderRow),
    cards: (cardsResult.data ?? []).map(mapCard),
    paymentCount: paymentsResult.count ?? 0,
  };
}

export async function getPaymentCountsForOrders(
  orderIds: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (orderIds.length === 0) return map;
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("payments")
    .select("order_id")
    .in("order_id", orderIds);
  if (error) {
    console.error("[orders] getPaymentCountsForOrders failed", error);
    return map;
  }
  for (const row of data ?? []) {
    map.set(row.order_id, (map.get(row.order_id) ?? 0) + 1);
  }
  return map;
}

export async function getCardsForOrdersForAdmin(
  orderIds: string[]
): Promise<Card[]> {
  if (orderIds.length === 0) return [];
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("cards")
    .select("*")
    .in("order_id", orderIds)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[orders] getCardsForOrdersForAdmin failed", error);
    return [];
  }
  return (data ?? []).map(mapCard);
}

/**
 * 카드 정보 작성 자동완성용 템플릿.
 * 영문명·세트·번호·연도 4개 필수 필드가 모두 채워진 과거 카드들에서
 * 동일 조합을 중복 제거하여 반환한다.
 * 신고가액은 가장 최근 입력값을 함께 제공한다.
 */
export interface CardTemplate {
  englishName: string;
  setName: string;
  cardNumber: string;
  year: string;
  declaredValue?: number;
  frontImageUrl?: string;
}

export async function getCardTemplatesForAdmin(): Promise<CardTemplate[]> {
  const supabase = createServiceClient();
  // 최근 갱신된 카드 우선으로 가져와 중복 제거 시 최신 신고가액·이미지가 반영되게 함.
  const { data, error } = await supabase
    .from("cards")
    .select(
      "english_name, set_name, card_number, year, declared_value, front_image_url, updated_at"
    )
    .not("english_name", "is", null)
    .not("set_name", "is", null)
    .not("card_number", "is", null)
    .not("year", "is", null)
    .order("updated_at", { ascending: false })
    .limit(2000);

  if (error) {
    console.error("[orders] getCardTemplatesForAdmin failed", error);
    return [];
  }

  const seen = new Set<string>();
  const result: CardTemplate[] = [];
  for (const r of data ?? []) {
    const en = r.english_name?.trim();
    const set = r.set_name?.trim();
    const num = r.card_number?.trim();
    const yr = r.year?.trim();
    if (!en || !set || !num || !yr) continue;
    const key = `${en.toLowerCase()}|${set.toLowerCase()}|${num.toLowerCase()}|${yr}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      englishName: en,
      setName: set,
      cardNumber: num,
      year: yr,
      declaredValue: r.declared_value ?? undefined,
      frontImageUrl: r.front_image_url ?? undefined,
    });
  }
  return result;
}

export async function getOrdersByStatusesForAdmin(
  statuses: Order["orderStatus"][]
): Promise<Order[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .in("order_status", statuses)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[orders] getOrdersByStatusesForAdmin failed", error);
    return [];
  }
  return (data ?? []).map(mapOrder);
}

// 택배 발송 관리 — TRAINERS_ARRIVED + pickup_method=DELIVERY 인 주문 일괄 조회.
// 어드민 /admin/batches 페이지에서 사용.
export async function getOrdersForUserDelivery(): Promise<Order[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("order_status", "TRAINERS_ARRIVED")
    .eq("pickup_method", "DELIVERY")
    .is("cancelled_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[orders] getOrdersForUserDelivery failed", error);
    return [];
  }
  return (data ?? []).map(mapOrder);
}

function mapProfile(r: ProfileRow): User {
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    phone: r.phone,
    provider: r.provider,
    phoneVerified: r.phone_verified,
    isBlocked: r.is_blocked,
    blockReason: r.block_reason ?? undefined,
    notificationEnabled: r.notification_enabled,
    marketingEnabled: r.marketing_enabled,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapAdminUser(r: AdminUserRow): AdminUser {
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    nickname: r.nickname,
    role: r.role,
    isActive: r.is_active,
    status: r.status,
    requestedAt: r.requested_at,
    approvedAt: r.approved_at ?? undefined,
    approvedBy: r.approved_by ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/**
 * 로그인 화면 드롭다운용 — 활성 + 승인 상태 관리자의 닉네임 목록만 반환.
 * id 포함 — Client 측에서 nickname 선택 시 식별자로 활용.
 *
 * SECURITY: service_role 키를 사용하므로 RLS 우회. 비로그인 사용자 노출 가능.
 * 호출 지점은 `/admin/login` Server Component 1곳으로만 한정한다. 다른 경로에서
 * 재사용 시 반드시 호출 측에서 권한 검증(requireAdmin 등) 또는 nickname 마스킹을
 * 적용할 것.
 */
export async function getAdminLoginOptions(): Promise<
  { id: string; nickname: string }[]
> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("admin_users")
    .select("id, nickname")
    .eq("is_active", true)
    .eq("status", "APPROVED")
    .order("nickname", { ascending: true });

  if (error) {
    console.error("[orders] getAdminLoginOptions failed", error);
    return [];
  }
  return (data ?? []).map((r) => ({ id: r.id, nickname: r.nickname }));
}

function mapGradingService(r: GradingServiceRow): GradingService {
  return {
    id: r.id,
    company: r.company,
    code: r.code,
    name: r.name,
    price: r.price,
    estimatedDays: r.estimated_days,
    description: r.description ?? undefined,
    isActive: r.is_active,
    sortOrder: r.sort_order,
    transitDays: r.transit_days,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function getAllProfilesForAdmin(): Promise<User[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[orders] getAllProfilesForAdmin failed", error);
    return [];
  }
  return (data ?? []).map(mapProfile);
}

export async function getAllAdminUsersForAdmin(): Promise<AdminUser[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("admin_users")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[orders] getAllAdminUsersForAdmin failed", error);
    return [];
  }
  return (data ?? []).map(mapAdminUser);
}

/** 가입 승인 대기 중인 관리자 목록 — settings 페이지의 '승인 대기' 섹션용 */
export async function getPendingAdminUsersForAdmin(): Promise<AdminUser[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("admin_users")
    .select("*")
    .eq("status", "PENDING")
    .order("requested_at", { ascending: true });

  if (error) {
    console.error("[orders] getPendingAdminUsersForAdmin failed", error);
    return [];
  }
  return (data ?? []).map(mapAdminUser);
}

export async function getAllGradingServicesForAdmin(): Promise<GradingService[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("grading_services")
    .select("*")
    .order("company", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[orders] getAllGradingServicesForAdmin failed", error);
    return [];
  }
  return (data ?? []).map(mapGradingService);
}

/**
 * user_id 목록에 대해 profiles 의 최신 주소(postal_code, address, address_detail)를
 * 한 번에 조회한다. 어드민 측에서 address_source='MY' 인 주문의 배송 주소를
 * 화면에 표시할 때 사용한다.
 *
 * service-role 키를 사용하므로 RLS 우회. 호출 측에서 requireAdmin() 통과 필수.
 */
export async function getProfileAddressesByUserIds(
  userIds: string[]
): Promise<Map<string, { postalCode: string; address: string; detail: string }>> {
  const map = new Map<
    string,
    { postalCode: string; address: string; detail: string }
  >();
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0) return map;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, postal_code, address, address_detail")
    .in("id", ids);

  if (error) {
    console.error("[orders] getProfileAddressesByUserIds failed", error);
    return map;
  }
  for (const row of data ?? []) {
    map.set(row.id, {
      postalCode: row.postal_code ?? "",
      address: row.address ?? "",
      detail: row.address_detail ?? "",
    });
  }
  return map;
}

// 고객 신청 폼용 — 활성(is_active=true) 서비스만 조회.
export async function getActiveGradingServices(): Promise<GradingService[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("grading_services")
    .select("*")
    .eq("is_active", true)
    .order("company", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[orders] getActiveGradingServices failed", error);
    return [];
  }
  return (data ?? []).map(mapGradingService);
}

