"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { signOutAction } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";

export type MobileMenuProps = {
  displayName: string | null;
  isAdmin: boolean;
};

export function MobileMenu({ displayName, isAdmin }: MobileMenuProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const isLoggedIn = !!displayName;

  // 라우트 이동 시 자동 닫힘
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // 오버레이 열릴 때 body 스크롤 잠금
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label="메뉴 열기"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-md text-foreground hover:bg-muted sm:hidden"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 sm:hidden">
          <button
            type="button"
            aria-label="메뉴 닫기"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div
            className={cn(
              "absolute right-0 top-0 flex h-full w-72 max-w-[85vw] flex-col bg-background shadow-xl",
              "pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)]"
            )}
          >
            <div className="flex h-16 items-center justify-between border-b border-border px-4">
              <span className="text-lg font-bold text-primary">TRAINERS</span>
              <button
                type="button"
                aria-label="메뉴 닫기"
                onClick={() => setOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto p-4">
              <Link
                href="/apply"
                className="block rounded-md bg-primary px-4 py-3 text-center text-sm font-semibold text-primary-foreground"
              >
                그레이딩 신청
              </Link>

              <div className="mt-4 flex flex-col">
                {isLoggedIn ? (
                  <>
                    <MenuLink href="/mypage/orders" label="신청내역" />
                    <MenuLink href="/mypage" label="마이페이지" />
                  </>
                ) : (
                  <MenuLink href="/login" label="로그인" />
                )}
              </div>

              {isAdmin && (
                <>
                  <div className="my-3 border-t border-border" />
                  <MenuLink
                    href="/admin"
                    label="관리자 페이지"
                    accent
                  />
                </>
              )}
            </nav>

            {isLoggedIn && (
              <div className="border-t border-border p-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
                <p
                  className="truncate text-xs text-muted-foreground"
                  title={displayName ?? undefined}
                >
                  {displayName}
                </p>
                <form action={signOutAction} className="mt-2">
                  <button
                    type="submit"
                    className="w-full rounded-md border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    로그아웃
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function MenuLink({
  href,
  label,
  accent = false,
}: {
  href: string;
  label: string;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-md px-3 py-3 text-base font-medium transition-colors",
        accent
          ? "text-primary hover:bg-primary/10"
          : "text-foreground hover:bg-muted"
      )}
    >
      {label}
    </Link>
  );
}
