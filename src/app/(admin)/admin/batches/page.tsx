// 택배 발송 관리 — 트레이너스에서 고객에게 발송하는 택배를 관리.
// 대상: order_status = TRAINERS_ARRIVED 이면서 pickup_method = DELIVERY 인 주문.
//
// 3단계 분류 (우선순위 순):
//   1) 발송 완료 — user_tracking_number 입력됨
//   2) 발송 대기 — 택배비 결제 완료(shipment_group_id 있음) + 송장 미입력
//   3) 결제 대기 — 택배비 미결제. 고객이 마이페이지에서 온라인 결제하면 발송 대기로 이동.
//
// 합배송: shipment_group_id 가 같은 주문들은 한 묶음으로 그룹화되어 송장 1개로 함께 발송된다.
//
// 기존 그레이딩사 월간 배치 발송 워크플로우(batches/batch_orders 테이블)는 이 페이지에서
// 더 이상 노출되지 않는다. 관련 DB 테이블 자체는 보존되어 있다.

import {
  getOrdersForUserDelivery,
  getProfileAddressesByUserIds,
} from "@/lib/orders/queries";
import { SHIPPING_FEE } from "@/constants/grading";
import {
  formatFullAddress,
  resolveOrderShippingAddress,
  type ProfileAddress,
} from "@/lib/address";
import type { Order } from "@/types";
import { TrackingInput } from "./_components/tracking-input";

export const dynamic = "force-dynamic";

function formatDate(iso?: string): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

// 합배송 묶음 단위로 그룹화. shipment_group_id 가 없는 주문은 단독 그룹으로 처리.
function groupByShipment(orders: Order[]): Order[][] {
  const groups = new Map<string, Order[]>();
  for (const o of orders) {
    const key = o.shipmentGroupId ?? `single:${o.id}`;
    const arr = groups.get(key);
    if (arr) arr.push(o);
    else groups.set(key, [o]);
  }
  return Array.from(groups.values());
}

// addressSource='MY' 주문은 항상 최신 회원 정보 주소로 표시한다.
// snapshot 컬럼은 회원이 프로필 주소를 비웠을 때의 fallback 용도.
function displayShippingAddress(
  order: Order,
  profileAddresses: Map<string, ProfileAddress>,
  fallback: string
): string {
  const profile = profileAddresses.get(order.userId) ?? null;
  return formatFullAddress(
    resolveOrderShippingAddress(order, profile),
    fallback
  );
}

