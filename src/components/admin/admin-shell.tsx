"use client";

import { usePathname } from "next/navigation";
import { AdminSidebar } from "./admin-sidebar";

export function AdminShell({
  children,
  adminEmail,
}: {
  children: React.ReactNode;
  adminEmail: string | null;
}) {
  const pathname = usePathname();
  const hideShell = pathname === "/admin/login";

  if (hideShell) return <>{children}</>;

  return (
    <div className="flex min-h-screen">
      <AdminSidebar adminEmail={adminEmail} />
      <main className="flex-1 bg-muted/30 p-6">{children}</main>
    </div>
  );
}
