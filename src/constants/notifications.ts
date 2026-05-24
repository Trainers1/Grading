import type { OrderStatus } from "@/types/order";

// READY_FOR_PICKUP 은 migration 012 에서 TRAINERS_ARRIVED 로 통합되어 제거됨.
// fn_enqueue_milestone_dispatch (migration 012) 의 milestone 배열과 동기 유지.
export const MILESTONE_STATUS_KEYS = [
  "CARD_DELIVERY_PENDING", // ← spec 'PAID' 의도 매핑 (결제 완료 직후 안내)
  "SHIPPED_OUT",           // ← 출고 안내 (transit 시작)
  "DISTRIBUTOR_SHIPPED",   // ← spec 'OVERSEAS_SHIPPED' 의도 매핑 (그레이딩 진행 시작)
  "GRADE_CONFIRMED",       // ← spec 'GRADING_COMPLETE' 의도 매핑
  "TRAINERS_ARRIVED",      // ← 카드가 트레이너스 도착, 고객 수령 가능
  "COMPLETED",             // ← spec 'DELIVERED' 의도 매핑
] as const satisfies readonly OrderStatus[];

export type MilestoneStatusKey = (typeof MILESTONE_STATUS_KEYS)[number];

export const NOTIFICATION_TITLE = "그레이딩 진행 알림" as const;
export const NOTIFICATION_BODY = "주문 상태가 업데이트되었습니다" as const;

export const isMilestoneStatus = (status: OrderStatus): status is MilestoneStatusKey =>
  (MILESTONE_STATUS_KEYS as readonly OrderStatus[]).includes(status);
