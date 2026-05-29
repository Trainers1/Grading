import Link from "next/link";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { signOutAction } from "@/lib/auth/actions";
import { requireAdmin } from "@/lib/auth/require-admin";
import { MobileMenu } from "./mobile-menu";

export async function UserHeader() {
  let displayName: string | null = null;
  try {
    const supabase = await createServerClient();
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", user.id)
        .maybeSingle();
      displayName = profile?.name?.trim() || user.email || null;
    }
  } catch {
    displayName = null;
  }

  const isLoggedIn = !!displayName;

  // admin 권한 체크 — 로그인 사용자만 조회 시도. 비용을 줄이려고
  // displayName 이 있을 때만 호출하지만, requireAdmin 자체도 anon 세션
  // 없을 때 즉시 null 반환이라 안전.
  let isAdmin = false;
  if (isLoggedIn) {
    try {
      const admin = await requireAdmin();
      isAdmin = !!admin;
    } catch {
      isAdmin = false;
    }
  }

  return (
    <header
      className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div
        className="mx-auto flex h-16 max-w-7xl items-center justify-between"
        style={{
          paddingLeft: "max(1rem, env(safe-area-inset-left))",
          paddingRight: "max(1rem, env(safe-area-inset-right))",
        }}
      >
        <Link href="/" className="text-xl font-bold text-primary">
          TRAINERS
        </Link>

        {/* 데스크탑 nav (sm 이상) */}
        <nav className="hidden items-center gap-4 sm:flex">
          <Link
            href="/apply"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            그레이딩 신청
          </Link>

          {isLoggedIn ? (
            <>
              <Link
                href="/mypage/orders"
                className="text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                신청내역
              </Link>
              <Link
                href="/mypage"
                className="text-sm font-medium text-foreground hover:text-primary"
              >
                {displayName}
              </Link>
              {isAdmin && (
                <Link
                  href="/admin"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  관리자
                </Link>
              )}
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  로그아웃
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/login"
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              로그인
            </Link>
          )}
        </nav>

        {/* 모바일 햄버거 (sm 미만) */}
        <MobileMenu displayName={displayName} isAdmin={isAdmin} />
      </div>
    </header>
  );
}
