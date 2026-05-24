import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdmin } from "@/lib/auth/require-admin";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 로그인 페이지는 인증/가드 우회 — 무한 리다이렉트 방지.
  // pathname 은 미들웨어가 주입한 x-pathname 헤더로 판별한다.
  const hdrs = await headers();
  const pathname = hdrs.get("x-pathname") ?? "";
  if (pathname === "/admin/login") {
    return <AdminShell adminEmail={null}>{children}</AdminShell>;
  }

  const admin = await requireAdmin();
  if (!admin) {
    redirect("/admin/login");
  }

  return <AdminShell adminEmail={admin.email}>{children}</AdminShell>;
}
