import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { GRADING_COMPANIES } from "@/constants/grading";

export default function HomePage() {
  return (
    <div>
      {/* 히어로 */}
      <section className="bg-primary py-20 text-primary-foreground">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <h1 className="text-4xl font-bold sm:text-5xl">
            트레이딩 카드
            <br />
            그레이딩 대행 서비스
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-primary-foreground/80">
            PSA, BGS, CGC, BRG 등 해외 그레이딩사에 간편하게 대행 접수하세요.
            매장 방문만으로 해외 그레이딩을 신청할 수 있습니다.
          </p>
          <Link
            href="/apply"
            className={buttonVariants({ size: "lg", variant: "secondary", className: "mt-8 text-base" })}
          >
            그레이딩 신청하기
          </Link>
        </div>
      </section>

      {/* 서비스 흐름 */}
      <section className="py-16">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="text-center text-2xl font-bold">
            간편한 그레이딩 대행 프로세스
          </h2>
          <div className="mt-10 grid gap-6 grid-cols-2 sm:grid-cols-4 lg:grid-cols-7">
            {[
              { step: "01", title: "온라인 신청", desc: "웹에서 신청서 작성 및 결제" },
              { step: "02", title: "카드 전달", desc: "매장 방문 또는 택배 발송 (선택)" },
              { step: "03", title: "출고", desc: "월말 일괄로 국내 총판에 출고" },
              { step: "04", title: "해외 발송", desc: "총판에서 그레이딩 업체로 발송" },
              { step: "05", title: "등급 확정", desc: "그레이딩 업체 심사 완료" },
              { step: "06", title: "입고", desc: "그레이딩 완료 후 총판으로 입고" },
              { step: "07", title: "카드 수령", desc: "총판 → 매장 전달 후 고객 수령" },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
                  {item.step}
                </div>
                <h3 className="mt-3 font-semibold">{item.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 지원 그레이딩사 */}
      <section className="bg-muted py-16">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="text-center text-2xl font-bold">
            지원 그레이딩사
          </h2>
          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {GRADING_COMPANIES.map((company) => (
              <a
                key={company.value}
                href={company.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group rounded-xl border border-border bg-card p-6 text-center transition hover:border-primary hover:shadow-md"
              >
                <p className="text-2xl font-bold text-primary">
                  {company.label}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {company.description}
                </p>
                <p className="mt-2 text-[11px] text-muted-foreground/70 group-hover:text-primary">
                  공식 홈페이지 ↗
                </p>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16">
        <div className="mx-auto max-w-2xl px-4">
          <h2 className="text-center text-2xl font-bold">자주 묻는 질문</h2>
          <div className="mt-10 space-y-4">
            {[
              {
                q: "그레이딩 대행은 어떻게 진행되나요?",
                a: "온라인으로 신청서를 작성하고 결제한 뒤, 매장에 카드를 전달하시면 됩니다. 월말에 일괄 발송하며, 그레이딩 완료 후 매장 방문 또는 택배로 수령하실 수 있습니다.",
              },
              {
                q: "그레이딩 대행 신청을 위해 반드시 매장에 방문해야 하나요?",
                a: "아닙니다. 온라인으로 신청과 결제를 마치신 뒤, 퀵·택배 등 편하신 방법으로 카드만 매장에 전달하시면 접수가 진행됩니다. 다만 배송 과정에서 발생한 카드의 파손·분실에 대해서는 책임지지 않으니, 안전한 포장과 배송 방법(등기·보험 등)을 권장드립니다.\n\n매장 주소: 경기 안양시 동안구 평촌대로217번길 15 3층, 트레이너스",
              },
              {
                q: "그레이딩 완료 후 반드시 매장을 방문해서 수령해야 하나요?",
                a: "아닙니다. 매장 방문 수령과 택배 수령 중 편하신 방법을 선택하실 수 있습니다. 택배 수령을 선택하실 경우 별도 택배비(3,000원)가 후결제로 청구되며, 오버차지가 있는 경우 함께 결제하시면 발송이 진행됩니다.",
              },
              {
                q: "신청 후 취소가 가능한가요?",
                a: "총판(카드하비) 발송 전까지 전액 환불이 가능합니다. 총판 발송 이후에는 취소 및 환불이 불가합니다.",
              },
              {
                q: "오버차지란 무엇인가요?",
                a: "그레이딩사에서 추가 비용이 발생할 경우 오버차지가 청구됩니다. 마이페이지에서 추가 결제를 완료해야 카드를 수령하실 수 있습니다.",
              },
              {
                q: "소요기간은 얼마나 걸리나요?",
                a: "등급사와 서비스 등급에 따라 다릅니다. 신청 시 각 서비스별 예상 소요기간을 확인하실 수 있으며, 해외 발송/반송 기간이 추가됩니다.",
              },
              {
                q: "카드가 파손되거나 분실되면 어떻게 되나요?",
                a: "트레이너스 책임 구간에서 발생한 파손/분실은 신고가액을 기준으로 보상합니다. 수령 시 촬영한 사진이 증빙 자료로 활용됩니다.",
              },
            ].map((faq, i) => (
              <details
                key={i}
                className="group rounded-lg border border-border bg-card"
              >
                <summary className="cursor-pointer px-4 py-3 font-medium list-none flex items-center justify-between">
                  {faq.q}
                  <span className="text-muted-foreground transition-transform group-open:rotate-180">
                    ▼
                  </span>
                </summary>
                <p className="px-4 pb-4 text-sm text-muted-foreground whitespace-pre-line">
                  {faq.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* 매장 안내 */}
      <section className="bg-muted py-16">
        <div className="mx-auto max-w-2xl px-4 text-center">
          <h2 className="text-2xl font-bold">매장 안내</h2>
          <div className="mt-6 rounded-xl border border-border bg-card p-6 text-left">
            <div className="space-y-2 text-sm">
              <p>
                <span className="font-medium">주소:</span> 경기 안양시 동안구 평촌대로217번길 15 3층, 트레이너스
              </p>
              <p>
                <span className="font-medium">영업시간:</span> 월-토 12:00 ~ 22:00 / 일 12:00 ~ 21:00
              </p>
              <p>
                <span className="font-medium">연락처:</span> 0507-1352-2370
              </p>
            </div>
          </div>
          <a
            href="https://open.kakao.com/o/sfceDchh"
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ size: "lg", className: "mt-6 bg-[#FEE500] text-black hover:bg-[#FEE500]/90" })}
          >
            등급 문의 카카오톡 오픈채팅 ↗
          </a>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16">
        <div className="mx-auto max-w-2xl px-4 text-center">
          <h2 className="text-2xl font-bold">
            지금 바로 그레이딩을 신청하세요
          </h2>
          <p className="mt-2 text-muted-foreground">
            간편한 온라인 접수로 해외 그레이딩을 경험하세요.
          </p>
          <Link href="/apply" className={buttonVariants({ size: "lg", className: "mt-6" })}>
            그레이딩 신청하기
          </Link>
        </div>
      </section>
    </div>
  );
}
