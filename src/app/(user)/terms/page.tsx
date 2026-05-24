// 이용약관 — 정식 검토본 확정 전까지 임시 안내 페이지.

import Link from "next/link";

export const metadata = {
  title: "이용약관 | 트레이너스 그레이딩",
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-bold">이용약관</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        최종 개정일: 준비 중
      </p>

      <section className="mt-8 space-y-6 text-sm leading-relaxed">
        <div className="rounded-md border border-warning/40 bg-warning/5 p-4 text-warning">
          정식 이용약관을 준비 중입니다. 본 페이지는 회원가입·신청 흐름의 라우팅
          무결성을 위해 게시된 안내 페이지이며, 시행 전까지 효력이 없습니다.
        </div>

        <div>
          <h2 className="text-base font-semibold text-foreground">서비스 개요 (안내)</h2>
          <p className="mt-2 text-muted-foreground">
            트레이너스 그레이딩은 트레이딩 카드를 해외 그레이딩사(PSA·BGS·CGC·brg)에
            대행 의뢰하고, 슬랩 반환까지 처리하는 그레이딩 대행 서비스입니다.
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-foreground">주요 책임 한계 (안내)</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            <li>해외 그레이딩사의 등급 결과 자체에 대한 보증은 제공하지 않습니다.</li>
            <li>국제 배송 중 발생하는 분실·파손에 대한 책임 범위는 별도 안내합니다.</li>
            <li>결제 완료 후 3일 이내 카드 미배송 시 주문은 자동 취소됩니다.</li>
          </ul>
        </div>

        <div>
          <h2 className="text-base font-semibold text-foreground">문의</h2>
          <p className="mt-2 text-muted-foreground">
            이용약관 관련 문의: hello@trainers.kr
          </p>
        </div>
      </section>

      <div className="mt-10">
        <Link
          href="/"
          className="text-sm text-primary underline underline-offset-4 hover:text-primary/80"
        >
          홈으로 돌아가기
        </Link>
      </div>
    </main>
  );
}
