"use client";

// 주문 관리 탭 공통 검색·필터·정렬 훅.
// 주문 단위 탭은 getOrder = identity, 카드 단위 탭은 getOrder = (c) => c.order.

import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Order } from "@/types";

export type SortOrder = "newest" | "oldest";

export interface OrderFilterState {
  query: string; // 주문번호·고객 이름 검색어
  company: string; // "" = 전체 회사
  service: string; // "" = 전체 서비스 (serviceLevel 코드)
  status: string; // "" = 전체 상태 (전체 탭에서만 사용)
  sort: SortOrder; // 기본 "newest"
}

export const INITIAL_FILTER_STATE: OrderFilterState = {
  query: "",
  company: "",
  service: "",
  status: "",
  sort: "newest",
};

export function useOrderFilters<T>(
  items: T[],
  getOrder: (item: T) => Order
): {
  state: OrderFilterState;
  setState: Dispatch<SetStateAction<OrderFilterState>>;
  filtered: T[];
} {
  const [state, setState] = useState<OrderFilterState>(INITIAL_FILTER_STATE);

  const filtered = useMemo(() => {
    const q = state.query.trim().toLowerCase();
    const result = items.filter((item) => {
      const o = getOrder(item);
      if (q) {
        const hay = `${o.id} ${o.name}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (state.company && o.gradingCompany !== state.company) return false;
      if (state.service && o.serviceLevel !== state.service) return false;
      if (state.status && o.orderStatus !== state.status) return false;
      return true;
    });
    result.sort((a, b) => {
      const ta = new Date(getOrder(a).createdAt).getTime();
      const tb = new Date(getOrder(b).createdAt).getTime();
      return state.sort === "newest" ? tb - ta : ta - tb;
    });
    return result;
  }, [items, getOrder, state]);

  return { state, setState, filtered };
}
