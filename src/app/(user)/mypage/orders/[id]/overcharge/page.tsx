import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { getMyOrderById } from "@/lib/orders/queries";
import { OverchargeClient } from "./_components/overcharge-client";

export const dynamic = "force-dynamic";

export default async function OverchargePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getMyOrderById(id);

  if (!result || !result.order.overchargeAmount) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-muted-foreground">
          오버차지 결제 대상이 아닙니다.
        </p>
        <Link
          href="/mypage/orders"
          className={buttonVariants({ variant: "outline", className: "mt-4" })}
        >
          목록으로
        </Link>
      </div>
    );
  }

  return <OverchargeClient order={result.order} />;
}
