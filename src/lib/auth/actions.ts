"use server";

import { redirect } from "next/navigation";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { safeRedirectOrFallback } from "@/lib/auth/redirect";
import {
  checkAuthAttempt,
  recordAuthFailure,
  resetAuthAttempts,
} from "@/lib/auth/rate-limit";
import {
  FIELD_LIMITS,
  isValidEmail,
  isValidPhone,
  normalizeEmail,
  validatePasswordStrength,
} from "@/lib/auth/validation";

export type ExpectedRole = "customer" | "admin";

type SignInResult =
  | { ok: false; error: string }
  | { ok: true; redirectTo: string };

type SignUpResult =
  | { ok: false; error: string }
  | { ok: true; redirectTo: string };

const FALLBACK_ERROR =
  "로그인 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";

type AdminEmailLookup =
  | { state: "none" }
  | { state: "approved" }
  | { state: "pending" }
  | { state: "rejected" }
  | { state: "inactive" };

async function lookupAdminByEmail(email: string): Promise<AdminEmailLookup> {
  try {
    const service = createServiceClient();
    const { data } = await service
      .from("admin_users")
      .select("status, is_active")
      .ilike("email", email)
      .maybeSingle();
    if (!data) return { state: "none" };
    if (data.status === "REJECTED") return { state: "rejected" };
    if (data.status === "PENDING") return { state: "pending" };
    if (!data.is_active) return { state: "inactive" };
    return { state: "approved" };
  } catch (err) {
    console.error("[auth] admin lookup failed", err);
    return { state: "none" };
  }
}

/**
 * 닉네임 → admin_users.email lookup.
 * 활성 + 승인 상태만 매칭. UNIQUE 인덱스를 신뢰하므로 maybeSingle.
 */
async function resolveAdminEmailByNickname(
  nickname: string
): Promise<{ email: string } | null> {
  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from("admin_users")
      .select("email")
      .eq("nickname", nickname)
      .eq("is_active", true)
      .eq("status", "APPROVED")
      .maybeSingle();
    if (error) {
      console.error("[auth] resolveAdminEmailByNickname failed", error);
      return null;
    }
    return data ? { email: data.email } : null;
  } catch (err) {
    console.error("[auth] resolveAdminEmailByNickname exception", err);
    return null;
  }
}

export async function signInAction(params: {
  /** customer 경로 전용 */
  email?: string;
  /** admin 경로 전용 — 로그인 화면 드롭다운에서 선택한 닉네임 */
  nickname?: string;
  password: string;
  expectedRole: ExpectedRole;
  redirectTo?: string;
}): Promise<SignInResult> {
  const password = params.password ?? "";
  if (!password) {
    return { ok: false, error: "비밀번호를 입력해 주세요." };
  }

  // 경로별로 로그인용 email 결정
  let loginEmail: string;
  if (params.expectedRole === "admin") {
    const nickname = params.nickname?.trim() ?? "";
    if (!nickname) {
      return { ok: false, error: "닉네임을 선택해 주세요." };
    }
    const resolved = await resolveAdminEmailByNickname(nickname);
    if (!resolved) {
      return {
        ok: false,
        error: "활성 상태의 관리자 계정을 찾을 수 없습니다.",
      };
    }
    loginEmail = resolved.email;
  } else {
    const email = params.email?.trim() ?? "";
    if (!email) {
      return { ok: false, error: "이메일을 입력해 주세요." };
    }
    loginEmail = email;
  }

  let supabase;
  try {
    supabase = await createServerClient();
  } catch (err) {
    console.error("[auth] signIn client init failed", err);
    return { ok: false, error: FALLBACK_ERROR };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: loginEmail,
    password,
  });

  if (error || !data.user) {
    if (error?.status && error.status >= 500) {
      console.error("[auth] signIn 5xx", error.message);
      return { ok: false, error: FALLBACK_ERROR };
    }
    return {
      ok: false,
      error:
        params.expectedRole === "admin"
          ? "닉네임 또는 비밀번호가 올바르지 않습니다."
          : "이메일 또는 비밀번호가 올바르지 않습니다.",
    };
  }

  const userEmail = data.user.email ?? loginEmail;
  const adminLookup = await lookupAdminByEmail(userEmail);

  if (params.expectedRole === "customer" && adminLookup.state === "approved") {
    await supabase.auth.signOut();
    return {
      ok: false,
      error: "관리자 계정은 /admin/login 에서 로그인해 주세요.",
    };
  }

  if (params.expectedRole === "admin" && adminLookup.state !== "approved") {
    // resolveAdminEmailByNickname 이 활성/승인 필터를 통과시켰지만 race condition 방어
    await supabase.auth.signOut();
    return { ok: false, error: "관리자 권한이 없는 계정입니다." };
  }

  const fallback = params.expectedRole === "admin" ? "/admin" : "/";
  // Open Redirect 방어 — 외부 URL/스킴-relative 경로는 fallback 으로 강제.
  return {
    ok: true,
    redirectTo: safeRedirectOrFallback(params.redirectTo, fallback),
  };
}