export default async function BatchesPage() {
  const orders = await getOrdersForUserDelivery();

  // addressSource='MY' 주문의 최신 회원 주소를 일괄 조회.
  const myAddressUserIds = orders
    .filter((o) => o.addressSource === "MY")
    .map((o) => o.userId);
  const profileAddresses = await getProfileAddressesByUserIds(myAddressUserIds);

  // 우선순위: 송장 입력됨 → 발송 완료 / 택배비 결제됨 → 발송 대기 / 그 외 → 결제 대기.
  const shippedGroups = groupByShipment(
    orders.filter((o) => o.userTrackingNumber)
  );
  const awaitingShipmentGroups = groupByShipment(
    orders.filter((o) => !o.userTrackingNumber && o.shipmentGroupId)
  );
  const awaitingPayment = orders.filter(
    (o) => !o.userTrackingNumber && !o.shipmentGroupId
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">택배 발송</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          트레이너스에 도착하여 고객 택배 발송 대기 중인 주문을 관리합니다.
          (전체 {orders.length}건)
        </p>
      </div>

      {/* ── 결제 대기 ─────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          결제 대기{" "}
          <span className="text-muted-foreground">
            ({awaitingPayment.length}건)
          </span>
        </h2>
        <p className="text-xs text-muted-foreground">
          택배비({SHIPPING_FEE.toLocaleString()}원) 미결제 주문입니다. 고객이
          마이페이지에서 택배비를 결제하면 자동으로 발송 대기로 이동합니다.
        </p>

        {awaitingPayment.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            결제 대기 중인 주문이 없습니다.
          </div>
        ) : (
          <div className="space-y-3">
            {awaitingPayment.map((order) => (
              <div
                key={order.id}
                className="rounded-xl border border-border bg-card p-4 shadow-sm"
              >
                <div className="flex items-center gap-2">
                  <p className="font-mono text-sm font-bold text-primary">
                    {order.id}
                  </p>
                  <span className="rounded bg-error/10 px-2 py-0.5 text-xs text-error">
                    택배비 결제 대기
                  </span>
                </div>
                <p className="mt-1 text-sm font-medium">{order.name}</p>
                <p className="text-xs text-muted-foreground">{order.phone}</p>
                <p className="mt-2 break-words text-xs text-muted-foreground">
                  배송지:{" "}
                  {displayShippingAddress(
                    order,
                    profileAddresses,
                    "(주소 미입력)"
                  )}
                  {order.addressSource === "MY" && (
                    <span className="ml-1 text-[10px] text-primary">
                      (내 주소)
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  도착일: {formatDate(order.receivedAt)} · 등급회사:{" "}
                  {order.gradingCompany}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── 발송 대기 ─────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          발송 대기{" "}
          <span className="text-muted-foreground">
            ({awaitingShipmentGroups.length}건)
          </span>
        </h2>
        <p className="text-xs text-muted-foreground">
          택배비 결제가 완료된 주문입니다. 송장번호를 입력하고 발송 완료를
          누르면 발송 완료 목록으로 이동합니다. 합배송 묶음은 송장 1개로 함께
          발송됩니다.
        </p>

        {awaitingShipmentGroups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            발송 대기 중인 주문이 없습니다.
          </div>
        ) : (
          <div className="space-y-3">
            {awaitingShipmentGroups.map((group) => {
              const head = group[0];
              return (
                <div
                  key={head.shipmentGroupId ?? head.id}
                  className="rounded-xl border border-border bg-card p-4 shadow-sm"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {group.map((o) => (
                          <span
                            key={o.id}
                            className="font-mono text-sm font-bold text-primary"
                          >
                            {o.id}
                          </span>
                        ))}
                        {group.length > 1 && (
                          <span className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">
                            합배송 {group.length}건
                          </span>
                        )}
                        <span className="rounded bg-warning/10 px-2 py-0.5 text-xs text-warning">
                          택배 발송 대기
                        </span>
                      </div>
                      <p className="text-sm font-medium">{head.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {head.phone}
                      </p>
                      <p className="mt-2 break-words text-xs text-muted-foreground">
                        배송지:{" "}
                        {displayShippingAddress(
                          head,
                          profileAddresses,
                          "(주소 미입력)"
                        )}
                        {head.addressSource === "MY" && (
                          <span className="ml-1 text-[10px] text-primary">
                            (내 주소)
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        도착일: {formatDate(head.receivedAt)} · 등급회사:{" "}
                        {group.map((o) => o.gradingCompany).join(", ")}
                      </p>
                    </div>

                    <div className="w-full md:w-80">
                      <TrackingInput
                        orderId={head.id}
                        submitLabel="발송 완료"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── 발송 완료 ─────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          발송 완료{" "}
          <span className="text-muted-foreground">
            ({shippedGroups.length}건)
          </span>
        </h2>

        {shippedGroups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            발송 완료된 주문이 없습니다.
          </div>
        ) : (
          <div className="space-y-3">
            {shippedGroups.map((group) => {
              const head = group[0];
              return (
                <div
                  key={head.shipmentGroupId ?? head.id}
                  className="rounded-xl border border-border bg-card p-4 shadow-sm"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {group.map((o) => (
                          <span
                            key={o.id}
                            className="font-mono text-sm font-bold text-primary"
                          >
                            {o.id}
                          </span>
                        ))}
                        {group.length > 1 && (
                          <span className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">
                            합배송 {group.length}건
                          </span>
                        )}
                        <span className="rounded bg-success/10 px-2 py-0.5 text-xs text-success">
                          발송 완료
                        </span>
                      </div>
                      <p className="text-sm font-medium">
                        {head.name}{" "}
                        <span className="text-xs text-muted-foreground">
                          {head.phone}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        송장번호:{" "}
                        <span className="font-mono text-foreground">
                          {head.userTrackingNumber}
                        </span>
                      </p>
                      <p className="break-words text-xs text-muted-foreground">
                        배송지:{" "}
                        {displayShippingAddress(head, profileAddresses, "-")}
                        {head.addressSource === "MY" && (
                          <span className="ml-1 text-[10px] text-primary">
                            (내 주소)
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="w-full md:w-80">
                      <TrackingInput
                        orderId={head.id}
                        initialTrackingNumber={head.userTrackingNumber}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
