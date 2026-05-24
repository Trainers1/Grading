import { getMyOrders } from "@/lib/orders/queries";
import { MyOrdersList } from "./_components/my-orders-list";

export const dynamic = "force-dynamic";

export default async function MyOrdersPage() {
  const orders = await getMyOrders();
  return <MyOrdersList orders={orders} />;
}
