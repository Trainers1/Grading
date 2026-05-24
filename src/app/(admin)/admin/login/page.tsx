import { getAdminLoginOptions } from "@/lib/orders/queries";
import { AdminLoginForm } from "./_components/admin-login-form";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  const options = await getAdminLoginOptions();
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-background p-8 shadow-sm">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-primary">TRAINERS Admin</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            관리자 로그인
          </p>
        </div>

        <AdminLoginForm options={options} />
      </div>
    </div>
  );
}
