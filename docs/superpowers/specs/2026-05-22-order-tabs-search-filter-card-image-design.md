# 설계: 주문 관리 탭 검색·필터·정렬 + 카드 앞면 이미지 업로드

- 작성일: 2026-05-22
- 대상: `src/app/(admin)/admin/orders/**`, `src/lib/orders/admin-actions.ts`, `supabase/migrations/`

## 배경 / 목표

어드민 주문 관리 페이지는 6개 탭(접수 관리·카드 정보 작성·출고/입고·수령 완료·전체·취소됨)의
워크플로우 구조다. 현재 `전체` 탭만 검색·등급회사 필터를 갖고 있고(서버사이드, URL 파라미터),
나머지 탭에는 검색/필터/정렬 수단이 없다. 또한 `카드 정보 작성` 탭은 텍스트 필드만 편집 가능하고
카드 이미지를 첨부할 방법이 없다.

본 작업의 목표:

1. `카드 정보 작성` 탭에서 카드 **앞면 이미지**를 업로드할 수 있게 한다.
2. 6개 탭 전체에서 **주문번호·고객 이름**으로 주문을 검색할 수 있게 한다.
3. 6개 탭 전체에서 **등급회사·서비스**로 주문을 필터링할 수 있게 한다.
4. 6개 탭 전체에서 **정렬 순서(최신순/오래된순)**를 전환할 수 있게 한다.

## 확정된 결정 사항 (브레인스토밍 합의)

- 이미지 업로드는 **앞면만** (`cards.front_image_url`). 뒷면은 범위 외.
- 앞면 이미지는 **선택 항목** — 카드 "입력 완료" 자동 승격 판정(영문명·세트·번호·연도 4개)에 미포함.
- 검색·필터·정렬은 **6개 탭 전체 통일** 적용. `전체` 탭의 기존 서버사이드 필터는 새 방식으로 교체.
- 검색 대상은 **주문번호 + 고객 이름**만. 연락처(phone)는 제외.

---

## Part 1 — 카드 앞면 이미지 업로드

### 1.1 저장소 (Supabase Storage)

신규 마이그레이션 `supabase/migrations/016_card_images_bucket.sql`:

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('card-images', 'card-images', true, 10485760,
        array['image/jpeg', 'image/png'])
on conflict (id) do nothing;
```

- **공개 버킷** — 고객 주문상세 페이지(`order-detail-client.tsx`)가 `card.frontImageUrl` 을 일반 URL
  로 직접 렌더링하므로 공개 버킷이 적합(서명 URL 불필요).
- 업로드는 서버 액션의 service-role 클라이언트로만 수행 → RLS 우회. 추가 storage 정책 불필요
  (공개 버킷은 읽기 자동 허용).
- `cards.front_image_url` 컬럼은 이미 존재하며 nullable(마이그 005). **cards 스키마 변경 없음.**

### 1.2 서버 액션 (`src/lib/orders/admin-actions.ts` 에 추가)

기존 `updateCardDetailsAction` 과 동일한 가드 패턴(`requireAdmin()` + `canInputData()`).

**`uploadCardFrontImageAction(formData: FormData)`**

- 입력: `formData` 에 `cardId`(string), `file`(File).
- 검증:
  - `cardId`, `file` 존재 여부.
  - MIME 타입이 `PHOTO_UPLOAD.acceptedFormats`(`image/jpeg`, `image/png`) 에 속하는지.
  - 크기 ≤ `PHOTO_UPLOAD.maxSizeBytes`(10MB).
- 처리:
  1. 대상 카드 조회 → 기존 `front_image_url` 확보(교체 시 정리용).
  2. 경로 `card-images/{cardId}/front-{Date.now()}.{ext}` 로 업로드
     (`ext`: MIME 기준 `jpg`/`png`).
  3. `getPublicUrl()` 로 public URL 획득.
  4. `cards.front_image_url` 업데이트.
  5. 기존 이미지 파일 best-effort 삭제(실패해도 무시, 경고 로그).
  6. `revalidatePath("/admin/orders")` + `revalidatePath("/admin/orders/{orderId}")`.
- 반환: `{ ok: true; url: string } | { ok: false; error: string }`.
- 자동 승격 평가는 **하지 않음**(이미지는 완료 판정 대상 아님).

**`removeCardFrontImageAction({ cardId })`**

- 가드 동일. `cards.front_image_url` 을 `null` 로, 스토리지 객체 best-effort 삭제, revalidate.
- 반환: `AdminActionResult`(`{ ok: true } | { ok: false; error }`).

### 1.3 UI (`card-info-entry-tab.tsx` 의 `CardRow`)

- 테이블에 **"앞면"** 열 1개 추가 — `신고가액` 열과 `관리` 열 사이. 빈 상태 메시지의
  `colSpan` 은 9 → 10 으로 조정.
- 셀 내용:
  - 이미지 없음: 숨겨진 `<input type="file" accept={PHOTO_UPLOAD.acceptedExtensions}>` +
    "이미지 업로드" 버튼.
  - 이미지 있음: 썸네일(약 40×56px, 클릭 시 원본 새 탭) + 하단 "변경"/"삭제" 소형 링크.
- 동작:
  - 파일 선택 즉시 `FormData` 구성 → `uploadCardFrontImageAction` 호출. 자체
    `useTransition` 으로 "업로드 중…" 표시. 텍스트 "저장" 버튼과 **독립**.
  - 업로드/삭제 성공 시 `router.refresh()`.
  - 클라이언트단 사전 검증(MIME·크기) 후 서버 호출 — 잘못된 파일은 즉시 에러 표시.
- 어드민 주문 상세 페이지의 `CardEditor` 는 **범위 외**(요청은 `카드 정보 작성` 탭 한정).

---

## Part 2 — 6개 탭 검색·필터·정렬 (클라이언트 사이드 공통 툴바)

### 2.1 아키텍처 선택

| 방식 | 장점 | 단점 |
|---|---|---|
| **A. 클라이언트 사이드 공통 툴바 (채택)** | 즉시 반응, 페이지 이동 없음, 6탭 일관, page.tsx 단순화 | URL 공유 불가, 새로고침 시 필터 초기화 |
| B. 서버사이드 URL 파라미터 (기존 `전체` 탭 방식 확장) | URL 공유·새로고침 보존 | 필터마다 페이지 내비게이션, page.tsx 복잡, 6탭×4파라미터 |

6개 탭 모두 이미 전체 `orders` 배열을 prop 으로 받는 클라이언트 컴포넌트이고 어드민 주문량이
적으므로 **A** 채택. 기존 `all-orders-filter-bar.tsx` 및 `page.tsx` 서버 필터 블록은 제거.

### 2.2 신규 파일

**`src/app/(admin)/admin/orders/_components/use-order-filters.ts`**

```ts
export type SortOrder = "newest" | "oldest";

