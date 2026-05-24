/** 약관/동의 종류 */
export type ConsentType =
  | "TERMS"
  | "PRIVACY"
  | "PRIVACY_THIRD_PARTY"
  | "MARKETING";

/** 동의 시점 컨텍스트 */
export type ConsentContext = "SIGNUP" | "APPLY" | "PROFILE_UPDATE";

/**
 * 약관 동의 이력 (개인정보보호법 대응 — append-only).
 * 동의 철회는 새 row(agreed=false)로 기록하며 기존 row를 수정하지 않습니다.
 */
export interface ConsentLog {
  id: string;
  userId: string;
  consentType: ConsentType;
  version: string; // e.g. 'v1.0'
  agreed: boolean;
  ipAddress?: string;
  userAgent?: string;
  context?: ConsentContext;
  createdAt: string;
}
