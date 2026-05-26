import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdmin } from "@/lib/auth/require-admin";

// 어드민 영역은 일반 사용자 PWA 와 분리된 manifest 를 사용 — 어드민 페이지에서
// 브라우저 "앱 설치" 프롬프트가 뜨면 "트레이너스 관리자" 별도 PWA 아이콘이 설치된다.
// 정의는 src/app/(admin)/admin/manifest.webmanifest/route.ts 참고.
export const metadata: Metadata = {
  title: "TRAINERS Admin",
  manifest: "/admin/manifest.webmanifest",
};

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
