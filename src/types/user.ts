/** 어드민 역할 (010 마이그레이션 이후 3종으로 단순화) */
export type AdminRole =
  | "SUPER_ADMIN" // 슈퍼 관리자 — 설정/관리자 추가/삭제 등 전체 접근
  | "GENERAL_ADMIN" // 일반 관리자 — 운영 전반
  | "STORE_SHARED"; // 매장 공유 계정 — 매장 직원 공용

/** 유저 */
export interface User {
  id: string;
  email: string;
  name: string;
  phone: string;
  provider?: "email" | "kakao" | "naver";
  phoneVerified: boolean;
  isBlocked: boolean;
  blockReason?: string;
  notificationEnabled: boolean;
  /** 마케팅 정보 수신 동의 (회원가입 폼의 agreeMarketing 반영) */
  marketingEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 어드민 가입 승인 상태 (008 마이그레이션) */
export type AdminApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";

/** 어드민 */
export interface AdminUser {
  id: string;
  email: string;
  name: string;
  /** 로그인 화면 드롭다운 식별자. UNIQUE. (009 마이그레이션) */
  nickname: string;
  /** PENDING 상태에서는 null — 승인 시 슈퍼관리자가 부여 */
  role: AdminRole | null;
  isActive: boolean;
  status: AdminApprovalStatus;
  requestedAt: string;
  approvedAt?: string;
  approvedBy?: string;
  createdAt: string;
  updatedAt: string;
}
