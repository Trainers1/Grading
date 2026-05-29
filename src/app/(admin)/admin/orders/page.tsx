import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import {
  getAllOrdersForAdmin,
  getCardsForOrdersForAdmin,
  getCardTemplatesForAdmin,
  getPaymentCountsForOrders,
} from "@/lib/orders/queries";
import { requireAdmin } from "@/lib/auth/require-admin";
import { cn } from "@/lib/utils";
import type { Order } from "@/types";
import { IntakeManagementTab } from "./_components/intake-management-tab";
import { CardInfoEntryTab } from "./_components/card-info-entry-tab";
import { PendingShipmentCardsTab } from "./_components/pending-shipment-cards-tab";
import { ShipArriveTab } from "./_components/ship-arrive-tab";
import { PickupCompleteTab } from "./_components/pickup-complete-tab";
import { AllOrdersTab } from "./_components/all-orders-tab";
import { CancelledOrdersTab } from "./_components/cancelled-orders-tab";

export const dynamic = "force-dynamic";

type TabView =
  | "intake"
  | "cardinfo"
  | "pendingship"
  | "shipping"
  | "pickup"
  | "all"
  | "cancelled";
type ShipSub = "ship" | "arrive";

export default function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; sub?: string }>;
}) {
  return (
    <Suspense>
      <OrdersContent searchParams={searchParams} />
    </Suspense>
  );
}

async function OrdersContent({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; sub?: string }>;
}) {
  const admin = await requireAdmin();
  if (!admin) redirect("/admin/login");

  const params = await searchParams;
  const view: TabView = (() => {
    switch (params.view) {
      case "cardinfo":
      case "pendingship":
      case "shipping":
      case "pickup":
      case "all":
      case "cancelled":
        return params.view;
      default:
        return "intake";
    }
  })();
  const sub: ShipSub = params.sub === "arrive" ? "arrive" : "ship";
  const canDelete = admin.adminRole === "SUPER_ADMIN";
  const canCancel =
    admin.adminRole === "SUPER_ADMIN" || admin.adminRole === "GENERAL_ADMIN";

  // 카운트는 모든 탭 헤더 뱃지에 사용 — 한 번에 조회.
  const allActive = await getAllOrdersForAdmin({ scope: "active" });
  const cancelledOrders = await getAllOrdersForAdmin({ scope: "cancelled" });

  const intakeOrders = allActive.filter(
    (o) => o.paymentStatus === "PENDING" && o.orderStatus === "PAYMENT_PENDING"
  );
  const cardInfoOrders = allActive.filter(
    (o) =>
      o.paymentStatus === "PAID" && o.orderStatus === "CARD_DELIVERY_PENDING"
  );
  const shipOrders = allActive.filter((o) => o.orderStatus === "CARD_RECEIVED");
  const arriveOrders = allActive.filter(
    (o) => o.orderStatus === "GRADE_CONFIRMED"
  );
  // 수령 완료 탭 — 매장 수령 + 트레이너스 도착 주문.
  const pickupOrders = allActive.filter(
    (o) =>
      o.orderStatus === "TRAINERS_ARRIVED" && o.pickupMethod === "STORE_PICKUP"
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">주문 관리</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          단계별 워크플로우 탭에서 주문을 처리합니다.
        </p>
      </div>

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex min-w-max gap-1 border-b border-border sm:min-w-0 sm:flex-wrap">
          <TabLink
            href="/admin/orders?view=intake"
            active={view === "intake"}
            label="접수 관리"
            count={intakeOrders.length}
          />
          <TabLink
            href="/admin/orders?view=cardinfo"
            active={view === "cardinfo"}
            label="카드 정보 작성"
            count={cardInfoOrders.length}
          />
          <TabLink
            href="/admin/orders?view=pendingship"
            active={view === "pendingship"}
            label="출고 대기 카드"
            count={shipOrders.length}
          />
          <TabLink
            href="/admin/orders?view=shipping"
            active={view === "shipping"}
            label="출고/입고"
            count={shipOrders.length + arriveOrders.length}
          />
          <TabLink
            href="/admin/orders?view=pickup"
            active={view === "pickup"}
            label="수령 완료"
            count={pickupOrders.length}
          />
          <TabLink
            href="/admin/orders?view=all"
            active={view === "all"}
            label="전체"
            count={allActive.length}
          />
          <TabLink
            href="/admin/orders?view=cancelled"
            active={view === "cancelled"}
            label="취소됨"
            count={cancelledOrders.length}
            danger
          />
        </div>
      </div>

      {view === "intake" && <IntakeManagementTab orders={intakeOrders} />}

      {view === "cardinfo" && (
        <CardInfoEntryTabSection orders={cardInfoOrders} />
      )}

      {view === "pendingship" && (
        <PendingShipmentCardsTabSection orders={shipOrders} />
      )}

      {view === "shipping" && (
        <ShipArriveTab
          mode={sub}
          orders={sub === "ship" ? shipOrders : arriveOrders}
          baseHref="/admin/orders?view=shipping"
        />
      )}

      {view === "pickup" && <PickupCompleteTab orders={pickupOrders} />}

      {view === "all" && <AllOrdersTab orders={allActive} />}

      {view === "cancelled" && (
        <CancelledOrdersTabSection
          orders={cancelledOrders}
          canDelete={canDelete}
          canRefund={canCancel}
        />
      )}
    </div>
  );
}

function TabLink({
  href,
  active,
  label,
  count,
  danger,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
  danger?: boolean;
}) {
  const activeCls = danger
    ? "border-error text-error"
    : "border-primary text-primary";
  return (
    <Link
      href={href}
      className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? activeCls
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
      <span
        className={cn(
          "ml-1.5 inline-flex min-w-[1.25rem] justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
          count === 0
            ? "bg-muted text-muted-foreground"
            : danger
            ? "bg-error/10 text-error"
            : "bg-primary/10 text-primary"
        )}
      >
        {count}
      </span>
    </Link>
  );
}

async function CardInfoEntryTabSection({ orders }: { orders: Order[] }) {
  const [cards, templates] = await Promise.all([
    orders.length > 0
      ? getCardsForOrdersForAdmin(orders.map((o) => o.id))
      : Promise.resolve([]),
    getCardTemplatesForAdmin(),
  ]);
  return (
    <CardInfoEntryTab orders={orders} cards={cards} templates={templates} />
  );
}

async function PendingShipmentCardsTabSection({
  orders,
}: {
  orders: Order[];
}) {
  const cards =
    orders.length > 0
      ? await getCardsForOrdersForAdmin(orders.map((o) => o.id))
      : [];
  return <PendingShipmentCardsTab orders={orders} cards={cards} />;
}

async function CancelledOrdersTabSection({
  orders,
  canDelete,
  canRefund,
}: {
  orders: Order[];
  canDelete: boolean;
  canRefund: boolean;
}) {
  const countsMap =
    orders.length > 0
      ? await getPaymentCountsForOrders(orders.map((o) => o.id))
      : new Map<string, number>();
  // Map 은 클라이언트 컴포넌트로 직렬화되지 않으므로 Record 로 변환.
  const paymentCounts: Record<string, number> = {};
  for (const [id, count] of countsMap) paymentCounts[id] = count;
  return (
    <CancelledOrdersTab
      orders={orders}
      paymentCounts={paymentCounts}
      canDelete={canDelete}
      canRefund={canRefund}
    />
  );
}
