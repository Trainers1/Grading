"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { signOutAdminAction } from "@/lib/auth/actions";

const menuItems = [
  { href: "/admin", label: "대시보드", icon: "📊" },
  { href: "/admin/orders", label: "주문 관리", icon: "📋" },
  { href: "/admin/batches", label: "택배 발송", icon: "📦" },
  { href: "/admin/grading", label: "등급 결과", icon: "🏅" },
  { href: "/admin/overcharges", label: "오버차지", icon: "💰" },
  { href: "/admin/users", label: "회원 관리", icon: "👥" },
  { href: "/admin/notifications", label: "알림", icon: "🔔" },
  { href: "/admin/settings", label: "설정", icon: "⚙️" },
  { href: "/admin/my-account", label: "내 계정", icon: "👤" },
];

export function AdminSidebar({
  adminEmail,
  onNavigate,
}: {
  adminEmail?: string | null;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-full flex-col border-r border-border bg-background md:w-64">
      <div className="flex h-16 items-center border-b border-border px-6">
        <Link
          href="/admin"
          onClick={onNavigate}
          className="text-xl font-bold text-primary"
        >
          TRAINERS Admin
        </Link>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-4">
        {menuItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/admin" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {adminEmail && (
        <div
          className="border-t border-border p-4"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom), 1rem)" }}
        >
          <p className="truncate text-xs text-muted-foreground" title={adminEmail}>
            {adminEmail}
          </p>
          <form action={signOutAdminAction} className="mt-2">
            <button
              type="submit"
              className="w-full rounded-md border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              로그아웃
            </button>
          </form>
        </div>
      )}
    </aside>
  );
}