export interface OrderFilterState {
  query: string;    // 주문번호·이름 검색어
  company: string;  // "" = 전체 회사
  service: string;  // "" = 전체 서비스 (serviceLevel 코드)
  status: string;   // "" = 전체 상태 (withStatus 옵션 시에만 사용)
  sort: SortOrder;  // 기본 "newest"
}

export const INITIAL_FILTER_STATE: OrderFilterState;

// 제네릭 — 주문 단위 탭은 getOrder = identity, 카드 단위 탭은 c => c.order
export function useOrderFilters<T>(
  items: T[],
  getOrder: (item: T) => Order,
): {
  state: OrderFilterState;
  setState: React.Dispatch<React.SetStateAction<OrderFilterState>>;
  filtered: T[];   // 필터 + 정렬 적용 결과
};
```

필터링 규칙:

- **검색**: `getOrder(item).id` 또는 `.name` 에 `query`(trim, 소문자) 부분 일치. 빈 검색어는 통과.
- **회사**: `company` 가 비어있지 않으면 `getOrder(item).gradingCompany === company`.
- **서비스**: `service` 가 비어있지 않으면 `getOrder(item).serviceLevel === service`.
- **상태**: `status` 가 비어있지 않으면 `getOrder(item).orderStatus === status`.
- **정렬**: `getOrder(item).createdAt` 기준 — `newest` 내림차순(기본) / `oldest` 오름차순.

**`src/app/(admin)/admin/orders/_components/order-filter-toolbar.tsx`**

```ts
export function OrderFilterToolbar(props: {
  state: OrderFilterState;
  onChange: React.Dispatch<React.SetStateAction<OrderFilterState>>;
  withStatus?: boolean;  // true 면 상태 셀렉트 노출 (전체 탭 전용)
}): JSX.Element;
```

- 구성: 검색 입력 + 등급회사 셀렉트 + 서비스 셀렉트 + (옵션)상태 셀렉트 + 정렬 셀렉트 + 초기화.
- 회사 셀렉트: `전체 회사` + `GRADING_COMPANIES` 4개.
- 서비스 셀렉트: `company` 선택 시 `SERVICE_LEVELS[company]` 로 좁혀짐. 미선택 시 4개 회사 전체
  서비스 합집합(라벨 `회사 · 서비스명`). **회사 변경 시 현재 `service` 가 새 회사에 없으면 리셋.**
- 상태 셀렉트: `전체 탭` 전용(`withStatus`). 옵션은 기존 `all-orders-filter-bar.tsx` 의
  `STATUS_OPTIONS` 8종 이전.
- 정렬 셀렉트: `최신순` / `오래된순`.
- 초기화: `INITIAL_FILTER_STATE` 로 복귀(검색어/회사/서비스/상태 비우고 정렬 `newest`).
- 스타일: 기존 `all-orders-filter-bar.tsx` 의 `flex flex-wrap ... rounded-xl border` 패턴 재사용.

### 2.3 탭별 적용

각 탭은 `useOrderFilters` 로 `filtered` 를 얻고 `<OrderFilterToolbar>` 를 표 위에 렌더링한다.

| 탭 / 파일 | 단위 | getOrder | 비고 |
|---|---|---|---|
| 접수 관리 `intake-management-tab.tsx` | 주문 | `o => o` | 일괄선택 `allIds` 를 `filtered` 기준으로 변경 |
| 카드 정보 작성 `card-info-entry-tab.tsx` | 카드 | `c => c.order` | "미입력 N장 / 전체 M장" 카운터는 `filtered` 기준 |
| 출고/입고 `ship-arrive-tab.tsx` | 주문 | `o => o` | `filtered` 후 회사::서비스 그룹핑, "전체 선택 (N건)" = 필터 수 |
| 수령 완료 `pickup-complete-tab.tsx` | 주문 | `o => o` | 단순 표 |
| 전체 `all-orders-tab.tsx` | 주문 | `o => o` | `withStatus` 적용, 아래 2.4 참조 |
| 취소됨 `cancelled-orders-tab.tsx` (신규) | 주문 | `o => o` | 아래 2.5 참조 |

**일괄선택 안전장치(접수 관리·출고/입고):** 필터 변경으로 `filtered` 가 바뀌면 `useEffect` 로
`selected` 를 `filtered` 의 id 집합으로 prune. → 숨겨진 행에 일괄 작업이 실행되는 사고 방지.
"전체 선택"은 항상 `filtered` 기준.

### 2.4 `전체` 탭 재작성

- `AllOrdersTab` 는 사전 필터된 주문이 아니라 **`allActive` 전체**를 prop 으로 받는다.
- 내부에서 `useOrderFilters` + `<OrderFilterToolbar withStatus />` 사용.
- 기존 `props`(`statusFilter`/`companyFilter`/`searchQuery`) 제거.
- `all-orders-filter-bar.tsx` **삭제**.

### 2.5 `취소됨` 탭 분리

- 현재 `page.tsx` 내부의 `async function CancelledOrdersTable` 을 신규 클라이언트 컴포넌트
  `cancelled-orders-tab.tsx` 로 분리.
- `paymentCounts` 는 `Map` → 클라이언트 경계 직렬화를 위해 `Record<string, number>` 로 변환해
  전달. `page.tsx` 에 `paymentCounts` 를 조회하는 async 래퍼는 유지.
- `canDelete`/`canRefund` prop 은 그대로 전달.

### 2.6 `page.tsx` 변경

- `searchParams` 에서 `status`/`company`/`q` 처리 및 `allOrdersFiltered` 블록 제거
  (`view`/`sub` 만 유지).
- `AllOrdersTab` 에 `allActive` 직접 전달.
- `CancelledOrdersTable` → `CancelledOrdersTab`(클라) + `paymentCounts` 조회 래퍼.
- 탭 헤더 뱃지 카운트는 **전체 건수 유지**(탭 내 필터와 무관 — 작업량 총량 표시).

---

## 파일 변경 요약

**신규**

- `supabase/migrations/016_card_images_bucket.sql`
- `src/app/(admin)/admin/orders/_components/use-order-filters.ts`
- `src/app/(admin)/admin/orders/_components/order-filter-toolbar.tsx`
- `src/app/(admin)/admin/orders/_components/cancelled-orders-tab.tsx`

**수정**

- `src/lib/orders/admin-actions.ts` — `uploadCardFrontImageAction`, `removeCardFrontImageAction` 추가
- `src/app/(admin)/admin/orders/_components/card-info-entry-tab.tsx` — 앞면 이미지 열 + 검색/필터/정렬
- `src/app/(admin)/admin/orders/_components/intake-management-tab.tsx` — 검색/필터/정렬
- `src/app/(admin)/admin/orders/_components/ship-arrive-tab.tsx` — 검색/필터/정렬
- `src/app/(admin)/admin/orders/_components/pickup-complete-tab.tsx` — 검색/필터/정렬
- `src/app/(admin)/admin/orders/_components/all-orders-tab.tsx` — 공통 툴바로 재작성
- `src/app/(admin)/admin/orders/page.tsx` — 서버 필터 제거, 취소됨 탭 분리

**삭제**

- `src/app/(admin)/admin/orders/_components/all-orders-filter-bar.tsx`

## 검증

- `pnpm build` 타입체크 통과(특히 `Map` → `Record` 직렬화 경계, 제네릭 훅 추론).
- `pnpm lint` 통과.
- 수동 확인: 6개 탭 각각에서 검색·회사/서비스 필터·정렬 동작, 일괄선택 prune 동작,
  `카드 정보 작성` 탭에서 이미지 업로드/변경/삭제 후 고객 주문상세에 앞면 사진 노출.
- Supabase: `card-images` 버킷이 마이그레이션 적용 후 생성되었는지 확인.

## 범위 외 (Non-goals)

- 뒷면 이미지 업로드.
- 어드민 주문 상세 페이지 `CardEditor` 의 이미지 업로드.
- URL 공유 가능한 필터 상태(클라이언트 사이드 전환으로 의도적 제외).
- 페이지네이션.
