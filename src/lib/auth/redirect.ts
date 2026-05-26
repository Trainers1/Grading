/**
 * 로그인 후 리다이렉트 경로가 내부 경로(같은 origin)인지 검증한다.
 * Open Redirect 공격 방어 — 외부 URL/프로토콜/스킴-relative 경로를 차단.
 *
 * 허용: "/", "/apply", "/mypage/orders/123"
 * 차단: "//evil.com", "/\\evil.com", "https://evil.com", "javascript:..."
 */
export function isSafeRedirect(value: string | null | undefined): boolean {
  if (!value) return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;
  if (value.startsWith("/\\")) return false;
  return true;
}

/** 안전한 redirect 경로만 반환, 아니면 fallback. */
export function safeRedirectOrFallback(
  value: string | null | undefined,
  fallback: string
): string {
  return isSafeRedirect(value) ? value! : fallback;
}
