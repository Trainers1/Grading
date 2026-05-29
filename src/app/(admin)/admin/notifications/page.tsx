// 푸시 알림 모니터링 페이지 (admin observability, B6)
// Server Component — service_role 클라이언트로 notifications_outbox 직접 조회
//
// 권한: requireAdmin() + SUPER_ADMIN / GENERAL_ADMIN 화이트리스트.
// STORE_SHARED 는 운영 관측 데이터 노출에서 제외.

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/service";

// 실시간 outbox 조회 — 정적 prerender 회피 (B6 admin observability)
export const dynamic = "force-dynamic";

// ── 날짜 포맷 헬퍼 ─────────────────────────────────────────────────────────

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ── 타입 ───────────────────────────────────────────────────────────────────

type OutboxFailRow = {
  id: string;
  order_id: string;
  status_key: string;
  last_error: string | null;
  attempt_count: number;
  created_at: string;
};

// ── 페이지 ─────────────────────────────────────────────────────────────────

export default async function NotificationsMonitorPage() {
  // 권한 검증 — admin role 필요
  const admin = await requireAdmin();
  if (!admin) {
    redirect("/admin/login");
  }
  // STORE_SHARED 역할은 운영 관측 데이터 접근 차단
  if (admin.adminRole !== "SUPER_ADMIN" && admin.adminRole !== "GENERAL_ADMIN") {
    redirect("/admin");
  }

  const supabase = createServiceClient();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // 최근 24h last_error IS NOT NULL 행
  const { data: failRows } = await supabase
    .from("notifications_outbox")
    .select("id, order_id, status_key, last_error, attempt_count, created_at")
    .not("last_error", "is", null)
    .gte("created_at", since24h)
    .order("created_at", { ascending: false })
    .limit(100);

  // 실패율 계산용: 24h 이내 dispatched_at 또는 last_error 존재 행 카운트
  const { count: totalCount } = await supabase
    .from("notifications_outbox")
    .select("*", { count: "exact", head: true })
    .gte("created_at", since24h)
    .or("dispatched_at.not.is.null,last_error.not.is.null");

  const { count: failCount } = await supabase
    .from("notifications_outbox")
    .select("*", { count: "exact", head: true })
    .not("last_error", "is", null)
    .gte("created_at", since24h);

  // 마지막 성공 dispatch 시각
  const { data: lastSuccessRow } = await supabase
    .from("notifications_outbox")
    .select("dispatched_at")
    .not("dispatched_at", "is", null)
    .is("last_error", null)
    .order("dispatched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const failRate =
    totalCount && totalCount > 0
      ? ((failCount ?? 0) / totalCount) * 100
      : 0;

  const lastSuccessAt = lastSuccessRow?.dispatched_at ?? null;
  const lastSuccessAgo = lastSuccessAt
    ? Date.now() - new Date(lastSuccessAt).getTime()
    : null;
  const lastSuccessLabel = lastSuccessAt
    ? formatDateTime(lastSuccessAt)
    : "없음";

  // 마지막 성공이 10분 초과이면 경고 표시 (plan §2.3)
  const isStale = lastSuccessAgo !== null && lastSuccessAgo > 10 * 60 * 1000;

  const typedFailRows: OutboxFailRow[] = (failRows as OutboxFailRow[]) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">푸시 알림 모니터링</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          최근 24시간 발송 현황 및 실패 로그
        </p>
      </div>

      {/* 요약 지표 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-3 sm:p-5">
          <p className="text-sm text-muted-foreground">실패율 (24h)</p>
          <p
            className={`mt-2 text-3xl font-bold ${
              failRate > 10 ? "text-error" : failRate > 0 ? "text-warning" : "text-success"
            }`}
          >
            {failRate.toFixed(1)}%
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {failCount ?? 0} / {totalCount ?? 0} 건
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-3 sm:p-5">
          <p className="text-sm text-muted-foreground">마지막 성공 발송</p>
          <p
            className={`mt-2 text-base font-semibold ${
              isStale ? "text-error" : "text-foreground"
            }`}
          >
            {lastSuccessLabel}
          </p>
          {isStale && (
            <p className="mt-1 text-xs text-error">
              10분 이상 경과 — cron 동작 확인 필요
            </p>
          )}
          {lastSuccessAgo !== null && !isStale && (
            <p className="mt-1 text-xs text-muted-foreground">
              {formatDuration(lastSuccessAgo)} 전
            </p>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-3 sm:p-5">
          <p className="text-sm text-muted-foreground">실패 행 수 (24h)</p>
          <p
            className={`mt-2 text-3xl font-bold ${
              (failCount ?? 0) > 0 ? "text-error" : "text-success"
            }`}
          >
            {failCount ?? 0}
          </p>
        </div>
      </div>

      {/* 실패 로그 테이블 */}
      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border p-5">
          <h2 className="font-semibold">최근 24h 실패 목록</h2>
        </div>

        {typedFailRows.length === 0 ? (
          <div className="p-5 text-sm text-muted-foreground">
            최근 24시간 내 실패 건이 없습니다.
          </div>
        ) : (
          <>
            {/* 데스크탑 테이블 (md 이상) */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3">주문번호</th>
                    <th className="px-5 py-3">상태 키</th>
                    <th className="px-5 py-3">시도 횟수</th>
                    <th className="px-5 py-3">오류 내용</th>
                    <th className="px-5 py-3">발생 시각</th>
                  </tr>
                </thead>
                <tbody>
                  {typedFailRows.map((row) => (
                    <tr key={row.id} className="border-t border-border">
                      <td className="px-5 py-3 font-mono text-primary">
                        {row.order_id}
                      </td>
                      <td className="px-5 py-3">{row.status_key}</td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            row.attempt_count >= 5
                              ? "bg-error/10 text-error"
                              : row.attempt_count >= 3
                              ? "bg-warning/10 text-warning"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {row.attempt_count}회
                          {row.attempt_count >= 5 && " (dead letter)"}
                        </span>
                      </td>
                      <td className="max-w-xs truncate px-5 py-3 text-xs text-muted-foreground">
                        {row.last_error ?? "—"}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {formatDateTime(row.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 모바일 카드 리스트 (md 미만) */}
            <div className="divide-y divide-border md:hidden">
              {typedFailRows.map((row) => (
                <div key={row.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-sm font-medium text-primary">
                      {row.order_id}
                    </span>
                    <span
                      className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        row.attempt_count >= 5
                          ? "bg-error/10 text-error"
                          : row.attempt_count >= 3
                          ? "bg-warning/10 text-warning"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {row.attempt_count}회
                      {row.attempt_count >= 5 && " (DLQ)"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs">
                    <span className="text-muted-foreground">상태 키:</span>{" "}
                    {row.status_key}
                  </p>
                  <p className="mt-1 break-words text-xs text-muted-foreground">
                    {row.last_error ?? "—"}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {formatDateTime(row.created_at)}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
