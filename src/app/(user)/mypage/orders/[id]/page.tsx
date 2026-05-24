import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { getMyOrderById } from "@/lib/orders/queries";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { OrderDetailClient } from "./_components/order-detail-client";

export const dynamic = "force-dynamic";

export interface MyAddressSnapshot {
  postalCode: string;
  address: string;
  detail: string;
}

async function getMyAddress(): Promise<MyAddressSnapshot> {
  const empty: MyAddressSnapshot = { postalCode: "", address: "", detail: "" };
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

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [result, myAddress] = await Promise.all([
    getMyOrderById(id),
    getMyAddress(),
  ]);

  if (!result) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-muted-foreground">주문을 찾을 수 없습니다.</p>
        <Link
          href="/mypage/orders"
          className={buttonVariants({ variant: "outline", className: "mt-4" })}
        >
          목록으로
        </Link>
      </div>
    );
  }

  return (
    <OrderDetailClient
      order={result.order}
      cards={result.cards}
      myAddress={myAddress}
    />
  );
}
