import Link from "next/link";
import { Suspense } from "react";
import { createServiceClient } from "@/lib/supabase/service";
import { getOrdersByStatusesForAdmin } from "@/lib/orders/queries";
import { GRADING_COMPANIES } from "@/constants/grading";
import type { GradingCompany } from "@/types";
import { PendingGradeForm } from "./_components/pending-grade-form";
import { GradeCancelButton } from "./_components/grade-cancel-button";

export const dynamic = "force-dynamic";

type SubTab = "input" | "confirmed";

type CardWithOrder = {
  id: string;
  orderId: string;
  setName: string | null;
  cardNumber: string | null;
  englishName: string | null;
  gradingCompany: GradingCompany;
  gradeResult: string | null;
  serialNumber: string | null;
  customerName: string;
};

export default function GradingPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  return (
    <Suspense>
      <GradingContent searchParams={searchParams} />
    </Suspense>
  );
}

async function GradingContent({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const subTab: SubTab = tab === "confirmed" ? "confirmed" : "input";

  // 등급 워크플로우 대상: 그레이딩 진행 중 + 등급 확정 단계의 주문들
  const orders = await getOrdersByStatusesForAdmin([
    "DISTRIBUTOR_SHIPPED",
    "GRADE_CONFIRMED",
  ]);

  let allCards: CardWithOrder[] = [];

  if (orders.length > 0) {
    const service = createServiceClient();
    const orderIds = orders.map((o) => o.id);
    const { data: cards } = await service
      .from("cards")
      .select(
        "id, order_id, english_name, set_name, card_number, grade_result, serial_number"
      )
      .in("order_id", orderIds)
      .order("created_at", { ascending: true });

    allCards = (cards ?? []).map((c) => {
      const ord = orders.find((o) => o.id === c.order_id)!;
      return {
        id: c.id,
        orderId: c.order_id,
        englishName: c.english_name,
        setName: c.set_name,
        cardNumber: c.card_number,
        gradingCompany: ord.gradingCompany,
        gradeResult: c.grade_result,
        serialNumber: c.serial_number,
        customerName: ord.name,
      };
    });
  }

  // 일련번호가 채워진 것만 "확정". 비면 입력 대기 탭에 노출.
  const pending = allCards.filter((c) => !c.serialNumber);
  const graded = allCards.filter((c) => c.serialNumber);

  const subTabBaseHref = (target: SubTab) => {
    const sp = new URLSearchParams();
    if (target !== "input") sp.set("tab", target);
    const qs = sp.toString();
    return qs ? `/admin/grading?${qs}` : "/admin/grading";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">등급 결과 관리</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          카드별 일련번호 입력 — 등급은 사용자가 그레이딩사 사이트에서 직접 조회
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-3 sm:p-5">
          <p className="text-sm text-muted-foreground">전체 카드</p>
          <p className="mt-2 text-3xl font-bold">{allCards.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 sm:p-5">
          <p className="text-sm text-muted-foreground">일련번호 대기</p>
          <p className="mt-2 text-3xl font-bold text-warning">
            {pending.length}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 sm:p-5">
          <p className="text-sm text-muted-foreground">일련번호 입력 완료</p>
          <p className="mt-2 text-3xl font-bold text-success">
            {graded.length}
          </p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-border">
        <Link
          href={subTabBaseHref("input")}
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            subTab === "input"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          일련번호 입력 ({pending.length})
        </Link>
        <Link
          href={subTabBaseHref("confirmed")}
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            subTab === "confirmed"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          일련번호 입력 내역 ({graded.length})
        </Link>
      </div>

      {subTab === "input" ? (
        <div className="space-y-6">
          {GRADING_COMPANIES.map((c) => {
            const companyPending = pending.filter(
              (p) => p.gradingCompany === c.value
            );
            return (
              <section
                key={c.value}
                className="overflow-hidden rounded-xl border border-border bg-card"
              >
                <header className="flex items-center justify-between border-b border-border bg-muted/20 px-5 py-3">
                  <div>
                    <h2 className="text-base font-semibold">{c.label}</h2>
                    <p className="text-xs text-muted-foreground">
                      {c.description}
                    </p>
                  </div>
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    일련번호 대기 {companyPending.length}장
                  </span>
                </header>
                {companyPending.length === 0 ? (
                  <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                    그레이딩 진행 중인 카드가 없습니다.
                  </div>
                ) : (
                  <PendingGradeForm
                    cards={companyPending.map((card) => ({
                      id: card.id,
                      orderId: card.orderId,
                      customerName: card.customerName,
                      gradingCompany: card.gradingCompany,
                      englishName: card.englishName,
                      setName: card.setName,
                      cardNumber: card.cardNumber,
                    }))}
                  />
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <ConfirmedTable cards={graded} />
      )}
    </div>
  );
}

function ConfirmedTable({ cards }: { cards: CardWithOrder[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border p-5">
        <h2 className="font-semibold">일련번호 입력 내역</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          일련번호가 입력된 카드 목록입니다. 잘못 입력했다면 "입력 취소"로
          되돌릴 수 있습니다. 한 주문의 카드 중 하나라도 일련번호가 비면 주문은
          자동으로 그레이딩 진행 중 단계로 돌아갑니다.
        </p>
      </div>
      {cards.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">
          입력된 일련번호가 없습니다.
        </p>
      ) : (
        <>
          {/* 데스크탑 테이블 (md 이상) */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">주문번호</th>
                  <th className="px-5 py-3">고객</th>
                  <th className="px-5 py-3">회사</th>
                  <th className="px-5 py-3">카드 정보</th>
                  <th className="px-5 py-3">일련번호</th>
                  <th className="px-5 py-3 text-right">관리</th>
                </tr>
              </thead>
              <tbody>
                {cards.map((c) => (
                  <tr key={c.id} className="border-t border-border align-top">
                    <td className="px-5 py-3">
                      <Link
                        href={`/admin/orders/${c.orderId}`}
                        className="font-mono text-primary hover:underline"
                      >
                        {c.orderId}
                      </Link>
                    </td>
                    <td className="px-5 py-3">{c.customerName}</td>
                    <td className="px-5 py-3">{c.gradingCompany}</td>
                    <td className="px-5 py-3">
                      <p className="font-medium">
                        {[c.englishName, c.setName, c.cardNumber]
                          .filter(Boolean)
                          .join(" · ") || "정보 미입력"}
                      </p>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        ID: {c.id.slice(0, 8)}
                      </p>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs">
                      {c.serialNumber ?? "-"}
                    </td>
                    <td className="px-5 py-3">
                      <GradeCancelButton
                        cardId={c.id}
                        cardLabel={
                          [c.englishName, c.setName, c.cardNumber]
                            .filter(Boolean)
                            .join(" · ") || `카드 ${c.id.slice(0, 8)}`
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 모바일 카드 리스트 (md 미만) */}
          <div className="divide-y divide-border md:hidden">
            {cards.map((c) => {
              const cardInfo =
                [c.englishName, c.setName, c.cardNumber]
                  .filter(Boolean)
                  .join(" · ") || "정보 미입력";
              return (
                <div key={c.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/admin/orders/${c.orderId}`}
                      className="font-mono text-sm font-medium text-primary hover:underline"
                    >
                      {c.orderId}
                    </Link>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {c.gradingCompany}
                    </span>
                  </div>
                  <div className="mt-1 text-sm font-medium">
                    {c.customerName}
                  </div>
                  <p className="mt-1 text-sm text-foreground">{cardInfo}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    일련번호:{" "}
                    <span className="font-mono">{c.serialNumber ?? "-"}</span>
                  </p>
                  <div className="mt-2">
                    <GradeCancelButton
                      cardId={c.id}
                      cardLabel={cardInfo || `카드 ${c.id.slice(0, 8)}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
