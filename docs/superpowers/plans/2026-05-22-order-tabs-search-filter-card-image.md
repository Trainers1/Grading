# 주문 관리 탭 검색·필터·정렬 + 카드 앞면 이미지 업로드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 어드민 주문 관리 6개 탭 전체에 검색·필터·정렬을 통일 적용하고, `카드 정보 작성` 탭에서 카드 앞면 이미지를 업로드할 수 있게 한다.

**Architecture:** 검색·필터·정렬은 클라이언트 사이드 공통 훅(`useOrderFilters`) + 공통 툴바(`OrderFilterToolbar`)로 6개 탭에 적용한다. 카드 앞면 이미지는 신규 Supabase Storage 공개 버킷 `card-images` 에 service-role 서버 액션으로 업로드하고 `cards.front_image_url` 에 URL 을 저장한다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase (Postgres + Storage), Tailwind v4.

---

## 사전 안내 — 검증 방식 / git

- **테스트 러너 없음.** 이 저장소에는 테스트 러너가 없다(`CLAUDE.md`). 각 태스크의 검증은
  `pnpm build`(타입체크 포함) + `pnpm lint` + 수동 확인으로 한다. `pnpm test` 는 존재하지 않으므로
  사용하지 않는다.
- **git 저장소 아님.** 현재 디렉터리는 git 저장소가 아니다. 커밋 단계는 없다. 각 태스크는 커밋
  대신 `pnpm build` 통과로 마무리한다.
- `next build` 는 `tsconfig` include 범위의 모든 `.ts/.tsx` 를 타입체크하므로, 아직
  import 되지 않은 신규 파일도 빌드 시 타입 검증된다.

## File Structure

**신규 파일**

| 파일 | 책임 |
|---|---|
| `supabase/migrations/016_card_images_bucket.sql` | `card-images` Storage 버킷 생성 |
| `src/app/(admin)/admin/orders/_components/use-order-filters.ts` | 검색·필터·정렬 상태 + 로직 훅 |
| `src/app/(admin)/admin/orders/_components/order-filter-toolbar.tsx` | 공통 필터 툴바 UI |
| `src/app/(admin)/admin/orders/_components/cancelled-orders-tab.tsx` | 취소됨 탭(클라이언트 컴포넌트로 분리) |

**수정 파일**

| 파일 | 변경 |
|---|---|
| `src/lib/orders/admin-actions.ts` | `uploadCardFrontImageAction`, `removeCardFrontImageAction` 추가 |
| `src/app/(admin)/admin/orders/_components/intake-management-tab.tsx` | 공통 툴바 적용 |
| `src/app/(admin)/admin/orders/_components/card-info-entry-tab.tsx` | 공통 툴바 + 앞면 이미지 열 |
| `src/app/(admin)/admin/orders/_components/ship-arrive-tab.tsx` | 공통 툴바 적용 |
| `src/app/(admin)/admin/orders/_components/pickup-complete-tab.tsx` | 공통 툴바 적용 |
| `src/app/(admin)/admin/orders/_components/all-orders-tab.tsx` | 공통 툴바로 재작성 |
| `src/app/(admin)/admin/orders/page.tsx` | 서버 필터 제거, 취소됨 탭 분리 |

**삭제 파일**

| 파일 | 사유 |
|---|---|
| `src/app/(admin)/admin/orders/_components/all-orders-filter-bar.tsx` | 공통 툴바로 대체 |

---

## Task 1: card-images Storage 버킷 마이그레이션

**Files:**
- Create: `supabase/migrations/016_card_images_bucket.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

`supabase/migrations/016_card_images_bucket.sql`:

```sql
-- =====================================================================
-- 016_card_images_bucket.sql
-- 카드 앞면 이미지 저장용 Supabase Storage 버킷 생성.
--   * card-images: 공개 버킷 — 고객 주문상세 페이지가 front_image_url 을 일반
--     URL 로 직접 렌더링하므로 공개 버킷이 적합(서명 URL 불필요).
--   * 업로드/삭제는 서버 액션의 service-role 클라이언트로만 수행하므로 RLS 를
--     우회한다. 공개 버킷은 읽기가 자동 허용되어 별도 storage 정책이 필요 없다.
--   * cards.front_image_url 컬럼은 005 마이그레이션에서 이미 nullable 로 존재.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'card-images',
  'card-images',
  true,
  10485760, -- 10MB
  array['image/jpeg', 'image/png']
)
on conflict (id) do nothing;
```

- [ ] **Step 2: 마이그레이션을 Supabase 에 적용**

이 SQL 은 빌드와 무관하지만 런타임에 버킷이 없으면 업로드가 실패한다. Supabase 프로젝트에
적용한다 — 대시보드 SQL Editor 에 위 내용을 붙여 실행하거나, Supabase CLI 사용 시
`supabase db push`.

확인: Supabase 대시보드 → Storage 에 `card-images` 버킷이 보이고 Public 으로 표시되는지.

---

## Task 2: 카드 앞면 이미지 서버 액션

**Files:**
- Modify: `src/lib/orders/admin-actions.ts` (파일 끝에 추가)

- [ ] **Step 1: `admin-actions.ts` 끝에 액션 2종 + 헬퍼 추가**

`src/lib/orders/admin-actions.ts` 파일의 **맨 끝**에 아래 블록을 그대로 추가한다. 이 파일은
이미 `requireAdmin`, `createServiceClient`, `revalidatePath`, `canInputData`,
`AdminActionResult` 를 정의/import 하고 있으므로 새 import 는 필요 없다.

```ts
// ── 카드 앞면 이미지 업로드 / 삭제 ─────────────────────────────────────────
// 카드 정보 작성 탭에서 카드 앞면 사진을 Supabase Storage(card-images 공개 버킷)에
// 올리고 cards.front_image_url 에 public URL 을 저장한다.
// 앞면 이미지는 선택 항목 — 카드 입력 완료 자동 승격 판정에는 영향을 주지 않는다.

const CARD_IMAGE_BUCKET = "card-images";

// MIME → 확장자 매핑 (허용 포맷)
const CARD_IMAGE_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
};

const CARD_IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10MB

