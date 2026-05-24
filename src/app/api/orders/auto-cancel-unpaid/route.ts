// 결제 미완료 주문 자동 취소 Route Handler
// GET /api/orders/auto-cancel-unpaid (Vercel Cron 호환)
//
// 처리 순서:
//   1. Authorization: Bearer ${CRON_SECRET} 헤더 검증 (constant-time)
//   2. auto_cancel_unpaid_orders() RPC 호출
//      → 신청 후 3일이 지나도록 PAYMENT_PENDING 상태로 남은 주문을
//        cancelled_at + cancel_reason 으로 자동 취소
//   3. { cancelled, durationMs } 응답

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
    console.error("[auto-cancel-unpaid] CRON_SECRET 환경변수 누락");
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
    const { data, error } = await service.rpc("auto_cancel_unpaid_orders");

    if (error) {
      console.error("[auto-cancel-unpaid] RPC failed", error);
      return NextResponse.json(
        { error: "자동 취소 처리 중 오류가 발생했습니다" },
        { status: 500 }
      );
    }

    const cancelled = typeof data === "number" ? data : 0;
    const durationMs = Date.now() - start;
    console.info(
      `[auto-cancel-unpaid] cancelled=${cancelled} durationMs=${durationMs}`
    );

    return NextResponse.json({ cancelled, durationMs }, { status: 200 });
  } catch (err: unknown) {
    const message = (err as { message?: string }).message ?? String(err);
    console.error("[auto-cancel-unpaid] 실행 오류", message);
    return NextResponse.json(
      { error: "auto-cancel-unpaid 처리 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}
