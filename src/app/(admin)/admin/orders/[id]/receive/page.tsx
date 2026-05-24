import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getOrderForAdmin } from "@/lib/orders/queries";
import { ReceiveForm } from "./_components/receive-form";

export const dynamic = "force-dynamic";

export default async function ReceivePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getOrderForAdmin(id);
  if (!result) notFound();
  const { order, cards } = result;

  // 이미 수령 처리된 경우 상세로 즉시 복귀
  if (order.orderStatus !== "CARD_DELIVERY_PENDING") {
    redirect(`/admin/orders/${id}`);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href={`/admin/orders/${id}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← 주문 상세로
        </Link>
        <h1 className="mt-2 text-2xl font-bold">카드 수령 처리</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          주문번호 <span className="font-mono">{id}</span> — {order.name} 님
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold">수령 체크리스트 ({cards.length}장)</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          신청 시점에는 매수만 받았으므로 카드 정보는 비어있을 수 있습니다.
          수령 후 주문 상세에서 카드별 세부 정보를 입력해 주세요.
        </p>
        <ul className="mt-3 space-y-2 text-sm">
          {cards.map((c, i) => {
            const desc =
              [c.englishName, c.setName, c.cardNumber]
                .filter(Boolean)
                .join(" · ") || "정보 미입력";
            return (
              <li
                key={c.id}
                className="flex items-center justify-between rounded-md border border-border p-3"
              >
                <div>
                  <p className="font-medium">카드 #{i + 1}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
                <span className="text-xs text-muted-foreground">실물 확인</span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <ReceiveForm orderId={id} />
      </div>
    </div>
  );
}
