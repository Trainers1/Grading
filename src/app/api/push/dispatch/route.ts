// 푸시 알림 dispatch Route Handler (Vercel Cron 호환)
// GET /api/push/dispatch
//
// 처리 순서:
//   1. Authorization: Bearer ${CRON_SECRET} 헤더 검증 (constant-time, crypto.timingSafeEqual)
//   2. runDispatcher() 호출
//   3. 결과 통계 응답: { processed, dispatched, expired, failed, skipped, durationMs }

import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runDispatcher } from "@/lib/push/dispatcher";

// Node.js 런타임 명시 — web-push 라이브러리는 Edge Runtime 미지원
export const runtime = "nodejs";
// Bearer 헤더 + cron 실행 — 정적 prerender 회피
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // 1. Bearer 검증 (constant-time 비교 — timing attack 방지, plan R4)
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("[push] CRON_SECRET 환경변수 누락");
    return NextResponse.json(
      { error: "서버 설정 오류" },
      { status: 500 }
    );
  }

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "인증이 필요합니다" },
      { status: 401 }
    );
  }

  const provided = authHeader.slice("Bearer ".length);

  // crypto.timingSafeEqual은 동일 길이 Buffer만 비교 가능
  let authorized = false;
  try {
    const providedBuf = Buffer.from(provided, "utf8");
    const expectedBuf = Buffer.from(cronSecret, "utf8");
    if (providedBuf.length !== expectedBuf.length) {
      // 길이 불일치 — authorized = false 유지 (내용 유출 없음)
    } else {
      authorized = timingSafeEqual(providedBuf, expectedBuf);
    }
  } catch {
    authorized = false;
  }

  if (!authorized) {
    return NextResponse.json(
      { error: "인증 실패" },
      { status: 401 }
    );
  }

  // 2. dispatcher 실행
  try {
    const result = await runDispatcher();
    return NextResponse.json(result, { status: 200 });
  } catch (err: unknown) {
    const message = (err as { message?: string }).message ?? String(err);
    console.error("[push] dispatcher 실행 오류", message);
    return NextResponse.json(
      { error: "dispatch 처리 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}
