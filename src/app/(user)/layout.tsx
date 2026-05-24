import { UserHeader } from "@/components/user/user-header";
import { UserFooter } from "@/components/user/user-footer";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { InstallBanner } from "@/components/pwa/install-banner";

export default function UserLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <UserHeader />
      <main className="flex-1">{children}</main>
      <UserFooter />
      <ServiceWorkerRegister />
      <InstallBanner />
    </div>
  );
}
