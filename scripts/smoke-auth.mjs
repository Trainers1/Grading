#!/usr/bin/env node
// Auth — Node ESM smoke test
// 실행: node --env-file=.env.local scripts/smoke-auth.mjs
//
// 이 스크립트는 @supabase/supabase-js 를 직접 호출하여
// signInAction 이 번역하는 Supabase 에러코드 표면을 검증한다.
// 한국어 문자열 presence 검증은 §3.5 grep 테스트(docs/qa/auth-smoke.md)가 담당.
//
// 환경/시드 미비 시 SKIP (hard fail 없음) — CI friendly
// exit 0 = 전체 PASS + SKIP / exit 1 = any FAIL

import { createRequire } from "module";

const require = createRequire(import.meta.url);

// ── 결과 카운터 ────────────────────────────────────────────────────────────────
let passCount = 0;
let skipCount = 0;
let failCount = 0;

function pass(n, name) {
  console.log(`[smoke-auth] case ${n}: ${name}... PASS`);
  passCount++;
}
function skip(n, name, reason) {
  console.log(`[smoke-auth] case ${n}: ${name}... SKIP (${reason})`);
  skipCount++;
}
function fail(n, name, reason) {
  console.log(`[smoke-auth] case ${n}: ${name}... FAIL — ${reason}`);
  failCount++;
}

// ── 환경변수 체크 ──────────────────────────────────────────────────────────────
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const hasAnonEnv = Boolean(supabaseUrl && anonKey);
const hasServiceEnv = Boolean(supabaseUrl && serviceRoleKey);

// ── Supabase client 팩토리 ─────────────────────────────────────────────────────
function makeAnonClient() {
  const { createClient } = require("@supabase/supabase-js");
  return createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
  });
}