// public URL 에서 버킷 내부 경로(`{cardId}/front-...`)를 추출한다.
function extractCardImagePath(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/${CARD_IMAGE_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}

export type UploadCardFrontImageResult =
  | { ok: false; error: string }
  | { ok: true; url: string };

export async function uploadCardFrontImageAction(
  formData: FormData
): Promise<UploadCardFrontImageResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, error: "관리자 권한이 필요합니다." };
  }
  if (!canInputData(admin.adminRole)) {
    return { ok: false, error: "매장 계정은 카드 정보를 수정할 수 없습니다." };
  }

  const cardId = formData.get("cardId");
  const file = formData.get("file");

  if (typeof cardId !== "string" || !cardId) {
    return { ok: false, error: "카드 ID 가 필요합니다." };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "업로드할 이미지를 선택해 주세요." };
  }

  const ext = CARD_IMAGE_EXT[file.type];
  if (!ext) {
    return { ok: false, error: "JPG 또는 PNG 파일만 업로드할 수 있습니다." };
  }
  if (file.size > CARD_IMAGE_MAX_BYTES) {
    return { ok: false, error: "이미지 크기는 10MB 이하여야 합니다." };
  }

  const service = createServiceClient();

  // 대상 카드 조회 — 주문 ID 및 기존 이미지 경로 확보
  const { data: cardRow, error: fErr } = await service
    .from("cards")
    .select("order_id, front_image_url")
    .eq("id", cardId)
    .maybeSingle();
  if (fErr || !cardRow) {
    return { ok: false, error: "카드를 찾을 수 없습니다." };
  }

  const path = `${cardId}/front-${Date.now()}.${ext}`;
  const { error: upErr } = await service.storage
    .from(CARD_IMAGE_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) {
    console.error("[cards] front image upload failed", upErr);
    return { ok: false, error: "이미지 업로드에 실패했습니다." };
  }

  const { data: pub } = service.storage
    .from(CARD_IMAGE_BUCKET)
    .getPublicUrl(path);
  const url = pub.publicUrl;

  const { error: updErr } = await service
    .from("cards")
    .update({ front_image_url: url })
    .eq("id", cardId);
  if (updErr) {
    console.error("[cards] front image url save failed", updErr);
    // 저장 실패 시 방금 올린 파일 롤백 (best-effort)
    await service.storage.from(CARD_IMAGE_BUCKET).remove([path]);
    return { ok: false, error: "이미지 정보 저장에 실패했습니다." };
  }

  // 기존 이미지 파일 정리 (best-effort — 실패해도 무시)
  const prevPath = extractCardImagePath(cardRow.front_image_url);
  if (prevPath && prevPath !== path) {
    const { error: rmErr } = await service.storage
      .from(CARD_IMAGE_BUCKET)
      .remove([prevPath]);
    if (rmErr) {
      console.warn("[cards] previous front image cleanup failed", rmErr);
    }
  }

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${cardRow.order_id}`);
  return { ok: true, url };
}

export async function removeCardFrontImageAction(params: {
  cardId: string;
}): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, error: "관리자 권한이 필요합니다." };
  }
  if (!canInputData(admin.adminRole)) {
    return { ok: false, error: "매장 계정은 카드 정보를 수정할 수 없습니다." };
  }
  if (!params.cardId) {
    return { ok: false, error: "카드 ID 가 필요합니다." };
  }

  const service = createServiceClient();
  const { data: cardRow, error: fErr } = await service
    .from("cards")
    .select("order_id, front_image_url")
    .eq("id", params.cardId)
    .maybeSingle();
  if (fErr || !cardRow) {
    return { ok: false, error: "카드를 찾을 수 없습니다." };
  }

  const { error: updErr } = await service
    .from("cards")
    .update({ front_image_url: null })
    .eq("id", params.cardId);
  if (updErr) {
    console.error("[cards] front image remove failed", updErr);
    return { ok: false, error: "이미지 삭제에 실패했습니다." };
  }

  // 스토리지 파일 정리 (best-effort)
  const prevPath = extractCardImagePath(cardRow.front_image_url);
  if (prevPath) {
    const { error: rmErr } = await service.storage
      .from(CARD_IMAGE_BUCKET)
      .remove([prevPath]);
    if (rmErr) {
      console.warn("[cards] front image file cleanup failed", rmErr);
    }
  }

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${cardRow.order_id}`);
  return { ok: true };
}
```

- [ ] **Step 2: 빌드 검증**

Run: `pnpm build`
Expected: 빌드 성공. 타입 오류 없음. (`createServiceClient` 는 `@supabase/supabase-js`
클라이언트라 `.storage` 가 존재한다.)

---

## Task 3: useOrderFilters 훅

**Files:**
- Create: `src/app/(admin)/admin/orders/_components/use-order-filters.ts`

- [ ] **Step 1: 훅 파일 작성**

`src/app/(admin)/admin/orders/_components/use-order-filters.ts`:

```ts
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
```

> **주의:** 호출하는 탭은 `getOrder` 를 **모듈 레벨 상수**로 정의해 전달한다(렌더마다 새
> 함수가 생기면 `useMemo` 가 매번 재계산됨). 각 탭 태스크에 해당 상수 정의가 포함되어 있다.

- [ ] **Step 2: 빌드 검증**

Run: `pnpm build`
Expected: 빌드 성공. (`next build` 가 미사용 신규 파일도 타입체크함.)

---

## Task 4: OrderFilterToolbar 컴포넌트

**Files:**
- Create: `src/app/(admin)/admin/orders/_components/order-filter-toolbar.tsx`

- [ ] **Step 1: 툴바 컴포넌트 작성**

`src/app/(admin)/admin/orders/_components/order-filter-toolbar.tsx`:

```tsx
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
      <div className="flex min-w-48 flex-1 flex-col gap-1">
        <label className="text-xs text-muted-foreground">검색</label>
        <input
          type="text"
          value={state.query}
          onChange={(e) => onChange((p) => ({ ...p, query: e.target.value }))}
          placeholder="주문번호 · 고객 이름"
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">등급회사</label>
        <select
          value={state.company}
          onChange={(e) => handleCompany(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
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
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
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
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
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
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
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
```

- [ ] **Step 2: 빌드 검증**

Run: `pnpm build`
Expected: 빌드 성공.

---

## Task 5: 접수 관리 탭에 공통 툴바 적용

**Files:**
- Modify: `src/app/(admin)/admin/orders/_components/intake-management-tab.tsx` (전체 교체)

- [ ] **Step 1: 파일 전체를 아래 내용으로 교체**

`src/app/(admin)/admin/orders/_components/intake-management-tab.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  bulkCompleteOnsitePaymentAction,
  completeOnsitePaymentAction,
} from "@/lib/orders/admin-actions";
import type { Order } from "@/types";
import { useOrderFilters } from "./use-order-filters";
import { OrderFilterToolbar } from "./order-filter-toolbar";

const identity = (o: Order) => o;

function formatCurrency(amount: number): string {
  return `₩${amount.toLocaleString("ko-KR")}`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR");
}

export function IntakeManagementTab({ orders }: { orders: Order[] }) {
  const router = useRouter();
  const { state, setState, filtered } = useOrderFilters(orders, identity);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const allIds = useMemo(() => filtered.map((o) => o.id), [filtered]);
  const filteredIds = useMemo(() => new Set(allIds), [allIds]);
  const isAllSelected = allIds.length > 0 && selected.size === allIds.length;
  const isSomeSelected = selected.size > 0 && !isAllSelected;

  // 필터 변경 시 보이지 않는 행의 선택 해제
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => filteredIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [filteredIds]);

  const toggleAll = () => {
    if (isAllSelected) setSelected(new Set());
    else setSelected(new Set(allIds));
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const resetMessages = () => {
    setError(null);
    setNotice(null);
  };

  const handleBulkComplete = () => {
    if (selected.size === 0) {
      setError("결제 완료 처리할 주문을 선택해 주세요.");
      return;
    }
    const ok = window.confirm(
      `선택한 ${selected.size}건의 현장 결제를 완료 처리하시겠습니까?`
    );
    if (!ok) return;
    resetMessages();
    startTransition(async () => {
      const result = await bulkCompleteOnsitePaymentAction({
        orderIds: Array.from(selected),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(`${result.processedCount}건 결제 완료 처리됨.`);
      setSelected(new Set());
      router.refresh();
    });
  };

  const handleSingleComplete = (orderId: string) => {
    const ok = window.confirm(
      `주문 ${orderId} 의 현장 결제를 완료 처리하시겠습니까?`
    );
    if (!ok) return;
    resetMessages();
    startTransition(async () => {
      const result = await completeOnsitePaymentAction({ orderId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(`주문 ${orderId} 결제 완료 처리됨.`);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <OrderFilterToolbar state={state} onChange={setState} />

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border p-5">
          <h2 className="font-semibold">접수 관리 (신청 완료 → 결제 완료)</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            현장 결제로 신청된 주문 목록입니다. 매장에서 결제 수령 후 "결제 완료
            처리"를 눌러 다음 단계로 진행해 주세요.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted/10 px-5 py-3">
          <span className="text-xs text-muted-foreground">
            선택 {selected.size}건
          </span>
          <button
            type="button"
            onClick={handleBulkComplete}
            disabled={isPending || selected.size === 0}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "처리 중..." : "선택 결제 완료 처리"}
          </button>
        </div>

        {error && (
          <div className="border-b border-error/30 bg-error/5 px-5 py-2 text-xs text-error">
            {error}
          </div>
        )}
        {notice && (
          <div className="border-b border-success/30 bg-success/5 px-5 py-2 text-xs text-success">
            {notice}
          </div>
        )}

        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  aria-label="전체 선택"
                  checked={isAllSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = isSomeSelected;
                  }}
                  onChange={toggleAll}
                  disabled={isPending || filtered.length === 0}
                />
              </th>
              <th className="px-3 py-3">주문번호</th>
              <th className="px-3 py-3">이름</th>
              <th className="px-3 py-3">회사</th>
              <th className="px-3 py-3">서비스</th>
              <th className="px-3 py-3">결제 예정</th>
              <th className="px-3 py-3">신청일</th>
              <th className="px-3 py-3 text-right">처리</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-5 py-10 text-center text-muted-foreground"
                >
                  {orders.length === 0
                    ? "결제 완료 처리 대기 중인 주문이 없습니다."
                    : "조건에 맞는 주문이 없습니다."}
                </td>
              </tr>
            ) : (
              filtered.map((o) => {
                const checked = selected.has(o.id);
                return (
                  <tr
                    key={o.id}
                    className={`border-t border-border hover:bg-muted/20 ${
                      checked ? "bg-primary/5" : ""
                    }`}
                  >
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        aria-label={`${o.id} 선택`}
                        checked={checked}
                        onChange={() => toggleOne(o.id)}
                        disabled={isPending}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <Link
                        href={`/admin/orders/${o.id}`}
                        className="font-mono text-primary hover:underline"
                      >
                        {o.id}
                      </Link>
                    </td>
                    <td className="px-3 py-3">{o.name}</td>
                    <td className="px-3 py-3">{o.gradingCompany}</td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {o.serviceLevel}
                    </td>
                    <td className="px-3 py-3">
                      {formatCurrency(o.prepaidAmount)}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {formatDateTime(o.createdAt)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleSingleComplete(o.id)}
                        disabled={isPending}
                        className="rounded-md border border-primary/40 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        결제 완료
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 빌드 검증**

Run: `pnpm build`
Expected: 빌드 성공.

---

## Task 6: 카드 정보 작성 탭 — 공통 툴바 + 앞면 이미지 열

**Files:**
- Modify: `src/app/(admin)/admin/orders/_components/card-info-entry-tab.tsx` (전체 교체)

의존: Task 2(서버 액션), Task 3(훅), Task 4(툴바).

- [ ] **Step 1: 파일 전체를 아래 내용으로 교체**

`src/app/(admin)/admin/orders/_components/card-info-entry-tab.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  removeCardFrontImageAction,
  updateCardDetailsAction,
  uploadCardFrontImageAction,
} from "@/lib/orders/admin-actions";
import { PHOTO_UPLOAD } from "@/constants/grading";
import type { Card, Order } from "@/types";
import { useOrderFilters } from "./use-order-filters";
import { OrderFilterToolbar } from "./order-filter-toolbar";

type CardWithOrder = Card & { order: Order };

const getCardOrder = (c: CardWithOrder) => c.order;

function isCardComplete(c: Card): boolean {
  return (
    !!c.englishName?.trim() &&
    !!c.setName?.trim() &&
    !!c.cardNumber?.trim() &&
    !!c.year?.trim()
  );
}

export function CardInfoEntryTab({
  orders,
  cards,
}: {
  orders: Order[];
  cards: Card[];
}) {
  // 같은 주문 내 카드를 주문 정보와 결합
  const cardsWithOrder = useMemo<CardWithOrder[]>(() => {
    const orderById = new Map<string, Order>();
    for (const o of orders) orderById.set(o.id, o);
    const result: CardWithOrder[] = [];
    for (const c of cards) {
      const o = orderById.get(c.orderId);
      if (o) result.push({ ...c, order: o });
    }
    return result;
  }, [orders, cards]);

  const { state, setState, filtered } = useOrderFilters(
    cardsWithOrder,
    getCardOrder
  );

  const totalCards = filtered.length;
  const pendingCards = filtered.filter((c) => !isCardComplete(c)).length;

  return (
    <div className="space-y-4">
      <OrderFilterToolbar state={state} onChange={setState} />

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border p-5">
          <h2 className="font-semibold">카드 정보 작성 (결제 완료 → 접수 완료)</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            결제 완료된 주문의 카드들이 카드별로 나열됩니다. 영문명·세트·번호·연도
            4개 항목을 모두 입력하면 저장되며, 한 주문의 모든 카드가 채워지면
            자동으로 접수 완료 단계로 이동합니다. 앞면 이미지는 선택 항목입니다.
            (빈칸 = 미입력)
          </p>
          <p className="mt-2 text-xs">
            <span className="rounded-full bg-warning/10 px-2 py-0.5 font-medium text-warning">
              미입력 {pendingCards}장
            </span>{" "}
            / 표시 {totalCards}장
          </p>
        </div>

        {filtered.length === 0 ? (
          <div className="px-5 py-10 text-center text-muted-foreground">
            {cardsWithOrder.length === 0
              ? "카드 정보 작성 대기 중인 주문이 없습니다."
              : "조건에 맞는 카드가 없습니다."}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-3">주문번호</th>
                <th className="px-3 py-3">고객</th>
                <th className="px-3 py-3">회사 / 서비스</th>
                <th className="px-3 py-3">영문명 *</th>
                <th className="px-3 py-3">세트 *</th>
                <th className="px-3 py-3">번호 *</th>
                <th className="px-3 py-3">연도 *</th>
                <th className="px-3 py-3">신고가액</th>
                <th className="px-3 py-3">앞면 이미지</th>
                <th className="px-3 py-3 text-right">관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <CardRow key={c.id} card={c} order={c.order} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function CardRow({ card, order }: { card: Card; order: Order }) {
  const router = useRouter();
  const [englishName, setEnglishName] = useState(card.englishName ?? "");
  const [setName, setSetName] = useState(card.setName ?? "");
  const [cardNumber, setCardNumber] = useState(card.cardNumber ?? "");
  const [year, setYear] = useState(card.year ?? "");
  const [declaredValue, setDeclaredValue] = useState<string>(
    card.declaredValue ? String(card.declaredValue) : ""
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // 이미지 업로드 상태 — 텍스트 저장과 독립
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [isImagePending, startImageTransition] = useTransition();

  useEffect(() => {
    setEnglishName(card.englishName ?? "");
    setSetName(card.setName ?? "");
    setCardNumber(card.cardNumber ?? "");
    setYear(card.year ?? "");
    setDeclaredValue(card.declaredValue ? String(card.declaredValue) : "");
  }, [
    card.englishName,
    card.setName,
    card.cardNumber,
    card.year,
    card.declaredValue,
  ]);

  const isComplete =
    !!englishName.trim() &&
    !!setName.trim() &&
    !!cardNumber.trim() &&
    !!year.trim();

  const save = () => {
    const parsedDeclared = declaredValue.trim()
      ? Number(declaredValue.replace(/,/g, ""))
      : null;
    if (
      parsedDeclared !== null &&
      (!Number.isFinite(parsedDeclared) || parsedDeclared < 0)
    ) {
      setError("신고가액은 0 이상의 숫자여야 합니다.");
      return;
    }
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await updateCardDetailsAction({
        cardId: card.id,
        englishName: englishName.trim() || undefined,
        setName: setName.trim() || undefined,
        cardNumber: cardNumber.trim() || undefined,
        year: year.trim() || undefined,
        declaredValue: parsedDeclared,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(result.promoted ? "접수 완료로 이동됨" : "저장됨");
      router.refresh();
    });
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 재선택 허용
    if (!file) return;

    if (!(PHOTO_UPLOAD.acceptedFormats as readonly string[]).includes(file.type)) {
      setImageError("JPG 또는 PNG 파일만 업로드할 수 있습니다.");
      return;
    }
    if (file.size > PHOTO_UPLOAD.maxSizeBytes) {
      setImageError(`이미지 크기는 ${PHOTO_UPLOAD.maxSizeMB}MB 이하여야 합니다.`);
      return;
    }

    setImageError(null);
    const formData = new FormData();
    formData.append("cardId", card.id);
    formData.append("file", file);
    startImageTransition(async () => {
      const result = await uploadCardFrontImageAction(formData);
      if (!result.ok) {
        setImageError(result.error);
        return;
      }
      router.refresh();
    });
  };

  const handleImageRemove = () => {
    if (!window.confirm("앞면 이미지를 삭제하시겠습니까?")) return;
    setImageError(null);
    startImageTransition(async () => {
      const result = await removeCardFrontImageAction({ cardId: card.id });
      if (!result.ok) {
        setImageError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <tr
      className={`border-t border-border align-top ${
        isComplete ? "bg-success/5" : ""
      }`}
    >
      <td className="px-3 py-3">
        <Link
          href={`/admin/orders/${order.id}`}
          className="font-mono text-primary hover:underline"
        >
          {order.id}
        </Link>
      </td>
      <td className="px-3 py-3">{order.name}</td>
      <td className="px-3 py-3 text-muted-foreground">
        <div>{order.gradingCompany}</div>
        <div className="text-[10px]">{order.serviceLevel}</div>
      </td>
      <td className="px-3 py-3">
        <input
          type="text"
          value={englishName}
          onChange={(e) => setEnglishName(e.target.value)}
          placeholder="예: Pikachu"
          disabled={isPending}
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
        />
      </td>
      <td className="px-3 py-3">
        <input
          type="text"
          value={setName}
          onChange={(e) => setSetName(e.target.value)}
          placeholder="세트"
          disabled={isPending}
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
        />
      </td>
      <td className="px-3 py-3">
        <input
          type="text"
          value={cardNumber}
          onChange={(e) => setCardNumber(e.target.value)}
          placeholder="번호"
          disabled={isPending}
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
        />
      </td>
      <td className="px-3 py-3">
        <input
          type="text"
          value={year}
          onChange={(e) => setYear(e.target.value)}
          placeholder="연도"
          disabled={isPending}
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
        />
      </td>
      <td className="px-3 py-3">
        <input
          type="text"
          inputMode="numeric"
          value={declaredValue}
          onChange={(e) => setDeclaredValue(e.target.value)}
          placeholder="원"
          disabled={isPending}
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
        />
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-col items-start gap-1">
          <input
            ref={fileInputRef}
            type="file"
            accept={PHOTO_UPLOAD.acceptedExtensions}
            onChange={handleImageSelect}
            disabled={isImagePending}
            className="hidden"
          />
          {card.frontImageUrl ? (
            <>
              <a
                href={card.frontImageUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={card.frontImageUrl}
                  alt="카드 앞면"
                  className="h-14 w-10 rounded border border-border object-cover"
                />
              </a>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isImagePending}
                  className="text-[10px] text-primary hover:underline disabled:opacity-50"
                >
                  {isImagePending ? "처리 중..." : "변경"}
                </button>
                <button
                  type="button"
                  onClick={handleImageRemove}
                  disabled={isImagePending}
                  className="text-[10px] text-error hover:underline disabled:opacity-50"
                >
                  삭제
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isImagePending}
              className="rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {isImagePending ? "업로드 중..." : "이미지 업로드"}
            </button>
          )}
          {imageError && <p className="text-[10px] text-error">{imageError}</p>}
        </div>
      </td>
      <td className="px-3 py-3 text-right">
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={save}
            disabled={isPending}
            className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isPending ? "저장 중..." : "저장"}
          </button>
          {error && <p className="text-[10px] text-error">{error}</p>}
          {notice && !error && (
            <p className="text-[10px] text-success">{notice}</p>
          )}
        </div>
      </td>
    </tr>
  );
}
```

- [ ] **Step 2: 빌드 검증**

Run: `pnpm build`
Expected: 빌드 성공.

---

## Task 7: 출고/입고 탭에 공통 툴바 적용

**Files:**
- Modify: `src/app/(admin)/admin/orders/_components/ship-arrive-tab.tsx` (전체 교체)

- [ ] **Step 1: 파일 전체를 아래 내용으로 교체**

`src/app/(admin)/admin/orders/_components/ship-arrive-tab.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  bulkArriveOrdersAction,
  bulkShipOutOrdersAction,
} from "@/lib/orders/admin-actions";
import type { Order } from "@/types";
import { useOrderFilters } from "./use-order-filters";
import { OrderFilterToolbar } from "./order-filter-toolbar";

type SubMode = "ship" | "arrive";

const identity = (o: Order) => o;

function formatCurrency(amount: number): string {
  return `₩${amount.toLocaleString("ko-KR")}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  });
}

export function ShipArriveTab({
  mode,
  orders,
  baseHref,
}: {
  mode: SubMode;
  orders: Order[];
  /** "/admin/orders?view=shipping" 등 — 서브탭 토글에 사용 */
  baseHref: string;
}) {
  const router = useRouter();
  const { state, setState, filtered } = useOrderFilters(orders, identity);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // (회사, 서비스) 그룹핑 — 필터 결과 기준
  const groups = useMemo(() => {
    const m = new Map<string, Order[]>();
    for (const o of filtered) {
      const key = `${o.gradingCompany}::${o.serviceLevel}`;
      const list = m.get(key);
      if (list) list.push(o);
      else m.set(key, [o]);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const allIds = useMemo(() => filtered.map((o) => o.id), [filtered]);
  const filteredIds = useMemo(() => new Set(allIds), [allIds]);
  const isAllSelected = allIds.length > 0 && selected.size === allIds.length;

  // 필터 변경 시 보이지 않는 행의 선택 해제
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => filteredIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [filteredIds]);

  const toggleAll = () => {
    if (isAllSelected) setSelected(new Set());
    else setSelected(new Set(allIds));
  };

  const toggleGroup = (groupOrders: Order[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const groupIds = groupOrders.map((o) => o.id);
      const allInGroup = groupIds.every((id) => next.has(id));
      if (allInGroup) for (const id of groupIds) next.delete(id);
      else for (const id of groupIds) next.add(id);
      return next;
    });
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const resetMessages = () => {
    setError(null);
    setNotice(null);
  };

  const handleAction = () => {
    if (selected.size === 0) {
      setError(
        mode === "ship"
          ? "출고 처리할 주문을 선택해 주세요."
          : "입고 처리할 주문을 선택해 주세요."
      );
      return;
    }
    const verb = mode === "ship" ? "출고" : "입고";
    const ok = window.confirm(
      `선택한 ${selected.size}건의 주문을 ${verb} 처리하시겠습니까?`
    );
    if (!ok) return;
    resetMessages();
    startTransition(async () => {
      const result =
        mode === "ship"
          ? await bulkShipOutOrdersAction({ orderIds: Array.from(selected) })
          : await bulkArriveOrdersAction({ orderIds: Array.from(selected) });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(`${result.processedCount}건 ${verb} 처리됨.`);
      setSelected(new Set());
      router.refresh();
    });
  };

  const subTabLink = (target: SubMode) => {
    const sp = new URLSearchParams(baseHref.split("?")[1] ?? "");
    sp.set("view", "shipping");
    sp.set("sub", target);
    return `/admin/orders?${sp}`;
  };

  const title =
    mode === "ship"
      ? "출고 (접수 완료 → 출고)"
      : "입고 (등급 확정 → 트레이너스 도착)";
  const desc =
    mode === "ship"
      ? "접수 완료 상태의 주문을 그레이딩사 및 서비스 단위로 묶어 일괄 출고 처리합니다."
      : "등급 확정 상태의 주문을 그레이딩사 및 서비스 단위로 묶어 일괄 입고(트레이너스 도착) 처리합니다.";
  const actionLabel = mode === "ship" ? "출고 처리" : "입고 처리";

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-border">
        <Link
          href={subTabLink("ship")}
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            mode === "ship"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          출고
        </Link>
        <Link
          href={subTabLink("arrive")}
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            mode === "arrive"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          입고
        </Link>
      </div>

      <OrderFilterToolbar state={state} onChange={setState} />

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border p-5">
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted/10 px-5 py-3">
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={isAllSelected}
              onChange={toggleAll}
              disabled={isPending || filtered.length === 0}
            />
            전체 선택 ({filtered.length}건)
          </label>
          <span className="text-xs text-muted-foreground">
            선택 {selected.size}건
          </span>
          <button
            type="button"
            onClick={handleAction}
            disabled={isPending || selected.size === 0}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "처리 중..." : `선택 ${actionLabel}`}
          </button>
        </div>

        {error && (
          <div className="border-b border-error/30 bg-error/5 px-5 py-2 text-xs text-error">
            {error}
          </div>
        )}
        {notice && (
          <div className="border-b border-success/30 bg-success/5 px-5 py-2 text-xs text-success">
            {notice}
          </div>
        )}

        {groups.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            {orders.length === 0
              ? "처리 대기 중인 주문이 없습니다."
              : "조건에 맞는 주문이 없습니다."}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {groups.map(([key, groupOrders]) => {
              const [company, service] = key.split("::");
              const groupIds = groupOrders.map((o) => o.id);
              const allGroupSelected = groupIds.every((id) =>
                selected.has(id)
              );
              const someGroupSelected =
                !allGroupSelected && groupIds.some((id) => selected.has(id));
              return (
                <section key={key}>
                  <header className="flex items-center justify-between bg-muted/20 px-5 py-2">
                    <label className="flex items-center gap-2 text-sm font-semibold">
                      <input
                        type="checkbox"
                        checked={allGroupSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someGroupSelected;
                        }}
                        onChange={() => toggleGroup(groupOrders)}
                        disabled={isPending}
                      />
                      {company}
                      <span className="text-xs font-normal text-muted-foreground">
                        · {service}
                      </span>
                    </label>
                    <span className="rounded-full bg-primary/10 px-3 py-0.5 text-xs font-medium text-primary">
                      {groupOrders.length}건
                    </span>
                  </header>
                  <table className="w-full text-sm">
                    <thead className="bg-muted/10 text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="w-10 px-3 py-2"></th>
                        <th className="px-3 py-2">주문번호</th>
                        <th className="px-3 py-2">이름</th>
                        <th className="px-3 py-2">금액</th>
                        <th className="px-3 py-2">접수일</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupOrders.map((o) => {
                        const checked = selected.has(o.id);
                        return (
                          <tr
                            key={o.id}
                            className={`border-t border-border hover:bg-muted/20 ${
                              checked ? "bg-primary/5" : ""
                            }`}
                          >
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleOne(o.id)}
                                disabled={isPending}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <Link
                                href={`/admin/orders/${o.id}`}
                                className="font-mono text-primary hover:underline"
                              >
                                {o.id}
                              </Link>
                            </td>
                            <td className="px-3 py-2">{o.name}</td>
                            <td className="px-3 py-2">
                              {formatCurrency(
                                o.prepaidAmount + (o.overchargeAmount ?? 0)
                              )}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {formatDate(o.createdAt)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 빌드 검증**

Run: `pnpm build`
Expected: 빌드 성공.

---

## Task 8: 수령 완료 탭에 공통 툴바 적용

**Files:**
- Modify: `src/app/(admin)/admin/orders/_components/pickup-complete-tab.tsx` (전체 교체)

- [ ] **Step 1: 파일 전체를 아래 내용으로 교체**

`src/app/(admin)/admin/orders/_components/pickup-complete-tab.tsx`:

```tsx
"use client";

// 수령 완료 탭 — 매장 방문 수령(STORE_PICKUP) + 트레이너스 도착(TRAINERS_ARRIVED)
// 주문을 행 단위로 수령 완료(COMPLETED) 처리한다.

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completePickupOrderAction } from "@/lib/orders/admin-actions";
import type { Order } from "@/types";
import { useOrderFilters } from "./use-order-filters";
import { OrderFilterToolbar } from "./order-filter-toolbar";

const identity = (o: Order) => o;

function formatCurrency(amount: number): string {
  return `₩${amount.toLocaleString("ko-KR")}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  });
}

export function PickupCompleteTab({ orders }: { orders: Order[] }) {
  const router = useRouter();
  const { state, setState, filtered } = useOrderFilters(orders, identity);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleComplete = (orderId: string) => {
    const ok = window.confirm(
      `주문 ${orderId} 을(를) 수령 완료 처리하시겠습니까?`
    );
    if (!ok) return;
    setError(null);
    setPendingId(orderId);
    startTransition(async () => {
      const result = await completePickupOrderAction({ orderId });
      setPendingId(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <OrderFilterToolbar state={state} onChange={setState} />

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border p-5">
          <h2 className="font-semibold">
            수령 완료 (트레이너스 도착 → 수령 완료)
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            매장 방문 수령 주문 중 트레이너스 도착 단계의 주문입니다. 고객이
            매장에서 카드를 수령해 가면 "수령 완료"를 눌러 등급 대행을
            마무리합니다. (택배 수령 주문은 택배 발송 페이지에서 처리됩니다.)
          </p>
        </div>

        {error && (
          <div className="border-b border-error/30 bg-error/5 px-5 py-2 text-xs text-error">
            {error}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-5 py-3">주문번호</th>
                <th className="px-5 py-3">고객</th>
                <th className="px-5 py-3">회사 / 서비스</th>
                <th className="px-5 py-3">금액</th>
                <th className="px-5 py-3">신청일</th>
                <th className="px-5 py-3 text-right">관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-10 text-center text-muted-foreground"
                  >
                    {orders.length === 0
                      ? "수령 대기 중인 매장 수령 주문이 없습니다."
                      : "조건에 맞는 주문이 없습니다."}
                  </td>
                </tr>
              ) : (
                filtered.map((o) => (
                  <tr
                    key={o.id}
                    className="border-t border-border align-top hover:bg-muted/20"
                  >
                    <td className="px-5 py-3">
                      <Link
                        href={`/admin/orders/${o.id}`}
                        className="font-mono text-primary hover:underline"
                      >
                        {o.id}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <p className="font-medium">{o.name}</p>
                      <p className="text-xs text-muted-foreground">{o.phone}</p>
                    </td>
                    <td className="px-5 py-3">
                      {o.gradingCompany} / {o.serviceLevel}
                    </td>
                    <td className="px-5 py-3">
                      {formatCurrency(
                        o.prepaidAmount + (o.overchargeAmount ?? 0)
                      )}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {formatDate(o.createdAt)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleComplete(o.id)}
                        disabled={isPending}
                        className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isPending && pendingId === o.id
                          ? "처리 중..."
                          : "수령 완료"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 빌드 검증**

Run: `pnpm build`
Expected: 빌드 성공.

---

## Task 9: 취소됨 탭 클라이언트 컴포넌트 생성

**Files:**
- Create: `src/app/(admin)/admin/orders/_components/cancelled-orders-tab.tsx`

이 태스크에서는 신규 파일만 만든다(아직 `page.tsx` 가 import 하지 않음). `next build` 가
미사용 신규 파일도 타입체크하므로 빌드는 통과한다.

- [ ] **Step 1: 파일 작성**

`src/app/(admin)/admin/orders/_components/cancelled-orders-tab.tsx`:

```tsx
"use client";

// 취소됨 탭 — 취소된 주문 목록. 잔존 결제 정리(환불) → 영구 삭제 흐름.
// page.tsx 의 서버 컴포넌트에서 paymentCounts(Record) 와 권한 플래그를 받아 렌더링한다.

import Link from "next/link";
import type { Order } from "@/types";
import { DeleteOrderButton } from "./delete-order-button";
import { RefundOrderButton } from "./refund-order-button";
import { useOrderFilters } from "./use-order-filters";
import { OrderFilterToolbar } from "./order-filter-toolbar";

const identity = (o: Order) => o;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  });
}

export function CancelledOrdersTab({
  orders,
  paymentCounts,
  canDelete,
  canRefund,
}: {
  orders: Order[];
  paymentCounts: Record<string, number>;
  canDelete: boolean;
  canRefund: boolean;
}) {
  const { state, setState, filtered } = useOrderFilters(orders, identity);

  return (
    <div className="space-y-4">
      <OrderFilterToolbar state={state} onChange={setState} />

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border p-5">
          <h2 className="font-semibold">취소된 주문</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            잔존 결제 내역이 있으면 먼저 "현장 환불 완료"로 정리한 뒤 삭제할 수 있습니다.
            {canDelete
              ? " 삭제 시 카드 정보와 상태 로그까지 영구 제거되며 되돌릴 수 없습니다."
              : " 영구 삭제는 슈퍼관리자만 가능합니다."}
          </p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-5 py-3">주문번호</th>
              <th className="px-5 py-3">이름</th>
              <th className="px-5 py-3">회사</th>
              <th className="px-5 py-3">취소 사유</th>
              <th className="px-5 py-3">취소일</th>
              <th className="px-5 py-3">결제내역</th>
              <th className="px-5 py-3 text-right">관리</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-5 py-10 text-center text-muted-foreground"
                >
                  {orders.length === 0
                    ? "취소된 주문이 없습니다."
                    : "조건에 맞는 주문이 없습니다."}
                </td>
              </tr>
            ) : (
              filtered.map((o) => {
                const pCount = paymentCounts[o.id] ?? 0;
                const hasPayments = pCount > 0;
                return (
                  <tr key={o.id} className="border-t border-border align-top">
                    <td className="px-5 py-3">
                      <Link
                        href={`/admin/orders/${o.id}`}
                        className="font-mono text-primary hover:underline"
                      >
                        {o.id}
                      </Link>
                    </td>
                    <td className="px-5 py-3">{o.name}</td>
                    <td className="px-5 py-3">{o.gradingCompany}</td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {o.cancelReason ?? "-"}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {o.cancelledAt ? formatDate(o.cancelledAt) : "-"}
                    </td>
                    <td className="px-5 py-3 text-xs">
                      {hasPayments ? (
                        <span className="rounded-full bg-warning/10 px-2 py-0.5 font-medium text-warning">
                          잔존 {pCount}건
                        </span>
                      ) : (
                        <span className="text-muted-foreground">없음</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {hasPayments ? (
                        <RefundOrderButton
                          orderId={o.id}
                          canRefund={canRefund}
                        />
                      ) : canDelete ? (
                        <DeleteOrderButton orderId={o.id} canDelete={canDelete} />
                      ) : (
                        <span className="text-[10px] text-muted-foreground">
                          -
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 빌드 검증**

Run: `pnpm build`
Expected: 빌드 성공.

---

## Task 10: 전체 탭 재작성 + 필터바 삭제 + page.tsx 연결

이 세 변경은 서로 결합돼 있어 한 태스크로 처리한다(중간 상태에서는 빌드가 깨짐).

**Files:**
- Modify: `src/app/(admin)/admin/orders/_components/all-orders-tab.tsx` (전체 교체)
- Delete: `src/app/(admin)/admin/orders/_components/all-orders-filter-bar.tsx`
- Modify: `src/app/(admin)/admin/orders/page.tsx` (전체 교체)

- [ ] **Step 1: `all-orders-tab.tsx` 전체 교체**

`src/app/(admin)/admin/orders/_components/all-orders-tab.tsx`:

```tsx
"use client";

// 전체 주문 탭 — 진행 중인 모든 상태의 주문을 한 표에서 조회.
// 검색·등급회사·서비스·상태·정렬은 클라이언트 사이드 공통 툴바로 처리한다.
// 행의 주문번호/관리 링크로 상세 페이지(/admin/orders/[id])에 진입해 관리한다.

import Link from "next/link";
import {
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
} from "@/constants/grading";
import type { Order } from "@/types";
import { useOrderFilters } from "./use-order-filters";
import { OrderFilterToolbar } from "./order-filter-toolbar";

const identity = (o: Order) => o;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatCurrency(amount: number): string {
  return `₩${amount.toLocaleString("ko-KR")}`;
}

export function AllOrdersTab({ orders }: { orders: Order[] }) {
  const { state, setState, filtered } = useOrderFilters(orders, identity);

  return (
    <div className="space-y-4">
      <OrderFilterToolbar state={state} onChange={setState} withStatus />

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border p-5">
          <h2 className="font-semibold">전체 주문</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            진행 중인 모든 상태의 주문입니다. 주문번호 또는 관리 링크로 상세
            페이지에 들어가 상태 변경·취소 등을 처리할 수 있습니다. (표시{" "}
            {filtered.length}건 / 전체 {orders.length}건)
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-5 py-3">주문번호</th>
                <th className="px-5 py-3">고객</th>
                <th className="px-5 py-3">회사 / 서비스</th>
                <th className="px-5 py-3">상태</th>
                <th className="px-5 py-3">결제</th>
                <th className="px-5 py-3 text-right">금액</th>
                <th className="px-5 py-3">신청일</th>
                <th className="px-5 py-3 text-right">관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-5 py-10 text-center text-muted-foreground"
                  >
                    조건에 맞는 주문이 없습니다.
                  </td>
                </tr>
              ) : (
                filtered.map((o) => (
                  <tr
                    key={o.id}
                    className="border-t border-border align-top hover:bg-muted/20"
                  >
                    <td className="px-5 py-3">
                      <Link
                        href={`/admin/orders/${o.id}`}
                        className="font-mono text-primary hover:underline"
                      >
                        {o.id}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <p className="font-medium">{o.name}</p>
                      <p className="text-xs text-muted-foreground">{o.phone}</p>
                    </td>
                    <td className="px-5 py-3">
                      {o.gradingCompany} / {o.serviceLevel}
                    </td>
                    <td className="px-5 py-3">
                      <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                        {ORDER_STATUS_LABELS[o.orderStatus] ?? o.orderStatus}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-muted-foreground">
                      {PAYMENT_STATUS_LABELS[o.paymentStatus] ??
                        o.paymentStatus}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {formatCurrency(
                        o.prepaidAmount + (o.overchargeAmount ?? 0)
                      )}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {formatDate(o.createdAt)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/admin/orders/${o.id}`}
                        className="text-primary hover:underline"
                      >
                        상세 →
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `all-orders-filter-bar.tsx` 삭제**

`src/app/(admin)/admin/orders/_components/all-orders-filter-bar.tsx` 파일을 삭제한다.
(공통 툴바 `order-filter-toolbar.tsx` 로 대체됨. 다른 곳에서 import 하지 않음.)

- [ ] **Step 3: `page.tsx` 전체 교체**

`src/app/(admin)/admin/orders/page.tsx`:

```tsx
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import {
  getAllOrdersForAdmin,
  getCardsForOrdersForAdmin,
  getPaymentCountsForOrders,
} from "@/lib/orders/queries";
import { requireAdmin } from "@/lib/auth/require-admin";
import type { Order } from "@/types";
import { IntakeManagementTab } from "./_components/intake-management-tab";
import { CardInfoEntryTab } from "./_components/card-info-entry-tab";
import { ShipArriveTab } from "./_components/ship-arrive-tab";
import { PickupCompleteTab } from "./_components/pickup-complete-tab";
import { AllOrdersTab } from "./_components/all-orders-tab";
import { CancelledOrdersTab } from "./_components/cancelled-orders-tab";

export const dynamic = "force-dynamic";

type TabView =
  | "intake"
  | "cardinfo"
  | "shipping"
  | "pickup"
  | "all"
  | "cancelled";
type ShipSub = "ship" | "arrive";

export default function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; sub?: string }>;
}) {
  return (
    <Suspense>
      <OrdersContent searchParams={searchParams} />
    </Suspense>
  );
}

async function OrdersContent({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; sub?: string }>;
}) {
  const admin = await requireAdmin();
  if (!admin) redirect("/admin/login");

  const params = await searchParams;
  const view: TabView = (() => {
    switch (params.view) {
      case "cardinfo":
      case "shipping":
      case "pickup":
      case "all":
      case "cancelled":
        return params.view;
      default:
        return "intake";
    }
  })();
  const sub: ShipSub = params.sub === "arrive" ? "arrive" : "ship";
  const canDelete = admin.adminRole === "SUPER_ADMIN";
  const canCancel =
    admin.adminRole === "SUPER_ADMIN" || admin.adminRole === "GENERAL_ADMIN";

  // 카운트는 모든 탭 헤더 뱃지에 사용 — 한 번에 조회.
  const allActive = await getAllOrdersForAdmin({ scope: "active" });
  const cancelledOrders = await getAllOrdersForAdmin({ scope: "cancelled" });

  const intakeOrders = allActive.filter(
    (o) => o.paymentStatus === "PENDING" && o.orderStatus === "PAYMENT_PENDING"
  );
  const cardInfoOrders = allActive.filter(
    (o) =>
      o.paymentStatus === "PAID" && o.orderStatus === "CARD_DELIVERY_PENDING"
  );
  const shipOrders = allActive.filter((o) => o.orderStatus === "CARD_RECEIVED");
  const arriveOrders = allActive.filter(
    (o) => o.orderStatus === "GRADE_CONFIRMED"
  );
  // 수령 완료 탭 — 매장 수령 + 트레이너스 도착 주문.
  const pickupOrders = allActive.filter(
    (o) =>
      o.orderStatus === "TRAINERS_ARRIVED" && o.pickupMethod === "STORE_PICKUP"
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">주문 관리</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          단계별 워크플로우 탭에서 주문을 처리합니다.
        </p>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border">
        <TabLink
          href="/admin/orders?view=intake"
          active={view === "intake"}
          label="접수 관리"
          count={intakeOrders.length}
        />
        <TabLink
          href="/admin/orders?view=cardinfo"
          active={view === "cardinfo"}
          label="카드 정보 작성"
          count={cardInfoOrders.length}
        />
        <TabLink
          href="/admin/orders?view=shipping"
          active={view === "shipping"}
          label="출고/입고"
          count={shipOrders.length + arriveOrders.length}
        />
        <TabLink
          href="/admin/orders?view=pickup"
          active={view === "pickup"}
          label="수령 완료"
          count={pickupOrders.length}
        />
        <TabLink
          href="/admin/orders?view=all"
          active={view === "all"}
          label="전체"
          count={allActive.length}
        />
        <TabLink
          href="/admin/orders?view=cancelled"
          active={view === "cancelled"}
          label="취소됨"
          count={cancelledOrders.length}
          danger
        />
      </div>

      {view === "intake" && <IntakeManagementTab orders={intakeOrders} />}

      {view === "cardinfo" && (
        <CardInfoEntryTabSection orders={cardInfoOrders} />
      )}

      {view === "shipping" && (
        <ShipArriveTab
          mode={sub}
          orders={sub === "ship" ? shipOrders : arriveOrders}
          baseHref="/admin/orders?view=shipping"
        />
      )}

      {view === "pickup" && <PickupCompleteTab orders={pickupOrders} />}

      {view === "all" && <AllOrdersTab orders={allActive} />}

      {view === "cancelled" && (
        <CancelledOrdersTabSection
          orders={cancelledOrders}
          canDelete={canDelete}
          canRefund={canCancel}
        />
      )}
    </div>
  );
}

function TabLink({
  href,
  active,
  label,
  count,
  danger,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
  danger?: boolean;
}) {
  const activeCls = danger
    ? "border-error text-error"
    : "border-primary text-primary";
  return (
    <Link
      href={href}
      className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? activeCls
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}{" "}
      <span className="ml-1 text-xs text-muted-foreground">({count})</span>
    </Link>
  );
}

async function CardInfoEntryTabSection({ orders }: { orders: Order[] }) {
  const cards =
    orders.length > 0
      ? await getCardsForOrdersForAdmin(orders.map((o) => o.id))
      : [];
  return <CardInfoEntryTab orders={orders} cards={cards} />;
}

async function CancelledOrdersTabSection({
  orders,
  canDelete,
  canRefund,
}: {
  orders: Order[];
  canDelete: boolean;
  canRefund: boolean;
}) {
  const countsMap =
    orders.length > 0
      ? await getPaymentCountsForOrders(orders.map((o) => o.id))
      : new Map<string, number>();
  // Map 은 클라이언트 컴포넌트로 직렬화되지 않으므로 Record 로 변환.
  const paymentCounts: Record<string, number> = {};
  for (const [id, count] of countsMap) paymentCounts[id] = count;
  return (
    <CancelledOrdersTab
      orders={orders}
      paymentCounts={paymentCounts}
      canDelete={canDelete}
      canRefund={canRefund}
    />
  );
}
```

- [ ] **Step 4: 빌드 검증**

Run: `pnpm build`
Expected: 빌드 성공. `all-orders-filter-bar.tsx` 참조 잔존 없음, `page.tsx` 의
`AllOrdersTab`/`CancelledOrdersTab` props 가 새 시그니처와 일치.

---

## Task 11: 최종 검증 (빌드 · 린트 · 수동 확인)

**Files:** 없음 (검증 전용)

- [ ] **Step 1: 전체 빌드**

Run: `pnpm build`
Expected: 빌드 성공, 타입 오류 0.

- [ ] **Step 2: 린트**

Run: `pnpm lint`
Expected: 에러 0. (`<img>` 경고는 `card-info-entry-tab.tsx` 의 `eslint-disable-next-line`
주석으로 억제됨.)

- [ ] **Step 3: 수동 확인 (개발 서버 `pnpm dev`)**

Task 1 의 마이그레이션이 Supabase 에 적용된 상태에서 어드민으로 로그인해 `/admin/orders`
접속 후 확인:

- [ ] 6개 탭(접수 관리·카드 정보 작성·출고/입고·수령 완료·전체·취소됨) 각각에 필터 툴바가
      표시된다.
- [ ] 검색창에 주문번호 일부 / 고객 이름 일부를 입력하면 해당 주문만 남는다.
- [ ] 등급회사 셀렉트 선택 시 서비스 셀렉트가 해당 회사 서비스로 좁혀지고, 회사를 바꾸면
      불일치 서비스 선택이 리셋된다.
- [ ] 회사·서비스 필터가 목록에 정확히 반영된다.
- [ ] 정렬을 최신순/오래된순으로 바꾸면 신청일 기준 순서가 바뀐다.
- [ ] `전체` 탭에만 상태 셀렉트가 보이고 동작한다.
- [ ] 접수 관리·출고/입고 탭에서 일부 행 선택 후 필터를 바꾸면, 보이지 않게 된 행의 선택이
      해제된다(일괄 작업이 숨겨진 행에 실행되지 않음).
- [ ] `카드 정보 작성` 탭에서 "이미지 업로드" → JPG/PNG 선택 시 썸네일이 나타난다.
- [ ] 같은 셀에서 "변경" 으로 다른 이미지로 교체, "삭제" 로 제거가 동작한다.
- [ ] 10MB 초과 또는 JPG/PNG 가 아닌 파일 선택 시 에러 메시지가 표시된다.
- [ ] 이미지 업로드 후 해당 주문의 고객 마이페이지 주문상세(`/mypage/orders/[id]`)에서
      카드 "앞면" 사진이 노출된다.
- [ ] 앞면 이미지가 없어도 영문명·세트·번호·연도 4개를 채우면 기존대로 주문이 접수 완료로
      자동 승격된다(이미지는 승격 판정에 영향 없음).

---

## Self-Review (작성자 점검 결과)

**1. Spec coverage**

- 카드 앞면 이미지 업로드 → Task 1(버킷)·Task 2(액션)·Task 6(UI). ✅
- 6개 탭 검색(주문번호+이름) → Task 3 훅 + Task 4 툴바 + Task 5~10 적용. ✅
- 6개 탭 등급회사·서비스 필터 → 동일. ✅
- 정렬 최신/오래된 전환 → Task 3 훅 `sort` + Task 4 툴바. ✅
- `전체` 탭 서버필터 → 클라이언트 전환, `all-orders-filter-bar.tsx` 삭제 → Task 10. ✅
- `취소됨` 탭 클라이언트 분리 + `paymentCounts` Record 변환 → Task 9·Task 10. ✅
- 일괄선택 prune → Task 5·Task 7 의 `useEffect`. ✅

**2. Placeholder scan:** TBD/TODO/"적절히 처리" 등 플레이스홀더 없음. 모든 코드 단계에 완전한
코드 포함. ✅

**3. Type consistency**

- `OrderFilterState`/`SortOrder`/`INITIAL_FILTER_STATE`/`useOrderFilters` — Task 3 정의,
  Task 4~10 에서 동일 이름·시그니처로 사용. ✅
- `OrderFilterToolbar` props(`state`/`onChange`/`withStatus`) — Task 4 정의, 모든 탭에서
  일치. ✅
- `useOrderFilters` 반환 `{ state, setState, filtered }` — 모든 탭에서 동일 구조분해. ✅
- `uploadCardFrontImageAction(formData)`/`removeCardFrontImageAction({ cardId })` — Task 2
  정의, Task 6 에서 동일 시그니처 호출. ✅
- `CancelledOrdersTab` props(`orders`/`paymentCounts: Record`/`canDelete`/`canRefund`) —
  Task 9 정의, Task 10 page.tsx 에서 일치. ✅
- `AllOrdersTab` props(`orders`) — Task 10 에서 정의·소비 일치. ✅