export async function signUpAction(params: {
  email: string;
  password: string;
  name: string;
  phone: string;
  /** 선택 — 우편번호 */
  postalCode?: string;
  /** 선택 — 기본 주소 (도로명/지번) */
  address?: string;
  /** 선택 — 상세 주소 */
  addressDetail?: string;
  /** 선택 — 은행명 */
  bankName?: string;
  /** 선택 — 계좌번호 */
  accountNumber?: string;
  /** 선택 — 예금주 */
  accountHolder?: string;
}): Promise<SignUpResult> {
  const email = normalizeEmail(params.email ?? "");
  const password = params.password ?? "";
  const name = params.name?.trim() ?? "";
  const phone = params.phone?.trim() ?? "";
  const postalCode = params.postalCode?.trim() ?? "";
  const address = params.address?.trim() ?? "";
  const addressDetail = params.addressDetail?.trim() ?? "";
  const bankName = params.bankName?.trim() ?? "";
  const accountNumber = params.accountNumber?.trim() ?? "";
  const accountHolder = params.accountHolder?.trim() ?? "";

  if (!email || !password || !name || !phone) {
    return { ok: false, error: "필수 항목을 모두 입력해 주세요." };
  }

  if (!isValidEmail(email)) {
    return { ok: false, error: "올바른 이메일 형식을 입력해 주세요." };
  }
  if (!isValidPhone(phone)) {
    return {
      ok: false,
      error: "올바른 연락처 형식을 입력해 주세요. (010-XXXX-XXXX)",
    };
  }
  const pwCheck = validatePasswordStrength(password);
  if (!pwCheck.ok) {
    return { ok: false, error: pwCheck.error };
  }
  if (
    name.length > FIELD_LIMITS.name ||
    phone.length > FIELD_LIMITS.phone ||
    postalCode.length > FIELD_LIMITS.postalCode ||
    address.length > FIELD_LIMITS.address ||
    addressDetail.length > FIELD_LIMITS.addressDetail ||
    bankName.length > FIELD_LIMITS.bankName ||
    accountNumber.length > FIELD_LIMITS.accountNumber ||
    accountHolder.length > FIELD_LIMITS.accountHolder
  ) {
    return { ok: false, error: "입력값이 너무 깁니다." };
  }

  let supabase;
  try {
    supabase = await createServerClient();
  } catch (err) {
    console.error("[auth] signUp client init failed", err);
    return { ok: false, error: FALLBACK_ERROR };
  }

  // 이메일·연락처 중복 사전 체크 — service-role 로 RLS 우회.
  // supabase.auth.signUp 도 이메일 중복은 "already registered" 로 알려주지만
  // 메시지 의존이 깨지기 쉽고, 연락처는 따로 검사하지 않는다.
  // profiles 행이 생긴 뒤(트리거 실행 후) 에 잡으면 auth.users 고아 행이 남으므로
  // 가능한 한 호출 이전 단계에서 막아낸다.
  try {
    const dupCheck = createServiceClient();
    const { data: dupEmail } = await dupCheck
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();
    if (dupEmail) {
      return { ok: false, error: "이미 가입된 이메일입니다." };
    }
    const { data: dupPhone } = await dupCheck
      .from("profiles")
      .select("id")
      .eq("phone", phone)
      .maybeSingle();
    if (dupPhone) {
      return { ok: false, error: "이미 가입된 연락처입니다." };
    }
  } catch (err) {
    // 사전 체크 실패는 진행 차단까지는 아니고 로깅만. 동시 가입 race 도
    // partial unique index 가 추가로 잡아낸다.
    console.error("[auth] signUp duplicate pre-check failed", err);
  }

  // raw_user_meta_data 에는 트리거가 profiles 행 생성 시 참조하는 최소 필드만 둔다.
  // 계좌·주소 등 민감 정보는 server action 이 직접 profiles 에 기록하는 방식이
  // 더 안전하지만, 현재 트리거가 metadata 전체를 신뢰하는 구조라 일단 동일하게
  // 전달. 계좌 정보 분리는 추후 트리거 리팩터 시 처리.
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name,
        phone,
        postal_code: postalCode,
        address,
        address_detail: addressDetail,
        bank_name: bankName,
        account_number: accountNumber,
        account_holder: accountHolder,
      },
    },
  });

  if (error) {
    if (error.status && error.status >= 500) {
      console.error("[auth] signUp 5xx", error.message);
      return { ok: false, error: FALLBACK_ERROR };
    }
    if (
      error.message?.toLowerCase().includes("already") ||
      error.message?.toLowerCase().includes("registered")
    ) {
      return { ok: false, error: "이미 가입된 이메일입니다." };
    }
    return { ok: false, error: "회원가입 중 오류가 발생했습니다." };
  }

  return { ok: true, redirectTo: "/login?registered=true" };
}

