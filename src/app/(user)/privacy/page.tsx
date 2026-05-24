// 개인정보처리방침 — 정식 검토본 확정 전까지 임시 안내 페이지.
// 약관 본문은 법무 검토 후 src/constants/legal/ 또는 별도 CMS 로 분리 예정.

import Link from "next/link";

export const metadata = {
  title: "개인정보처리방침 | 트레이너스 그레이딩",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-bold">개인정보처리방침</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        최종 개정일: 준비 중
      </p>

      <section className="mt-8 space-y-6 text-sm leading-relaxed">
        <div className="rounded-md border border-warning/40 bg-warning/5 p-4 text-warning">
          정식 개인정보처리방침을 준비 중입니다. 본 페이지는 회원가입·신청 흐름의
          라우팅 무결성을 위해 게시된 안내 페이지이며, 시행 전까지 효력이 없습니다.
        </div>

        <div>
          <h2 className="text-base font-semibold text-foreground">수집 항목 (안내)</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            <li>회원가입 시: 이메일, 비밀번호, 이름, 휴대전화번호</li>
            <li>주문 신청 시: 카드 정보, 수령 방법, 배송지, 결제 정보</li>
            <li>서비스 이용 기록: 주문 상태 변경 이력, 결제 이력, 접속 로그</li>
          </ul>
        </div>

        <div>
          <h2 className="text-base font-semibold text-foreground">이용 목적 (안내)</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            <li>그레이딩 대행 서비스 제공 및 주문 처리</li>
            <li>고객 문의 응대 및 알림 발송</li>
            <li>법령상 의무 이행 (전자상거래법, 세법 등)</li>
          </ul>
        </div>

        <div>
          <h2 className="text-base font-semibold text-foreground">문의</h2>
          <p className="mt-2 text-muted-foreground">
            개인정보 관련 문의: hello@trainers.kr
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
