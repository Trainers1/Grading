"use client";

// 주문 관리 탭 공통 필터 툴바 — 검색 / 등급회사 / 서비스 / (옵션)상태 / 정렬.

import type { Dispatch, SetStateAction } from "react";
import {
  GRADING_COMPANIES,
  ORDER_STATUS_LABELS,
  SERVICE_LEVELS,
} from "@/constants/grading";
import type { GradingCompany, OrderStatus } from "@/types";
import { INITIAL_FILTER_STATE, type OrderFilterState } from "./use-order-filters";

// 전체 탭 상태 셀렉트 옵션 (워크플로우 진행 순서)
const STATUS_OPTIONS: OrderStatus[] = [
  "PAYMENT_PENDING",
  "CARD_DELIVERY_PENDING",
  "CARD_RECEIVED",
  "SHIPPED_OUT",
  "DISTRIBUTOR_SHIPPED",
  "GRADE_CONFIRMED",
  "TRAINERS_ARRIVED",
  "COMPLETED",
];

type ServiceOption = { value: string; label: string };

// 회사 선택 시 해당 회사 서비스, 미선택 시 4개 회사 전체 서비스 합집합.
function serviceOptionsFor(company: string): ServiceOption[] {
  if (company) {
    const list = SERVICE_LEVELS[company as GradingCompany] ?? [];
    return list.map((s) => ({ value: s.value, label: s.label }));
  }
  const all: ServiceOption[] = [];
  for (const c of GRADING_COMPANIES) {
    for (const s of SERVICE_LEVELS[c.value]) {
      all.push({ value: s.value, label: `${c.label} · ${s.label}` });
    }
  }
  return all;
}

export function OrderFilterToolbar({
  state,
  onChange,
  withStatus = false,
}: {
  state: OrderFilterState;
  onChange: Dispatch<SetStateAction<OrderFilterState>>;
  withStatus?: boolean;
}) {
  const serviceOptions = serviceOptionsFor(state.company);

  const hasFilter =
    !!state.query ||
    !!state.company ||
    !!state.service ||
    !!state.status ||
    state.sort !== "newest";

  // 회사 변경 시 현재 서비스가 새 회사에 없으면 리셋
  const handleCompany = (company: string) => {
    onChange((prev) => {
      const opts = serviceOptionsFor(company);
      const serviceStillValid = opts.some((o) => o.value === prev.service);
      return {
        ...prev,
        company,
        service: serviceStillValid ? prev.service : "",
      };
    });
  };

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <label className="text-xs text-muted-foreground">검색</label>
        <input
          type="text"
          value={state.query}
          onChange={(e) => onChange((p) => ({ ...p, query: e.target.value }))}
          placeholder="주문번호 · 고객 이름"
          className="rounded-md border border-border bg-background px-3 py-2 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">등급회사</label>
        <select
          value={state.company}
          onChange={(e) => handleCompany(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="">전체 회사</option>
          {GRADING_COMPANIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">서비스</label>
        <select
          value={state.service}
          onChange={(e) => onChange((p) => ({ ...p, service: e.target.value }))}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="">전체 서비스</option>
          {serviceOptions.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {withStatus && (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">상태</label>
          <select
            value={state.status}
            onChange={(e) => onChange((p) => ({ ...p, status: e.target.value }))}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="">전체 상태</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {ORDER_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">정렬</label>
        <select
          value={state.sort}
          onChange={(e) =>
            onChange((p) => ({
              ...p,
              sort: e.target.value as OrderFilterState["sort"],
            }))
          }
          className="rounded-md border border-border bg-background px-3 py-2 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="newest">최신순</option>
          <option value="oldest">오래된순</option>
        </select>
      </div>

      {hasFilter && (
        <button
          type="button"
          onClick={() => onChange(INITIAL_FILTER_STATE)}
          className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          초기화
        </button>
      )}
    </div>
  );
}
