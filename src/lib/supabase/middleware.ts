import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function enforceAccess(
  request: NextRequest,
  isLoggedIn: boolean,
  baseResponse: NextResponse
): NextResponse {
  const { pathname } = request.nextUrl;
  const isProtectedUserPath =
    pathname.startsWith("/apply") || pathname.startsWith("/mypage");
  const isAdminPath =
    pathname.startsWith("/admin") && !pathname.startsWith("/admin/login");

  if (isProtectedUserPath && !isLoggedIn) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  if (isAdminPath && !isLoggedIn) {
    // 미들웨어는 "로그인 여부"만 검사. admin role 검증은 Server Component 에서
    // requireAdmin() 으로 수행 (DB 호출이 미들웨어 hot path 를 부풀리는 것을 회피).
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return baseResponse;
}

export async function updateSession(request: NextRequest) {
  // pathname 을 downstream layout/page 에서 읽기 위해 요청 헤더에 주입.
  // Next.js layout 은 자체적으로 pathname 을 알 수 없으므로 이 패턴이 표준이다.
  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.set("x-pathname", request.nextUrl.pathname);

  let supabaseResponse = NextResponse.next({
    request: { headers: forwardedHeaders },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    // env 누락: 모든 보호 경로를 로그인 페이지로 우회 (관리자 컨텍스트 부여 금지).
    // 로그인 페이지 자체는 Supabase 없이 렌더되며 signIn 시 actions.ts 에서
    // 다시 한번 env 누락을 fallback 에러로 처리한다.
    console.error("[auth] middleware: Supabase env missing");
    return enforceAccess(request, false, supabaseResponse);
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({
          request: { headers: forwardedHeaders },
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (err) {
    // Supabase outage: 세션 없음과 동일하게 처리 (P3 — fail-closed)
    console.error("[auth] middleware getUser failed", err);
  }

  return enforceAccess(request, !!user, supabaseResponse);
}
