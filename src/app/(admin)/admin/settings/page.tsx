import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  getAllAdminUsersForAdmin,
  getAllGradingServicesForAdmin,
} from "@/lib/orders/queries";
import { GradingServicesEditor } from "./_components/grading-services-editor";
import { AdminUsersEditor } from "./_components/admin-users-editor";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const admin = await requireAdmin();
  if (!admin) redirect("/admin/login");

  const isSuperAdmin = admin.adminRole === "SUPER_ADMIN";

  const [services, admins] = await Promise.all([
    getAllGradingServicesForAdmin(),
    getAllAdminUsersForAdmin(),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">설정</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          서비스 가격, 관리자 계정 관리
        </p>
      </div>

      <GradingServicesEditor services={services} canEdit={isSuperAdmin} />

      <AdminUsersEditor
        admins={admins}
        canManage={isSuperAdmin}
        currentAdminId={admin.adminId}
      />
    </div>
  );
}
