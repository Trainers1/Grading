import { getActiveGradingServices } from "@/lib/orders/queries";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ApplyForm } from "./_components/apply-form";

// 서비스 가격 변경이 즉시 반영되도록 동적 렌더링.
export const dynamic = "force-dynamic";

export interface MyAddressSnapshot {
  postalCode: string;
  address: string;
  detail: string;
}

async function getMyAddress(): Promise<MyAddressSnapshot> {
  const empty = { postalCode: "", address: "", detail: "" };
  try {
    const supabase = await createServerClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return empty;
    const service = createServiceClient();
    const { data: profile } = await service
      .from("profiles")
      .select("postal_code, address, address_detail")
      .eq("id", data.user.id)
      .maybeSingle();
    return {
      postalCode: profile?.postal_code ?? "",
      address: profile?.address ?? "",
      detail: profile?.address_detail ?? "",
    };
  } catch {
    return empty;
  }
}

export default async function ApplyPage() {
  const [services, myAddress] = await Promise.all([
    getActiveGradingServices(),
    getMyAddress(),
  ]);
  return <ApplyForm services={services} myAddress={myAddress} />;
}
