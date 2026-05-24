import type { GradingCompany } from "./order";

/** 배치 발송 상태 */
export type BatchStatus = "PREPARING" | "SHIPPED" | "RECEIVED" | "COMPLETED";

/**
 * 월별/회사별 그레이딩 배치 발송 묶음.
 * (회사, batchMonth) 조합이 유니크.
 */
export interface Batch {
  id: string;
  company: GradingCompany;
  batchMonth: string; // 'YYYY-MM'
  status: BatchStatus;
  submittedAt?: string;
  shippedAt?: string;
  receivedAt?: string;
  completedAt?: string;
  trackingNumber?: string;
  receiptUrl?: string;
  note?: string;
  /** 집계 컬럼 — DB의 batch_orders / cards 조인으로 계산되는 값 (열로 보관하지 않음) */
  orderCount?: number;
  cardCount?: number;
  createdAt: string;
  updatedAt: string;
}

/** 배치 ↔ 주문 연결 */
export interface BatchOrder {
  batchId: string;
  orderId: string;
  addedAt: string;
}
