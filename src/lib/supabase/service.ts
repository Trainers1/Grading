// Supabase service_role 클라이언트 — RLS를 우회하는 서버 전용 클라이언트
// Route Handler / Server Action 에서만 사용. 클라이언트 컴포넌트에서 import 금지.

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

let _client: ReturnType<typeof createClient<Database>> | null = null;

/**
 * service_role 키를 사용하는 Supabase 클라이언트를 반환한다.
 * RLS를 우회하므로 반드시 서버 사이드에서만 호출해야 한다.
 */
export function createServiceClient() {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Supabase service_role 환경변수 누락 — NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY를 확인하세요"
    );
  }

  _client = createClient<Database>(url, serviceKey, {
    auth: {
      // service_role은 세션 관리 불필요
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return _client;
}
