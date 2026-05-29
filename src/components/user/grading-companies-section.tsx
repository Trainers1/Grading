"use client";

import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { GRADING_COMPANIES } from "@/constants/grading";
import { cn } from "@/lib/utils";

type Company = (typeof GRADING_COMPANIES)[number];

// 각 그레이딩사 한국어 소개 — 팝업 우측 설명에 사용.
const COMPANY_BLURBS: Record<string, string> = {
  PSA: "전 세계에서 가장 널리 알려진 트레이딩 카드 그레이딩 업체로, 1~10 등급 체계를 사용합니다.",
  BGS: "Beckett의 카드 그레이딩 서비스로, 센터링·코너·엣지·표면 4개 항목 서브등급 평가로 잘 알려져 있습니다.",
  CGC: "코믹과 트레이딩 카드 그레이딩을 전문으로 하는 업체입니다.",
  BRG: "국내 트레이딩 카드 그레이딩 업체입니다.",
};

export function GradingCompaniesSection() {
  const [active, setActive] = useState<Company | null>(null);

  // ESC 닫기 + 모달 열림 동안 배경 스크롤 잠금
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActive(null);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [active]);

  return (
    <>
      <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {GRADING_COMPANIES.map((company) => (
          <button
            key={company.value}
            type="button"
            onClick={() => setActive(company)}
            className="group rounded-xl border border-border bg-card p-4 text-center transition hover:border-primary hover:shadow-md sm:p-6"
          >
            <p className="text-xl font-bold text-primary sm:text-2xl">
              {company.label}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {company.description}
            </p>
            <p className="mt-2 text-[11px] text-muted-foreground/70 group-hover:text-primary">
              자세히 보기
            </p>
          </button>
        ))}
      </div>

      {active && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${active.label} 안내`}
          onClick={() => setActive(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative flex w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-card shadow-2xl sm:flex-row"
          >
            {/* 닫기 버튼 */}
            <button
              type="button"
              onClick={() => setActive(null)}
              aria-label="닫기"
              className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-background/80 text-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              ✕
            </button>

            {/* 왼쪽: 그레이딩 카드 이미지 (추후 추가) */}
            <div className="flex w-full shrink-0 items-center justify-center bg-muted p-6 sm:w-2/5">
              <div className="flex aspect-[5/7] w-full items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
                이미지 준비 중
              </div>
            </div>

            {/* 오른쪽: 설명 + 공식 홈페이지 이동 */}
            <div className="flex flex-1 flex-col p-6">
              <p className="text-2xl font-bold text-primary">{active.label}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {active.description}
              </p>
              <p className="mt-4 flex-1 text-sm leading-relaxed text-foreground">
                {COMPANY_BLURBS[active.value]}
              </p>
              <a
                href={active.url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ size: "lg" }), "mt-6 w-full")}
              >
                공식 홈페이지로 이동 ↗
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
