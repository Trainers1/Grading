// 택배 발송 주문 자동 수령 완료 Route Handler
// GET /api/orders/auto-complete-delivered (Vercel Cron 호환)
//
// 처리 순서:
//   1. Authorization: Bearer ${CRON_SECRET} 헤더 검증 (constant-time)
//   2. auto_complete_delivered_orders() RPC 호출
//      → 택배 송장 입력 후 5일이 지난 TRAINERS_ARRIVED+DELIVERY 주문을
//        order_status='COMPLETED' 로 자동 전환
//   3. { completed, durationMs } 응답

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
    console.error("[auto-complete-delivered] CRON_SECRET 환경변수 누락");
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
    const { data, error } = await service.rpc("auto_complete_delivered_orders");

    if (error) {
      console.error("[auto-complete-delivered] RPC failed", error);
      return NextResponse.json(
        { error: "자동 수령 완료 처리 중 오류가 발생했습니다" },
        { status: 500 }
      );
    }

    const completed = typeof data === "number" ? data : 0;
    const durationMs = Date.now() - start;
    console.info(
      `[auto-complete-delivered] completed=${completed} durationMs=${durationMs}`
    );

    return NextResponse.json({ completed, durationMs }, { status: 200 });
  } catch (err: unknown) {
    const message = (err as { message?: string }).message ?? String(err);
    console.error("[auto-complete-delivered] 실행 오류", message);
    return NextResponse.json(
      { error: "auto-complete-delivered 처리 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}
