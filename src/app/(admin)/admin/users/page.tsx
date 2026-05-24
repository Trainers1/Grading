import {
  getAllProfilesForAdmin,
  getAllOrdersForAdmin,
} from "@/lib/orders/queries";
import { BlockToggle } from "./_components/block-toggle";

export const dynamic = "force-dynamic";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR");
}

const PROVIDER_LABELS: Record<string, string> = {
  email: "이메일",
  kakao: "카카오",
  naver: "네이버",
};

export default async function UsersPage() {
  const [users, orders] = await Promise.all([
    getAllProfilesForAdmin(),
    getAllOrdersForAdmin(),
  ]);

  // Order.userId === profiles.id (auth user id) 로 매칭
  const orderCountByUser = orders.reduce<Record<string, number>>(
    (acc, o) => {
      acc[o.userId] = (acc[o.userId] ?? 0) + 1;
      return acc;
    },
    {}
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">회원 관리</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          총 {users.length}명
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-5 py-3">이름</th>
              <th className="px-5 py-3">이메일</th>
              <th className="px-5 py-3">연락처</th>
              <th className="px-5 py-3">가입 경로</th>
              <th className="px-5 py-3">주문 수</th>
              <th className="px-5 py-3">상태</th>
              <th className="px-5 py-3">가입일</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-border">
                <td className="px-5 py-3 font-medium">
                  {u.name}
                  {!u.phoneVerified && (
                    <span className="ml-2 rounded bg-warning/10 px-1.5 py-0.5 text-xs text-warning">
                      미인증
                    </span>
                  )}
                </td>
                <td className="px-5 py-3 text-muted-foreground">{u.email}</td>
                <td className="px-5 py-3">{u.phone}</td>
                <td className="px-5 py-3 text-muted-foreground">
                  {u.provider ? PROVIDER_LABELS[u.provider] : "-"}
                </td>
                <td className="px-5 py-3">{orderCountByUser[u.id] ?? 0}</td>
                <td className="px-5 py-3">
                  {u.isBlocked ? (
                    <span
                      className="rounded-md bg-error/10 px-2 py-1 text-xs font-medium text-error"
                      title={u.blockReason}
                    >
                      차단
                    </span>
                  ) : (
                    <span className="rounded-md bg-success/10 px-2 py-1 text-xs font-medium text-success">
                      활성
                    </span>
                  )}
                </td>
                <td className="px-5 py-3 text-muted-foreground">
                  {formatDate(u.createdAt)}
                </td>
                <td className="px-5 py-3">
                  <BlockToggle
                    userId={u.id}
                    initialBlocked={u.isBlocked}
                    initialReason={u.blockReason}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
