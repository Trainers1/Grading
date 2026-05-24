import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/service";
import { MyAccountForms } from "./_components/my-account-forms";

export const dynamic = "force-dynamic";

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "슈퍼 관리자",
  GENERAL_ADMIN: "일반 관리자",
  STORE_SHARED: "매장 공유 계정",
};

export default async function MyAccountPage() {
  const admin = await requireAdmin();
  if (!admin) redirect("/admin/login");

  // 현재 닉네임은 admin_users 에서 다시 조회 — requireAdmin 결과에는 nickname 없음
  const service = createServiceClient();
  const { data: row } = await service
    .from("admin_users")
    .select("nickname, name")
    .eq("id", admin.adminId)
    .maybeSingle();

  const currentNickname = row?.nickname ?? "";
  const currentName = row?.name ?? admin.name;
  const roleLabel = ROLE_LABELS[admin.adminRole] ?? admin.adminRole;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">내 계정</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          닉네임·이름·비밀번호 관리 · 역할:{" "}
          <span className="font-medium">{roleLabel}</span>
        </p>
      </div>

      <MyAccountForms
        initialNickname={currentNickname}
        initialName={currentName}
      />
    </div>
  );
}
