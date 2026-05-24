// 출고(SHIPPED_OUT) → 그레이딩 진행 중(DISTRIBUTOR_SHIPPED) 자동 승격 Route Handler
// GET /api/orders/auto-promote (Vercel Cron 호환)
//
// 처리 순서:
//   1. Authorization: Bearer ${CRON_SECRET} 헤더 검증 (constant-time)
//   2. promote_shipped_to_in_grading() RPC 호출
//   3. { promoted, durationMs } 응답
//
// 부수 효과: orders.order_status UPDATE → log_orders_status_change 트리거 → status_log row 생성
//          → fn_enqueue_milestone_dispatch 트리거 → DISTRIBUTOR_SHIPPED milestone outbox enqueue.

import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const start = Date.now();

  // 1. Bearer 검증
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("[auto-promote] CRON_SECRET 환경변수 누락");
    return NextResponse.json({ error: "서버 설정 오류" }, { status: 500 });
  }

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const provided = authHeader.slice("Bearer ".length);
  let authorized = false;
  try {
    const providedBuf = Buffer.from(provided, "utf8");
    const expectedBuf = Buffer.from(cronSecret, "utf8");
    if (providedBuf.length === expectedBuf.length) {
      authorized = timingSafeEqual(providedBuf, expectedBuf);
    }
  } catch {
    authorized = false;
  }

  if (!authorized) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }

  // 2. RPC 호출
  try {
    const service = createServiceClient();
    const { data, error } = await service.rpc("promote_shipped_to_in_grading");

    if (error) {
      console.error("[auto-promote] RPC failed", error);
      return NextResponse.json(
        { error: "자동 승격 처리 중 오류가 발생했습니다" },
        { status: 500 }
      );
    }

    const promoted = typeof data === "number" ? data : 0;
    const durationMs = Date.now() - start;
    console.info(
      `[auto-promote] promoted=${promoted} durationMs=${durationMs}`
    );

    return NextResponse.json({ promoted, durationMs }, { status: 200 });
  } catch (err: unknown) {
    const message = (err as { message?: string }).message ?? String(err);
    console.error("[auto-promote] 실행 오류", message);
    return NextResponse.json(
      { error: "auto-promote 처리 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}