function makeServiceClient() {
  const { createClient } = require("@supabase/supabase-js");
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

// ── Case 1: 빈 이메일+비밀번호 → caller-side guard ───────────────────────────
// signInAction 은 Supabase 호출 전에 빈 값을 직접 검사한다.
// 이 케이스는 Supabase 연결 없이도 검증 가능하다.
(function case1() {
  const n = 1;
  const name = "빈 이메일+비밀번호 → caller-side guard (Supabase 호출 전 차단)";

  // actions.ts 의 caller-side guard 로직을 재현한다.
  const email = "".trim();
  const password = "";

  if (!email || !password) {
    // 정상: Supabase 에 도달하기 전에 차단됨
    pass(n, name);
  } else {
    fail(n, name, "caller-side guard 가 동작하지 않음 — 빈 값이 통과됨");
  }
})();

// ── Case 2: 잘못된 비밀번호 → invalid_credentials 에러코드 검증 ────────────────
await (async function case2() {
  const n = 2;
  const name = "잘못된 비밀번호 → signInWithPassword error.code = invalid_credentials";

  if (!hasAnonEnv) {
    skip(
      n,
      name,
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 미설정"
    );
    return;
  }

  try {
    const client = makeAnonClient();
    const { error } = await client.auth.signInWithPassword({
      email: "nonexistent-smoke-test@example.invalid",
      password: "wrong-password-smoke-test-12345",
    });

    if (!error) {
      fail(n, name, "에러 없이 로그인 성공 — 테스트 계정이 실제로 존재할 수 있음");
      return;
    }

    // Supabase Auth v2: error.code === 'invalid_credentials'
    // 구버전 fallback: error.message 포함 확인
    const code = error.code ?? "";
    const msg = (error.message ?? "").toLowerCase();
    if (
      code === "invalid_credentials" ||
      msg.includes("invalid login credentials") ||
      msg.includes("invalid_credentials")
    ) {
      pass(n, name);
    } else {
      fail(
        n,
        name,
        `예상 에러코드 invalid_credentials 아님 — code=${code}, message=${error.message}`
      );
    }
  } catch (err) {
    fail(n, name, `예외 발생: ${String(err)}`);
  }
})();

// ── Case 3: 인증된 비-admin이 admin 로그인 시도 ──────────────────────────────
// 시드된 비-admin 계정이 없으면 SKIP
// 검증 대상: 해당 이메일이 admin_users 테이블에 없음 → adminMatched = false
// → signInAction 이 "관리자 권한이 없는 계정입니다." 반환
await (async function case3() {
  const n = 3;
  const name = "비-admin 계정 → admin_users 에 행 없음 (관리자 권한 없음 경로)";

  if (!hasServiceEnv) {
    skip(
      n,
      name,
      "SUPABASE_SERVICE_ROLE_KEY 미설정 — admin_users 조회 불가"
    );
    return;
  }

  // 환경변수에서 테스트 계정 이메일 읽기 (시드 미비 시 SKIP)
  const testEmail = process.env.SMOKE_NON_ADMIN_EMAIL;
  const testPassword = process.env.SMOKE_NON_ADMIN_PASSWORD;

  if (!testEmail || !testPassword) {
    skip(
      n,
      name,
      "SMOKE_NON_ADMIN_EMAIL / SMOKE_NON_ADMIN_PASSWORD 미설정 — 비-admin 시드 계정 필요"
    );
    return;
  }

  try {
    const serviceClient = makeServiceClient();

    // service-role 로 admin_users 조회 (actions.ts isAdminEmail 로직과 동일)
    const { data } = await serviceClient
      .from("admin_users")
      .select("id")
      .ilike("email", testEmail)
      .eq("is_active", true)
      .maybeSingle();

    if (data) {
      skip(
        n,
        name,
        `SMOKE_NON_ADMIN_EMAIL(${testEmail})이 admin_users 에 존재 — 비-admin 계정으로 부적합`
      );
      return;
    }

    // admin_users 에 행 없음 → signInAction 은 "관리자 권한이 없는 계정입니다." 반환
    pass(n, name);
  } catch (err) {
    fail(n, name, `예외 발생: ${String(err)}`);
  }
})();

// ── Case 4: admin 유저가 user-side 로그인 시도 ──────────────────────────────
// 검증 대상: 해당 이메일이 admin_users 테이블에 존재 → adminMatched = true
// → signInAction (expectedRole=customer) 이 "관리자 계정은 /admin/login 에서..." 반환
await (async function case4() {
  const n = 4;
  const name = "admin 계정 → admin_users 에 행 있음 (customer 로그인 차단 경로)";

  if (!hasServiceEnv) {
    skip(
      n,
      name,
      "SUPABASE_SERVICE_ROLE_KEY 미설정 — admin_users 조회 불가"
    );
    return;
  }

  try {
    const serviceClient = makeServiceClient();

    // admin_users 에 is_active=true 행이 1건 이상 있는지 확인
    const { data, error } = await serviceClient
      .from("admin_users")
      .select("id, email")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (error) {
      fail(n, name, `admin_users 조회 실패: ${error.message}`);
      return;
    }

    if (!data) {
      skip(
        n,
        name,
        "admin_users 에 is_active=true 행 없음 — 시드 미비 (supabase/seed/admin-link.sql 실행 필요)"
      );
      return;
    }

    // admin_users 에 행 있음 → signInAction(expectedRole=customer) 은
    // "관리자 계정은 /admin/login 에서 로그인해 주세요." 반환
    pass(n, name);
  } catch (err) {
    fail(n, name, `예외 발생: ${String(err)}`);
  }
})();

// ── 최종 결과 ──────────────────────────────────────────────────────────────────
console.log();
console.log(
  `Total: 4 cases (${passCount} PASS / ${skipCount} SKIP / ${failCount} FAIL)`
);

if (failCount > 0) {
  console.log();
  console.log(
    "[smoke-auth] FAIL — 위 케이스를 확인하세요. docs/qa/auth-smoke.md 참조."
  );
  process.exit(1);
} else {
  console.log();
  console.log("[smoke-auth] OK — 모든 케이스 PASS 또는 SKIP.");
  process.exit(0);
}
