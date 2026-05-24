// 푸시 구독 등록 Route Handler
// POST /api/push/subscribe
// Body: { endpoint: string; keys: { p256dh: string; auth: string }; userAgent?: string }
//
// 처리 순서:
//   1. Supabase auth.getUser() — 미로그인 시 401
//   2. endpoint 가 다른 user 에 이미 등록되었는지 확인 → 409
//   3. push_subscriptions upsert (endpoint UNIQUE — ON CONFLICT DO UPDATE)
//   4. 201 { success: true }

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// 세션 쿠키 의존 — 정적 prerender 회피
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // 1. 인증 세션 확인
  let authUserId: string;
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
    authUserId = data.user.id;
    authEmail = data.user.email;
  } catch (err) {
    console.error("[push] subscribe auth failed", err);
    return NextResponse.json(
      { error: "인증 처리 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }

  // 요청 바디 파싱
  let body: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
    userAgent?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "잘못된 요청 형식입니다" },
      { status: 400 }
    );
  }

  const { endpoint, keys, userAgent } = body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json(
      { error: "endpoint, keys.p256dh, keys.auth 필드가 필요합니다" },
      { status: 400 }
    );
  }

  // Push provider hostname allowlist (SSRF 방어)
  const PUSH_HOST_ALLOWLIST = [
    "fcm.googleapis.com",
    "updates.push.services.mozilla.com",
    "wns2-by3p.notify.windows.com",
    "web.push.apple.com",
  ];

  let parsedEndpoint: URL;
  try {
    parsedEndpoint = new URL(endpoint);
  } catch {
    return NextResponse.json({ error: "잘못된 endpoint URL" }, { status: 400 });
  }
  if (parsedEndpoint.protocol !== "https:") {
    return NextResponse.json({ error: "https endpoint만 허용됩니다" }, { status: 400 });
  }
  const isKnownProvider = PUSH_HOST_ALLOWLIST.some(
    (host) => parsedEndpoint.hostname === host || parsedEndpoint.hostname.endsWith("." + host)
  );
  if (!isKnownProvider) {
    return NextResponse.json({ error: "알 수 없는 push provider" }, { status: 400 });
  }

  // base64url 형식 검증 (p256dh/auth)
  const isBase64Url = (s: string) => typeof s === "string" && /^[A-Za-z0-9_-]+=*$/.test(s);
  if (!isBase64Url(keys.p256dh) || !isBase64Url(keys.auth)) {
    return NextResponse.json({ error: "잘못된 키 형식입니다" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // 2. Endpoint ownership 가드 (Pre-mortem 5.3)
  //    같은 endpoint가 다른 user에 이미 등록되었는지 확인
  const { data: existing } = await supabase
    .from("push_subscriptions")
    .select("subscriber_email")
    .eq("endpoint", endpoint)
    .maybeSingle();

  if (existing && existing.subscriber_email !== authEmail) {
    // PII 마스킹: endpoint prefix 8자만 로그에 기록
    const endpointPrefix = endpoint.slice(0, 8);
    console.error(
      `[push] subscribe rejected reason=ENDPOINT_OWNERSHIP_MISMATCH endpoint=${endpointPrefix}...`
    );
    return NextResponse.json(
      { error: "이미 다른 계정에 등록된 엔드포인트입니다" },
      { status: 409 }
    );
  }

  // 3. push_subscriptions upsert
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      subscriber_email: authEmail,
      user_id: authUserId,
      endpoint,
      p256dh: keys.p256dh,
      auth_key: keys.auth,
      user_agent: userAgent ?? null,
      // 재구독 시 만료 해제
      expired_at: null,
    },
    {
      onConflict: "endpoint",
    }
  );

  if (error) {
    console.error("[push] subscribe db error", error.message);
    return NextResponse.json(
      { error: "구독 등록 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
