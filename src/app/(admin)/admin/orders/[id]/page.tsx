import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  getOrderForAdmin,
  getProfileAddressesByUserIds,
} from "@/lib/orders/queries";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
} from "@/constants/grading";
import { formatFullAddress, resolveOrderShippingAddress } from "@/lib/address";
import { StatusChanger } from "./_components/status-changer";
import { CardEditor, CardEditorMobile } from "./_components/card-editor";
import { CancelOrderButton } from "./_components/cancel-order-button";
import { DeleteOrderButton } from "../_components/delete-order-button";
import { RefundOrderButton } from "../_components/refund-order-button";

export const dynamic = "force-dynamic";

function formatCurrency(amount: number): string {
  return `₩${amount.toLocaleString("ko-KR")}`;
}

function formatDateTime(iso?: string): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("ko-KR");
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireAdmin();
  if (!admin) redirect("/admin/login");

  const { id } = await params;
  const result = await getOrderForAdmin(id);
  if (!result) notFound();

  const { order, cards, paymentCount } = result;
  const total = order.prepaidAmount + (order.overchargeAmount ?? 0);

  // addressSource='MY' 면 회원 정보 최신 주소로 resolve. snapshot 은 fallback 용도.
  const profileAddress =
    order.addressSource === "MY"
      ? (await getProfileAddressesByUserIds([order.userId])).get(order.userId) ??
        null
      : null;
  const resolvedAddress = resolveOrderShippingAddress(order, profileAddress);
  const resolvedAddressDisplay = formatFullAddress(resolvedAddress);
  const canCancel =
    admin.adminRole === "SUPER_ADMIN" || admin.adminRole === "GENERAL_ADMIN";
  const canDelete = admin.adminRole === "SUPER_ADMIN";
  const canRefund = canCancel;
  const hasPendingPayments = paymentCount > 0;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/orders"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← 주문 관리로
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-xl font-bold sm:text-2xl">
              {order.id}
            </h1>
            {order.cancelledAt && (
              <span className="rounded-full bg-error/10 px-3 py-1 text-xs font-medium text-error">
                취소됨
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!order.cancelledAt && order.orderStatus === "CARD_DELIVERY_PENDING" && (
              <Link
                href={`/admin/orders/${order.id}/receive`}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                카드 수령 처리
              </Link>
            )}
            {!order.cancelledAt && (
              <CancelOrderButton orderId={order.id} canCancel={canCancel} />
            )}
            {order.cancelledAt && hasPendingPayments && (
              <RefundOrderButton orderId={order.id} canRefund={canRefund} />
            )}
            {order.cancelledAt && !hasPendingPayments && (
              <DeleteOrderButton
                orderId={order.id}
                size="md"
                redirectTo="/admin/orders?scope=cancelled"
                canDelete={canDelete}
              />
            )}
          </div>
        </div>
        {order.cancelledAt && order.cancelReason && (
          <div className="mt-3 rounded-md border border-error/30 bg-error/5 p-3 text-xs">
            <p className="font-medium text-error">취소 사유</p>
            <p className="mt-1 whitespace-pre-wrap text-foreground">
              {order.cancelReason}
            </p>
            <p className="mt-2 text-muted-foreground">
              취소일: {formatDateTime(order.cancelledAt)}
            </p>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold">고객 정보</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">이름</dt>
              <dd>{order.name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">연락처</dt>
              <dd>{order.phone}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">수령 방법</dt>
              <dd>
                {order.pickupMethod === "STORE_PICKUP" ? "매장 수령" : "택배"}
              </dd>
            </div>
            {order.pickupMethod === "DELIVERY" && resolvedAddressDisplay && (
              <div className="flex justify-between gap-4">
                <dt className="shrink-0 text-muted-foreground">배송지</dt>
                <dd className="text-right">
                  {resolvedAddressDisplay}
                  {order.addressSource === "MY" && (
                    <span className="ml-1 text-[10px] text-primary">
                      (내 주소)
                    </span>
                  )}
                </dd>
              </div>
            )}
          </dl>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold">그레이딩</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">회사</dt>
              <dd>{order.gradingCompany}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">서비스</dt>
              <dd>{order.serviceLevel}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">스포일러</dt>
              <dd>{order.spoilerPreference === "ALLOW" ? "공개" : "비공개"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">주문 상태</dt>
              <dd className="font-medium text-primary">
                {ORDER_STATUS_LABELS[order.orderStatus]}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold">결제</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">결제 상태</dt>
              <dd>{PAYMENT_STATUS_LABELS[order.paymentStatus]}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">선결제</dt>
              <dd>{formatCurrency(order.prepaidAmount)}</dd>
            </div>
            {order.overchargeAmount !== undefined && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">오버차지</dt>
                <dd>{formatCurrency(order.overchargeAmount)}</dd>
              </div>
            )}
            <div className="mt-2 flex justify-between border-t border-border pt-2">
              <dt className="font-medium">합계</dt>
              <dd className="font-bold text-primary">
                {formatCurrency(total)}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <StatusChanger orderId={order.id} currentStatus={order.orderStatus} />

        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold">주문 타임라인</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">접수일</dt>
              <dd>{formatDateTime(order.createdAt)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">카드 수령</dt>
              <dd>{formatDateTime(order.receivedAt)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">총판 발송</dt>
              <dd>{formatDateTime(order.distributorShippedAt)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">마지막 업데이트</dt>
              <dd>{formatDateTime(order.updatedAt)}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border p-5">
          <h2 className="font-semibold">카드 ({cards.length}장)</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            각 항목을 직접 수정한 뒤 우측(모바일에서는 하단)의 "저장" 버튼을 누르세요.
          </p>
        </div>
        {cards.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            등록된 카드가 없습니다.
          </p>
        ) : (
          <>
            {/* 데스크탑 테이블 (md 이상) */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3">#</th>
                    <th className="px-5 py-3">영문명</th>
                    <th className="px-5 py-3">세트</th>
                    <th className="px-5 py-3">번호</th>
                    <th className="px-5 py-3">연도</th>
                    <th className="px-5 py-3">신고가액</th>
                    <th className="px-5 py-3">등급 결과</th>
                    <th className="px-5 py-3 text-right">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {cards.map((c, i) => (
                    <CardEditor key={c.id} card={c} index={i} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* 모바일 카드 리스트 (md 미만) */}
            <div className="divide-y divide-border md:hidden">
              {cards.map((c, i) => (
                <CardEditorMobile key={c.id} card={c} index={i} />
              ))}
            </div>
          </>
        )}
      </div>

    </div>
  );
}