export async function signOutAction() {
  try {
    const supabase = await createServerClient();
    await supabase.auth.signOut();
  } catch (err) {
    console.error("[auth] signOut failed", err);
  }
  redirect("/");
}

export async function signOutAdminAction() {
  try {
    const supabase = await createServerClient();
    await supabase.auth.signOut();
  } catch (err) {
    console.error("[auth] signOut admin failed", err);
  }
  redirect("/admin/login");
}

// ── 내정보(마이페이지) — 재인증 / 프로필 수정 / 비밀번호 변경 ─────────────────

type ProfileActionResult = { ok: false; error: string } | { ok: true };

export type MyProfileData = {
  email: string;
  name: string;
  phone: string;
  postalCode: string;
  address: string;
  addressDetail: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
};

export type UnlockMyProfileResult =
  | { ok: false; error: string }
  | { ok: true; profile: MyProfileData };

// 내정보 페이지 진입 재인증 — 현재 비밀번호 확인 후 프로필 데이터를 반환.
export async function unlockMyProfileAction(params: {
  password: string;
}): Promise<UnlockMyProfileResult> {
  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user?.email) {
    return { ok: false, error: "로그인이 필요합니다." };
  }
  const password = params.password ?? "";
  if (!password) {
    return { ok: false, error: "비밀번호를 입력해 주세요." };
  }

  // brute-force 1차 가드 — 인메모리 카운터
  const rateKey = `unlock:${user.id}`;
  const preCheck = checkAuthAttempt(rateKey);
  if (preCheck.locked) {
    return {
      ok: false,
      error: `로그인 시도가 많아 잠겼습니다. ${preCheck.retryAfterSec}초 후 다시 시도해 주세요.`,
    };
  }

  // 현재 비밀번호 검증 — 별도 익명 클라이언트(현재 세션 미영향)
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const probe = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInErr } = await probe.auth.signInWithPassword({
    email: user.email,
    password,
  });
  if (signInErr) {
    const after = recordAuthFailure(rateKey);
    if (after.locked) {
      return {
        ok: false,
        error: `비밀번호 시도가 너무 많아 잠겼습니다. ${after.retryAfterSec}초 후 다시 시도해 주세요.`,
      };
    }
    return { ok: false, error: "비밀번호가 일치하지 않습니다." };
  }
  resetAuthAttempts(rateKey);

  const service = createServiceClient();
  const { data: profile } = await service
    .from("profiles")
    .select(
      "name, phone, postal_code, address, address_detail, bank_name, account_number, account_holder"
    )
    .eq("id", user.id)
    .maybeSingle();

  return {
    ok: true,
    profile: {
      email: user.email,
      name: profile?.name ?? "",
      phone: profile?.phone ?? "",
      postalCode: profile?.postal_code ?? "",
      address: profile?.address ?? "",
      addressDetail: profile?.address_detail ?? "",
      bankName: profile?.bank_name ?? "",
      accountNumber: profile?.account_number ?? "",
      accountHolder: profile?.account_holder ?? "",
    },
  };
}

