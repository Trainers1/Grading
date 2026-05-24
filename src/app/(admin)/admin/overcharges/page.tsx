import Link from "next/link";
import { getAllOrdersForAdmin } from "@/lib/orders/queries";
import { PAYMENT_STATUS_LABELS } from "@/constants/grading";
import { OverchargeRowActions } from "./_components/overcharge-row-actions";

export const dynamic = "force-dynamic";

function formatCurrency(amount: number): string {
  return `₩${amount.toLocaleString("ko-KR")}`;
}

export default async function OverchargesPage() {
  const orders = await getAllOrdersForAdmin();
  const overchargeOrders = orders.filter(
    (o) => o.overchargeAmount && o.overchargeAmount > 0
  );

  const pending = overchargeOrders.filter(
    (o) => o.paymentStatus === "OVERCHARGE_PENDING"
  );
  const paid = overchargeOrders.filter(
    (o) => o.paymentStatus === "OVERCHARGE_PAID"
  );
  const totalPendingAmount = pending.reduce(
    (sum, o) => sum + (o.overchargeAmount ?? 0),
    0
  );

  // 오버차지 설정 가능한 주문: 그레이딩 진행 중/등급 확정/트레이너스 도착 단계 + 아직 오버차지 미설정
  const setupCandidates = orders.filter(
    (o) =>
      !o.overchargeAmount &&
      (o.orderStatus === "DISTRIBUTOR_SHIPPED" ||
        o.orderStatus === "GRADE_CONFIRMED" ||
        o.orderStatus === "TRAINERS_ARRIVED")
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">오버차지 관리</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          등급회사 실제 청구 금액이 예상가를 초과하는 경우의 추가 결제 관리
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">오버차지 대기 건수</p>
          <p className="mt-2 text-3xl font-bold text-warning">
            {pending.length}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">대기 금액 합계</p>
          <p className="mt-2 text-2xl font-bold">
            {formatCurrency(totalPendingAmount)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">결제 완료 건수</p>
          <p className="mt-2 text-3xl font-bold text-success">{paid.length}</p>
        </div>
      </div>

      {/* 대기 건 */}
      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border p-5">
          <h2 className="font-semibold">오버차지 대기</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            고객 승인 및 결제가 필요한 건
          </p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-5 py-3">주문번호</th>
              <th className="px-5 py-3">고객</th>
              <th className="px-5 py-3">회사</th>
              <th className="px-5 py-3">선결제</th>
              <th className="px-5 py-3">오버차지</th>
              <th className="px-5 py-3">상태</th>
              <th className="px-5 py-3">액션</th>
            </tr>
          </thead>
          <tbody>
            {pending.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-5 py-8 text-center text-muted-foreground"
                >
                  대기 중인 오버차지가 없습니다.
                </td>
              </tr>
            ) : (
              pending.map((o) => (
                <tr key={o.id} className="border-t border-border align-top">
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
                    {formatCurrency(o.prepaidAmount)}
                  </td>
                  <td className="px-5 py-3 font-semibold text-warning">
                    +{formatCurrency(o.overchargeAmount ?? 0)}
                  </td>
                  <td className="px-5 py-3">
                    {PAYMENT_STATUS_LABELS[o.paymentStatus]}
                  </td>
                  <td className="px-5 py-3">
                    <OverchargeRowActions
                      orderId={o.id}
                      initialAmount={o.overchargeAmount ?? 0}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 오버차지 설정 후보 */}
      {setupCandidates.length > 0 && (
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border p-5">
            <h2 className="font-semibold">오버차지 설정 가능 주문</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              그레이딩 진행/확정 단계 주문에 대해 오버차지 금액을 입력할 수
              있습니다.
            </p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-5 py-3">주문번호</th>
                <th className="px-5 py-3">고객</th>
                <th className="px-5 py-3">회사</th>
                <th className="px-5 py-3">선결제</th>
                <th className="px-5 py-3">오버차지 입력</th>
              </tr>
            </thead>
            <tbody>
              {setupCandidates.map((o) => (
                <tr key={o.id} className="border-t border-border align-top">
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
                    {formatCurrency(o.prepaidAmount)}
                  </td>
                  <td className="px-5 py-3">
                    <OverchargeRowActions orderId={o.id} initialAmount={0} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 결제 완료 */}
      {paid.length > 0 && (
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border p-5">
            <h2 className="font-semibold">결제 완료 내역</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-5 py-3">주문번호</th>
                <th className="px-5 py-3">고객</th>
                <th className="px-5 py-3">회사</th>
                <th className="px-5 py-3">오버차지</th>
              </tr>
            </thead>
            <tbody>
              {paid.map((o) => (
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
                  <td className="px-5 py-3 font-semibold text-success">
                    {formatCurrency(o.overchargeAmount ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
