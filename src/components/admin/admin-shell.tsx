"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AdminSidebar } from "./admin-sidebar";
import { cn } from "@/lib/utils";

export function AdminShell({
  children,
  adminEmail,
}: {
  children: React.ReactNode;
  adminEmail: string | null;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // 라우트 이동 시 drawer 자동 닫힘
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // drawer 열릴 때 body 스크롤 잠금
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  const hideShell = pathname === "/admin/login";
  if (hideShell) return <>{children}</>;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* 모바일 top bar (md 미만) */}
      <header
        className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background px-3 md:hidden"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <button
          type="button"
          aria-label="메뉴 열기"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(true)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-foreground hover:bg-muted"
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
        <span className="text-base font-bold text-primary">TRAINERS Admin</span>
      </header>

      {/* 데스크탑 고정 사이드바 (md 이상) */}
      <div className="hidden md:flex">
        <AdminSidebar adminEmail={adminEmail} />
      </div>

      {/* 모바일 drawer (md 미만) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="메뉴 닫기"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div
            className={cn(
              "absolute left-0 top-0 h-full w-72 max-w-[85vw] bg-background shadow-xl"
            )}
            style={{ paddingTop: "env(safe-area-inset-top)" }}
          >
            <AdminSidebar
              adminEmail={adminEmail}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </div>
      )}

      <main className="flex-1 bg-muted/30 p-4 md:p-6">{children}</main>
    </div>
  );
}
