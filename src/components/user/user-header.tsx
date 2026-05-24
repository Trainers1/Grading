import Link from "next/link";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { signOutAction } from "@/lib/auth/actions";

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

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <Link href="/" className="text-xl font-bold text-primary">
          TRAINERS
        </Link>

        <nav className="flex items-center gap-4">
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
      </div>
    </header>
  );
}
