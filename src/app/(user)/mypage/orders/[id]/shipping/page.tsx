import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { getMyOrderById, getMyOrders } from "@/lib/orders/queries";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveOrderShippingAddress, type ProfileAddress } from "@/lib/address";
import { ShippingClient } from "./_components/shipping-client";

export const dynamic = "force-dynamic";

async function getMyProfileAddress(): Promise<ProfileAddress | null> {
  try {
    const supabase = await createServerClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return null;
    const service = createServiceClient();
    const { data: profile } = await service
      .from("profiles")
      .select("postal_code, address, address_detail")
      .eq("id", data.user.id)
      .maybeSingle();
    if (!profile) return null;
    return {
      postalCode: profile.postal_code ?? "",
      address: profile.address ?? "",
      detail: profile.address_detail ?? "",
    };
  } catch {
    return null;
  }
}

export default async function ShippingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getMyOrderById(id);
  const order = result?.order;

  // 택배비 결제 대상: 택배 수령 + 트레이너스 도착 단계.
  const eligible =
    order != null &&
    order.pickupMethod === "DELIVERY" &&
    order.orderStatus === "TRAINERS_ARRIVED";

  if (!eligible) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-muted-foreground">택배비 결제 대상이 아닙니다.</p>
        <Link
          href="/mypage/orders"
          className={buttonVariants({ variant: "outline", className: "mt-4" })}
        >
          목록으로
        </Link>
      </div>
    );
  }

  // 이미 결제된 경우 — 중복 결제 방지.
  if (order.shipmentGroupId) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-muted-foreground">
          이미 택배비가 결제된 주문입니다.
        </p>
        <Link
          href={`/mypage/orders/${order.id}`}
          className={buttonVariants({ variant: "outline", className: "mt-4" })}
        >
          주문 상세로
        </Link>
      </div>
    );
  }

  const profileAddress = await getMyProfileAddress();

  // 합배송 후보 — 같은 고객 / 택배 수령 / 트레이너스 도착 / 미결제 / 배송지 동일.
  // addressSource='MY' 인 주문은 최신 회원 주소(profile)로 resolve 후 비교한다.
  // → 신청 당시 MY 로 입력하고 이후 회원 정보 주소가 바뀌었더라도 동일 박스로 묶을 수 있다.
  const addressKey = (o: typeof order) => {
    const parts = resolveOrderShippingAddress(o, profileAddress);
    return [
      (parts.postalCode ?? "").trim(),
      (parts.address ?? "").trim(),
      (parts.detail ?? "").trim(),
    ].join("|");
  };
  const currentAddressKey = addressKey(order);
  const allOrders = await getMyOrders();
  const combinableOrders = allOrders.filter(
    (o) =>
      o.id !== order.id &&
      o.pickupMethod === "DELIVERY" &&
      o.orderStatus === "TRAINERS_ARRIVED" &&
      !o.shipmentGroupId &&
      addressKey(o) === currentAddressKey
  );

  return (
    <ShippingClient
      order={order}
      combinableOrders={combinableOrders}
      profileAddress={profileAddress}
    />
  );
}
