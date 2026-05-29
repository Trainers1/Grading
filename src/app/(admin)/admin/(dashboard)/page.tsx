import Link from "next/link";
import {
  getAllOrdersForAdmin,
  getAllProfilesForAdmin,
} from "@/lib/orders/queries";
import { ORDER_STATUS_LABELS } from "@/constants/grading";

export const dynamic = "force-dynamic";

function formatCurrency(amount: number): string {
  return `₩${amount.toLocaleString("ko-KR")}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export default async function AdminDashboardPage() {
  const [orders, users] = await Promise.all([
    getAllOrdersForAdmin(),
    getAllProfilesForAdmin(),
  ]);

  const totalRevenue = orders.reduce(
    (sum, o) => sum + o.prepaidAmount + (o.overchargeAmount ?? 0),
    0
  );
  const pendingDelivery = orders.filter(
    (o) => o.orderStatus === "CARD_DELIVERY_PENDING"
  ).length;
  const inGrading = orders.filter(
    (o) => o.orderStatus === "DISTRIBUTOR_SHIPPED"
  ).length;
  const readyForPickup = orders.filter(
    (o) => o.orderStatus === "TRAINERS_ARRIVED"
  ).length;
  const deliveryPending = orders.filter(
    (o) =>
      o.orderStatus === "TRAINERS_ARRIVED" &&
      o.pickupMethod === "DELIVERY" &&
      !o.userTrackingNumber
  ).length;

  const recentOrders = [...orders]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);

  const stats = [
    { label: "카드 전달 대기", value: pendingDelivery, href: "/admin/orders?status=CARD_DELIVERY_PENDING" },
    { label: "그레이딩 진행 중", value: inGrading, href: "/admin/orders?status=DISTRIBUTOR_SHIPPED" },
    { label: "수령 대기", value: readyForPickup, href: "/admin/orders?status=TRAINERS_ARRIVED" },
    { label: "택배 발송 대기", value: deliveryPending, href: "/admin/batches" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">대시보드</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            TRAINERS 그레이딩 운영 현황 요약
          </p>
        </div>
        <div className="text-right text-sm">
          <p className="text-muted-foreground">총 매출 (누적)</p>
          <p className="text-xl font-bold text-primary">
            {formatCurrency(totalRevenue)}
          </p>
        </div>
      </div>

      {/* 핵심 지표 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/50 sm:p-5"
          >
            <p className="text-sm text-muted-foreground">{s.label}</p>
            <p className="mt-2 text-3xl font-bold">{s.value}</p>
          </Link>
        ))}
      </div>

      {/* 최근 주문 */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-5">
          <h2 className="font-semibold">최근 주문</h2>
          <Link
            href="/admin/orders"
            className="text-sm text-primary hover:underline"
          >
            전체 보기 →
          </Link>
        </div>
        {/* 데스크탑 테이블 (md 이상) */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-5 py-3">주문번호</th>
                <th className="px-5 py-3">이름</th>
                <th className="px-5 py-3">회사</th>
                <th className="px-5 py-3">상태</th>
                <th className="px-5 py-3">금액</th>
                <th className="px-5 py-3">접수일</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((o) => (
                <tr key={o.id} className="border-t border-border">
                  <td className="px-5 py-3">
                    <Link
                      href={`/admin/orders/${o.id}`}
                      className="font-mono text-primary hover:underline"
                    >
                      {o.id}
                    </Link>
                  </td>
                  <td className="px-5 py-3">{o.name}</td>
                  <td className="px-5 py-3">{o.gradingCompany}</td>
                  <td className="px-5 py-3">
                    {ORDER_STATUS_LABELS[o.orderStatus]}
                  </td>
                  <td className="px-5 py-3">
                    {formatCurrency(o.prepaidAmount)}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {formatDate(o.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 모바일 카드 리스트 (md 미만) */}
        <div className="divide-y divide-border md:hidden">
          {recentOrders.map((o) => (
            <Link
              key={o.id}
              href={`/admin/orders/${o.id}`}
              className="block px-4 py-3 hover:bg-muted/20 active:bg-muted/40"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-mono text-sm font-medium text-primary">
                  {o.id}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDate(o.createdAt)}
                </span>
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">{o.name}</span>
                <span className="text-foreground">
                  {formatCurrency(o.prepaidAmount)}
                </span>
              </div>
              <div className="mt-0.5 flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                <span>{o.gradingCompany}</span>
                <span>{ORDER_STATUS_LABELS[o.orderStatus]}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* 회원 요약 */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">회원 현황</h2>
          <Link
            href="/admin/users"
            className="text-sm text-primary hover:underline"
          >
            전체 회원 →
          </Link>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-sm text-muted-foreground">전체 회원</p>
            <p className="mt-1 text-2xl font-bold">{users.length}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">활성 회원</p>
            <p className="mt-1 text-2xl font-bold text-success">
              {users.filter((u) => !u.isBlocked).length}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">차단 회원</p>
            <p className="mt-1 text-2xl font-bold text-error">
              {users.filter((u) => u.isBlocked).length}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