// 이름·연락처·주소·계좌 수정. 주소/계좌는 빈 문자열 입력 시 NULL 로 저장된다.
export async function updateMyProfileAction(params: {
  name: string;
  phone: string;
  postalCode?: string;
  address?: string;
  addressDetail?: string;
  bankName?: string;
  accountNumber?: string;
  accountHolder?: string;
}): Promise<ProfileActionResult> {
  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) {
    return { ok: false, error: "로그인이 필요합니다." };
  }
  const name = params.name?.trim() ?? "";
  const phone = params.phone?.trim() ?? "";
  const postalCode = params.postalCode?.trim() ?? "";
  const address = params.address?.trim() ?? "";
  const addressDetail = params.addressDetail?.trim() ?? "";
  const bankName = params.bankName?.trim() ?? "";
  const accountNumber = params.accountNumber?.trim() ?? "";
  const accountHolder = params.accountHolder?.trim() ?? "";
  if (!name || !phone) {
    return { ok: false, error: "이름과 연락처를 모두 입력해 주세요." };
  }
  if (
    name.length > 50 ||
    phone.length > 30 ||
    postalCode.length > 10 ||
    address.length > 200 ||
    addressDetail.length > 100 ||
    bankName.length > 50 ||
    accountNumber.length > 50 ||
    accountHolder.length > 50
  ) {
    return { ok: false, error: "입력값이 너무 깁니다." };
  }

  const service = createServiceClient();
  const { error } = await service
    .from("profiles")
    .update({
      name,
      phone,
      postal_code: postalCode || null,
      address: address || null,
      address_detail: addressDetail || null,
      bank_name: bankName || null,
      account_number: accountNumber || null,
      account_holder: accountHolder || null,
    })
    .eq("id", user.id);
  if (error) {
    console.error("[auth] updateMyProfile failed", error);
    return { ok: false, error: "프로필 저장에 실패했습니다." };
  }
  return { ok: true };
}

// 본인 비밀번호 변경.
export async function changeMyPasswordAction(params: {
  currentPassword: string;
  newPassword: string;
}): Promise<ProfileActionResult> {
  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user?.email) {
    return { ok: false, error: "로그인이 필요합니다." };
  }
  const current = params.currentPassword ?? "";
  const next = params.newPassword ?? "";
  if (!current || !next) {
    return { ok: false, error: "현재 비밀번호와 새 비밀번호를 입력해 주세요." };
  }
  const strength = validatePasswordStrength(next);
  if (!strength.ok) {
    return { ok: false, error: `새 ${strength.error}` };
  }
  if (current === next) {
    return { ok: false, error: "새 비밀번호가 현재 비밀번호와 동일합니다." };
  }

  // brute-force 1차 가드 — 인메모리 카운터
  const rateKey = `changepw:${user.id}`;
  const preCheck = checkAuthAttempt(rateKey);
  if (preCheck.locked) {
    return {
      ok: false,
      error: `비밀번호 시도가 너무 많아 잠겼습니다. ${preCheck.retryAfterSec}초 후 다시 시도해 주세요.`,
    };
  }

  // 현재 비밀번호 검증
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const probe = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInErr } = await probe.auth.signInWithPassword({
    email: user.email,
    password: current,
  });
  if (signInErr) {
    const after = recordAuthFailure(rateKey);
    if (after.locked) {
      return {
        ok: false,
        error: `비밀번호 시도가 너무 많아 잠겼습니다. ${after.retryAfterSec}초 후 다시 시도해 주세요.`,
      };
    }
    return { ok: false, error: "현재 비밀번호가 일치하지 않습니다." };
  }
  resetAuthAttempts(rateKey);

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) {
    console.error("[auth] changeMyPassword failed", error);
    return { ok: false, error: `비밀번호 변경 실패: ${error.message}` };
  }
  return { ok: true };
}
