// 회원가입·프로필 수정·비밀번호 변경에서 공통으로 쓰는 서버측 입력 검증.
// 클라이언트도 동일 규칙을 적용해야 UX 일관성이 유지되지만, 최종 가드는 서버에서.

/** 필드별 길이 상한 — DB 스키마와 운영 정책 기준. */
export const FIELD_LIMITS = {
  name: 50,
  phone: 30,
  postalCode: 10,
  address: 200,
  addressDetail: 100,
  bankName: 50,
  accountNumber: 50,
  accountHolder: 50,
  email: 254, // RFC 5321
} as const;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^010-\d{4}-\d{4}$/;
const PASSWORD_STRENGTH_REGEX = /(?=.*[a-zA-Z])(?=.*[0-9])(?=.*[!@#$%^&*])/;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value) && value.length <= FIELD_LIMITS.email;
}

export function isValidPhone(value: string): boolean {
  return PHONE_REGEX.test(value);
}

/** 비밀번호 강도 검증 — 8자 이상 + 영문/숫자/특수문자 조합. */
export function validatePasswordStrength(
  value: string
): { ok: true } | { ok: false; error: string } {
  if (!value) return { ok: false, error: "비밀번호를 입력해 주세요." };
  if (value.length < 8)
    return { ok: false, error: "비밀번호는 8자 이상이어야 합니다." };
  if (!PASSWORD_STRENGTH_REGEX.test(value))
    return {
      ok: false,
      error: "비밀번호는 영문+숫자+특수문자(!@#$%^&*) 조합이어야 합니다.",
    };
  return { ok: true };
}
