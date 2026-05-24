import type { GradingCompany } from "@/types";

/** 택배 수령 시 부과되는 택배비 (원). 트레이너스 도착 후 후결제. */
export const SHIPPING_FEE = 3000;

/** 등급회사별 서비스 등급 및 가격 정보 */
export interface GradingService {
  id: string;
  company: GradingCompany;
  name: string; // 서비스명 (예: PSA Regular)
  price: number; // 가격 (원)
  estimatedDays: string; // 예상 소요기간
  description?: string;
}

/** 등급회사 정보 */
export const GRADING_COMPANIES: {
  value: GradingCompany;
  label: string;
  description: string;
  url: string;
}[] = [
  {
    value: "PSA",
    label: "PSA",
    description: "Professional Sports Authenticator",
    url: "https://www.psacard.com",
  },
  {
    value: "BGS",
    label: "BGS",
    description: "Beckett Grading Services",
    url: "https://www.beckett.com/grading",
  },
  {
    value: "CGC",
    label: "CGC",
    description: "Certified Guaranty Company",
    url: "https://www.cgccards.com/",
  },
  {
    value: "BRG",
    label: "brg",
    description: "Break Grading",
    url: "https://break.co.kr/",
  },
];

/** 주문 상태 라벨 매핑 (9단계) */
export const ORDER_STATUS_LABELS: Record<string, string> = {
  PAYMENT_PENDING: "그레이딩 신청 완료",
  CARD_DELIVERY_PENDING: "결제 완료",
  CARD_RECEIVED: "접수 완료",
  SHIPPED_OUT: "출고",
  // 총판(카드하비) 도착 ~ 등급 확정 전까지를 단일 상태로 표현
  DISTRIBUTOR_SHIPPED: "그레이딩 진행 중",
  GRADE_CONFIRMED: "등급 확정",
  TRAINERS_ARRIVED: "트레이너스 도착",
  COMPLETED: "수령 완료",
};

/** 유저 마이페이지에서 보이는 진행 상태 (8단계 스텝퍼) */
export const ORDER_STATUS_STEPS = [
  { key: "PAYMENT_PENDING", label: "그레이딩 신청 완료", step: 1 },
  { key: "CARD_DELIVERY_PENDING", label: "결제 완료", step: 2 },
  { key: "CARD_RECEIVED", label: "접수 완료", step: 3 },
  { key: "SHIPPED_OUT", label: "출고", step: 4 },
  { key: "DISTRIBUTOR_SHIPPED", label: "그레이딩 진행 중", step: 5 },
  { key: "GRADE_CONFIRMED", label: "등급 확정", step: 6 },
  { key: "TRAINERS_ARRIVED", label: "트레이너스 도착", step: 7 },
  { key: "COMPLETED", label: "수령 완료", step: 8 },
] as const;

/** 결제 상태 라벨 */
export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "결제 대기",
  PAID: "선결제 완료",
  OVERCHARGE_PENDING: "오버차지 대기",
  OVERCHARGE_PAID: "오버차지 결제 완료",
  REFUNDED: "환불 완료",
  FAILED: "결제 실패",
};

/**
 * 등급회사별 그레이드 프리셋 (등급 입력 버튼 라벨용).
 * value: cards.grade_result 에 저장되는 문자열.
 * label: 버튼에 표시되는 라벨 (등급 + 설명).
 * 마지막 항목은 항상 "직접 입력" 으로 운영자가 자유 입력 가능.
 */
export const GRADE_PRESETS: Record<
  GradingCompany,
  { value: string; label: string }[]
> = {
  PSA: [
    { value: "PSA 10", label: "PSA 10 (Gem Mint)" },
    { value: "PSA 9", label: "PSA 9 (Mint)" },
    { value: "PSA 8", label: "PSA 8 (Near Mint-Mint)" },
    { value: "PSA 7", label: "PSA 7 (Near Mint)" },
    { value: "PSA 6", label: "PSA 6 (Excellent-Near Mint)" },
    { value: "PSA 5", label: "PSA 5 (Excellent)" },
  ],
  BGS: [
    { value: "BGS 10 Pristine", label: "BGS 10 (Pristine)" },
    { value: "BGS 9.5", label: "BGS 9.5 (Gem Mint)" },
    { value: "BGS 9", label: "BGS 9 (Mint)" },
    { value: "BGS 8.5", label: "BGS 8.5 (Near Mint-Mint+)" },
    { value: "BGS 8", label: "BGS 8 (Near Mint-Mint)" },
  ],
  CGC: [
    { value: "CGC 10 Pristine", label: "CGC 10 (Pristine)" },
    { value: "CGC 9.5", label: "CGC 9.5 (Gem Mint)" },
    { value: "CGC 9", label: "CGC 9 (Mint)" },
    { value: "CGC 8.5", label: "CGC 8.5 (Near Mint-Mint+)" },
    { value: "CGC 8", label: "CGC 8 (Near Mint-Mint)" },
  ],
  BRG: [
    { value: "BRG 10", label: "BRG 10 (Gem Mint)" },
    { value: "BRG 9", label: "BRG 9 (Mint)" },
    { value: "BRG 8", label: "BRG 8 (Near Mint-Mint)" },
    { value: "BRG 7", label: "BRG 7 (Near Mint)" },
  ],
};

/** 사진 업로드 제한 */
export const PHOTO_UPLOAD = {
  maxSizeMB: 10,
  maxSizeBytes: 10 * 1024 * 1024,
  acceptedFormats: ["image/jpeg", "image/png"],
  acceptedExtensions: ".jpg,.jpeg,.png",
} as const;

/**
 * 등급회사별 서비스 등급 선택지 (신청 폼 표시용).
 * 실제 단가 검증은 서버에서 grading_services 테이블로 수행한다.
 * (추후 grading_services 동적 로드로 대체 예정)
 */
export const SERVICE_LEVELS: Record<
  GradingCompany,
  { value: string; label: string; price: number; days: string }[]
> = {
  PSA: [
    { value: "psa_economy", label: "Economy", price: 30000, days: "65영업일" },
    { value: "psa_regular", label: "Regular", price: 55000, days: "30영업일" },
    { value: "psa_express", label: "Express", price: 110000, days: "15영업일" },
    { value: "psa_super_express", label: "Super Express", price: 220000, days: "5영업일" },
  ],
  BGS: [
    { value: "bgs_standard", label: "Standard", price: 40000, days: "50영업일" },
    { value: "bgs_express", label: "Express", price: 100000, days: "10영업일" },
    { value: "bgs_premium", label: "Premium", price: 180000, days: "5영업일" },
  ],
  CGC: [
    { value: "cgc_standard", label: "Standard", price: 35000, days: "50영업일" },
    { value: "cgc_express", label: "Express", price: 85000, days: "15영업일" },
  ],
  BRG: [
    { value: "brg_standard", label: "Standard", price: 25000, days: "45영업일" },
    { value: "brg_express", label: "Express", price: 60000, days: "15영업일" },
  ],
};

