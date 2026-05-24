// 서버 전용 — Server Component / Route Handler / Server Action 에서만 사용.
// 어떤 경우에도 "use client" 또는 Edge/middleware 에서 import 금지
// (service_role 키 노출 방지).

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export type AdminRole = "SUPER_ADMIN" | "GENERAL_ADMIN" | "STORE_SHARED";

export type AdminSession = {
  authUserId: string;
  adminId: string;
  adminRole: AdminRole;
  email: string;
  name: string;
};

const ADMIN_ROLES: ReadonlySet<AdminRole> = new Set([
  "SUPER_ADMIN",
  "GENERAL_ADMIN",
  "STORE_SHARED",
]);

function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === "string" && ADMIN_ROLES.has(value as AdminRole);
}

/**
 * 현재 요청의 세션을 검증하고 admin 여부를 판정한다.
 *
 * 동작 순서 (순서 유지 — service-role 호출 전 null 검사):
 *   1) anon 클라이언트로 supabase.auth.getUser() — 쿠키 세션 확인
 *   2) service-role 클라이언트 생성 — env 누락 시 에러 로그 후 null 반환
 *   3) admin_users 조회: user_id 매칭 (안정 경로)
 *   4) (전환기) email 매칭 폴백: user_id IS NULL 인 행에 대해
 *   5) 비활성 / 미존재 시 null
 */
export async function requireAdmin(): Promise<AdminSession | null> {
  const supabase = await createServerClient();

  let authUser;
  try {
    const { data } = await supabase.auth.getUser();
    authUser = data.user;
  } catch (err) {
    console.error("[auth] requireAdmin getUser failed", err);
    return null;
  }

  if (!authUser) {
    return null;
  }

  let service;
  try {
    service = createServiceClient();
  } catch (err) {
    console.error(
      "[auth] requireAdmin service-role unavailable — env missing",
      err
    );
    return null;
  }

  const { data: byUserId, error: byUserIdErr } = await service
    .from("admin_users")
    .select("id, email, name, role, is_active, user_id, status")
    .eq("user_id", authUser.id)
    .eq("is_active", true)
    .eq("status", "APPROVED")
    .maybeSingle();

  if (byUserIdErr) {
    console.error("[auth] requireAdmin user_id lookup failed", byUserIdErr);
    return null;
  }

  let row = byUserId;

  if (!row && authUser.email) {
    const { data: byEmail, error: byEmailErr } = await service
      .from("admin_users")
      .select("id, email, name, role, is_active, user_id, status")
      .ilike("email", authUser.email)
      .is("user_id", null)
      .eq("is_active", true)
      .eq("status", "APPROVED")
      .maybeSingle();

    if (byEmailErr) {
      console.error("[auth] requireAdmin email fallback failed", byEmailErr);
      return null;
    }
    row = byEmail;
  }

  if (!row) {
    console.warn(
      `[auth] requireAdmin denied authUserId=${authUser.id} matchedEmail=${authUser.email ?? "null"}`
    );
    return null;
  }

  if (!isAdminRole(row.role)) {
    console.error(
      `[auth] requireAdmin unexpected role=${String(row.role)} adminId=${row.id}`
    );
    return null;
  }

  return {
    authUserId: authUser.id,
    adminId: row.id,
    adminRole: row.role,
    email: row.email,
    name: row.name,
  };
}
