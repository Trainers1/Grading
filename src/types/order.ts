/**
 * 주문 상태 (8단계)
 * 총판(카드하비) 발송 후 ~ 등급 확정 전 중간 상태(그레이딩사 접수/진행/반송 등)는
 * 운영자가 추적하지 않으므로 단일 상태(DISTRIBUTOR_SHIPPED)로 묶습니다.
 */
export type OrderStatus =
  | "PAYMENT_PENDING" // 결제 대기
  | "CARD_DELIVERY_PENDING" // 카드 전달 대기 중
  | "CARD_RECEIVED" // 카드 수령 완료
  | "SHIPPED_OUT" // 출고 (총판 발송 직후 ~ 그레이딩 진행 시작 전 transit 구간)
  | "DISTRIBUTOR_SHIPPED" // 그레이딩 진행 중 (총판 도착 ~ 등급 확정 전)
  | "GRADE_CONFIRMED" // 등급 확정
  | "TRAINERS_ARRIVED" // 트레이너스 도착 (고객 수령 가능)
  | "COMPLETED"; // 수령 완료

/** 결제 상태 */
export type PaymentStatus =
  | "PENDING" // 결제 대기
  | "PAID" // 선결제 완료
  | "OVERCHARGE_PENDING" // 오버차지 대기
  | "OVERCHARGE_PAID" // 오버차지 결제 완료
  | "REFUNDED" // 환불 완료
  | "FAILED"; // 결제 실패

/** 등급회사 */
export type GradingCompany = "PSA" | "BGS" | "CGC" | "BRG";

/** 수령 방법 */
export type PickupMethod = "STORE_PICKUP" | "DELIVERY";

/** 등급 결과 스포 여부 */
export type SpoilerPreference = "ALLOW" | "DENY";

/** 주문 */
export interface Order {
  id: string; // 주문번호 (PK) - YYYYMMDD-순번
  userId: string; // 유저 ID (FK)
  name: string; // 성함
  phone: string; // 연락처
  pickupMethod: PickupMethod;
  postalCode?: string; // 택배 우편번호 (snapshot — MY 출처 주문이면 fallback 용도)
  deliveryAddress?: string; // 택배 수령 시 기본 주소 (snapshot)
  deliveryAddressDetail?: string; // 상세 주소 (snapshot)
  /**
   * 배송 주소의 출처:
   *   - 'MY'     : 회원 정보의 최신 주소를 항상 사용 (snapshot 무시).
   *                내정보에서 주소가 바뀌면 발송 주소도 함께 바뀐다.
   *   - 'MANUAL' : 신청 시 입력한 snapshot 주소 그대로 사용.
   */
  addressSource: "MY" | "MANUAL";
  gradingCompany: GradingCompany;
  serviceLevel: string; // 서비스 등급 코드 (grading_services.code)
  servicePriceSnapshot: number; // 신청 시점 서비스 단가 (원)
  paymentStatus: PaymentStatus;
  prepaidAmount: number; // 선결제 금액
  overchargeAmount?: number; // 오버차지 금액
  shippingFee: number; // 택배 수령 추가비 (기본 0)
  orderStatus: OrderStatus;
  spoilerPreference: SpoilerPreference;
  receivedAt?: string; // 접수일 (카드 실물 수령 시점)
  shippedOutAt?: string; // 출고일 (transit 카운트 시작점)
  distributorShippedAt?: string; // 총판 발송일
  distributorTrackingNumber?: string; // 운송장번호 (총판)
  userTrackingNumber?: string; // 운송장번호 (유저 택배)
  shipmentGroupId?: string; // 합배송 묶음 ID — 택배비 결제 시 발급, 같은 박스 주문들이 공유
  userShippedAt?: string; // 택배 송장 최초 입력 시각 — 5일 후 자동 수령완료 기준
  customerMemo?: string; // 고객 메모
  internalMemo?: string; // 내부 메모
  cancelledAt?: string; // 취소 시각
  cancelReason?: string; // 취소 사유
  createdAt: string;
  updatedAt: string;
}

/** 카드 */
export interface Card {
  id: string; // 카드 ID (PK)
  orderId: string; // 주문번호 (FK)
  // 카드별 정보는 신청 시점에는 비워두고 카드를 직접 받은 직원이 입력한다.
  englishName?: string; // 카드 영문명
  setName?: string; // 세트명
  cardNumber?: string; // 카드번호
  year?: string; // 연도
  declaredValue?: number; // 신고가액
  frontImageUrl?: string; // 앞면 사진 URL (선택)
  backImageUrl?: string; // 뒷면 사진 URL (선택)
  conditionPhotoUrl?: string; // (legacy) 단일 수령 사진. 다중 사진은 OrderReceiptPhoto 참조
  gradeResult?: string; // 등급 결과
  serialNumber?: string; // 슬랩 인증번호 (등급 확정 시 함께 입력)
  slabPhotoUrl?: string; // 슬랩 사진 URL
  createdAt: string;
  updatedAt: string;
}

/** 관리자 수령 시 업로드 사진 (1:N) */
export interface OrderReceiptPhoto {
  id: string;
  orderId: string;
  photoUrl: string;
  caption?: string;
  uploadedBy?: string; // admin_users.id
  createdAt: string;
}

/** 주문 상태 변경 이력 */
export interface OrderStatusLog {
  id: string;
  orderId: string;
  previousStatus?: OrderStatus;
  newStatus: OrderStatus;
  changedBy?: string; // admin_users.id
  changeReason?: string;
  createdAt: string;
}

/** 결제 종류 */
export type PaymentType = "PREPAYMENT" | "OVERCHARGE" | "REFUND" | "SHIPPING";

/** 결제 진행 상태 (개별 payment row) */
export type PaymentRecordStatus = "PENDING" | "COMPLETED" | "FAILED" | "CANCELLED";

/** 결제 내역 */
export interface Payment {
  id: string;
  orderId: string;
  paymentType: PaymentType;
  amount: number;
  paymentMethod?: string;
  tossOrderId?: string; // 가맹점 주문번호
  tossPaymentKey?: string; // 토스 발급 키
  idempotencyKey?: string; // 클라이언트 멱등성 키
  status: PaymentRecordStatus;
  rawResponse?: unknown; // 토스 응답 원본 (JSONB)
  failureReason?: string;
  paidAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** 등급 서비스 카탈로그 row */
export interface GradingService {
  id: string;
  company: GradingCompany;
  code: string; // e.g. 'psa_economy'
  name: string;
  price: number;
  estimatedDays: string;
  description?: string;
  isActive: boolean;
  sortOrder: number;
  /**
   * 출고(SHIPPED_OUT) → 그레이딩 진행 중(DISTRIBUTOR_SHIPPED) 자동 승격까지의 일수.
   * Vercel Cron(/api/orders/auto-promote) 이 shipped_out_at + transit_days 경과 시 승격.
   * 실측 기반 값으로 추후 갱신 필요 (docs/TODOS.md 참조).
   */
  transitDays: number;
  createdAt: string;
  updatedAt: string;
}
