// 푸시 구독 해지 Route Handler
// POST /api/push/unsubscribe
// Body: { endpoint: string }
//
// 처리 순서:
//   1. Supabase auth.getUser() — 미로그인 시 401
//   2. push_subscriptions.expired_at = now() WHERE endpoint = $1 AND subscriber_email = $2
//      (다른 email 소유 endpoint는 row 변경 0건으로 조용히 무시)
//   3. 200 { success: true }

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// 세션 쿠키 의존 — 정적 prerender 회피
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // 1. 인증 세션 확인
  let authEmail: string;
  try {
    const supabase = await createServerClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user || !data.user.email) {
      return NextResponse.json(
        { error: "로그인이 필요합니다" },
        { status: 401 }
      );
    }
    authEmail = data.user.email;
  } catch (err) {
    console.error("[push] unsubscribe auth failed", err);
    return NextResponse.json(
      { error: "인증 처리 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }

  // 요청 바디 파싱
  let body: { endpoint?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "잘못된 요청 형식입니다" },
      { status: 400 }
    );
  }

  const { endpoint } = body;
  if (!endpoint) {
    return NextResponse.json(
      { error: "endpoint 필드가 필요합니다" },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  // 2. 본인 소유 endpoint만 만료 처리 (다른 email 소유분은 0 rows updated — silent ok)
  const { error } = await supabase
    .from("push_subscriptions")
    .update({ expired_at: new Date().toISOString() })
    .eq("endpoint", endpoint)
    .eq("subscriber_email", authEmail);

  if (error) {
    console.error("[push] unsubscribe db error", error.message);
    return NextResponse.json(
      { error: "구독 해지 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
