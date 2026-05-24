# 설계: 신청 폼 동적 가격 연동 + 관리자 역할 권한 안내

- 작성일: 2026-05-22
- 대상: `src/app/(user)/apply/**`, `src/components/apply/step1-card-grading.tsx`,
  `src/lib/orders/queries.ts`, `src/app/(admin)/admin/settings/_components/admin-users-editor.tsx`

## 배경 / 목표

설정탭의 서비스 가격표(`grading-services-editor.tsx`)는 이미 추가·편집·삭제·활성화가
가능하며 `grading_services` DB 테이블을 갱신한다. 주문 생성 서버 액션
(`createOrdersAction`)도 이미 이 DB 테이블에서 단가를 조회해 `service_price_snapshot`
및 `prepaid_amount` 를 계산한다.

그러나 **고객 신청 폼(`/apply`)은 DB 가 아니라 코드에 하드코딩된 `SERVICE_LEVELS`
상수에서 가격을 표시**한다. 따라서 운영자가 설정탭에서 가격을 바꾸면 고객에게는
옛 가격이 보이고 결제는 새 가격으로 청구되는 불일치가 발생한다.

본 작업의 목표:

1. **Part 1** — 고객 신청 폼이 `grading_services` DB 의 활성 서비스/가격을 표시하도록
   전환해, 설정탭 가격 수정이 곧바로 고객 폼에 반영되게 한다.
2. **Part 2** — 설정탭 "새 관리자 추가" 섹션 옆에 관리자 역할별 권한 차이를 정리한
   안내 섹션을 추가한다.

## 확정된 결정 사항 (브레인스토밍 합의)

- 신청 폼은 `grading_services` 의 **활성(`is_active = true`) 서비스만** 표시. 설정탭
  "비활성화"가 곧 신청 폼에서 제외로 이어진다.
- 서버 결제 로직(`createOrdersAction`)은 이미 DB 기반 — **변경하지 않는다.**
- Part 2 안내 섹션은 **2단 그리드**(데스크톱: 좌 추가 폼 / 우 권한 안내, 모바일: 세로 스택).

---

## Part 1 — 신청 폼 동적 가격 연동

### 1.1 신규 쿼리 — `getActiveGradingServices()`

`src/lib/orders/queries.ts` 에 추가. 기존 `getAllGradingServicesForAdmin()` 과 동일한
패턴(service-role 클라이언트, 동일 row→`GradingService` 매퍼)을 사용하되 활성 서비스만
조회한다.

- `grading_services` 에서 `is_active = true` 인 행만 조회.
- 정렬: `company` 오름차순 → `sort_order` 오름차순.
- 실패 시 빈 배열 반환(기존 쿼리들과 동일한 방어 패턴).
- 반환 타입: `GradingService[]`.

### 1.2 `apply/page.tsx` — 서버 컴포넌트로 전환

현재 `apply/page.tsx` 는 `"use client"` 클라이언트 컴포넌트다. 이를 서버 컴포넌트로
바꾼다.

- `export const dynamic = "force-dynamic"` 추가 — 가격 변경이 다음 방문 시 즉시 반영.
- `getActiveGradingServices()` 를 호출해 활성 서비스 목록을 fetch.
- 신규 클라이언트 컴포넌트 `<ApplyForm services={services} />` 를 렌더링.
- 인증은 기존대로 루트 미들웨어가 담당(`/apply` 보호 경로) — 페이지에서 별도 처리 없음.

### 1.3 신규 `apply/_components/apply-form.tsx` (클라이언트 컴포넌트)

현재 `apply/page.tsx` 의 클라이언트 로직 전체를 이 파일로 이동한다.

- 이동 대상: `ApplyPage` 함수(→ `ApplyForm` 으로 이름 변경), `PaymentStep`, `SummaryRow`.
- `ApplyForm` 은 `services: GradingService[]` prop 을 받는다.
- `totalAmount` 계산을 `SERVICE_LEVELS` 대신 `services` 기반으로 변경:
  주문 그룹마다 `services.find((s) => s.company === g.gradingCompany && s.code === g.serviceLevel)`
  로 단가를 찾아 `price * quantity` 합산.
- `<Step1CardGrading>` 에 `services` prop 을 전달.
- 나머지 폼 로직(스텝 이동, 검증, `createOrdersAction` 호출 등)은 그대로 유지.

### 1.4 `step1-card-grading.tsx` — `services` prop 수용

- `Step1Props` 에 `services: GradingService[]` 추가.
- `SERVICE_LEVELS` import 제거.
- 회사 선택 시 서비스 목록: `services.filter((s) => s.company === company)`.
- 선택된 서비스: `companyServices.find((s) => s.code === group.serviceLevel)`.
- 드롭다운/소계 표시에 사용하던 `service.value/label/days` 를 DB 필드
  `code/name/estimatedDays` 로 매핑. 가격은 `price` 그대로.
- 특정 회사에 활성 서비스가 없으면 드롭다운에 안내 문구(예: "등록된 서비스가
  없습니다")만 표시.

### 1.5 `SERVICE_LEVELS` 상수 — 유지

`src/constants/grading.ts` 의 `SERVICE_LEVELS` 는 **삭제하지 않는다.** 어드민 주문관리
필터 툴바(`order-filter-toolbar.tsx`)가 서비스 필터 옵션 소스로 계속 사용한다.
(어드민 필터까지 DB 화하는 것은 본 작업 범위 외.)

### 1.6 서버 로직 — 변경 없음

`createOrdersAction` 은 이미 `grading_services` 에서 `(company, code)` 로 단가를 조회해
`service_price_snapshot`·`prepaid_amount` 를 계산하므로 수정하지 않는다. 신청 폼이
DB 가격을 표시하게 되면 "보이는 가격 = 청구 가격"이 보장된다.

---

## Part 2 — 관리자 역할별 권한 안내 섹션

### 2.1 신규 컴포넌트 — `RolePermissionGuide`

`admin-users-editor.tsx` 안에 정적(상태 없음) 컴포넌트로 추가. 스타일은 기존 섹션과
동일(`rounded-xl border border-border bg-card`).

`admin-actions.ts` 의 권한 매트릭스를 그대로 정리:

| 역할 | 권한 요약 |
|---|---|
| **슈퍼 관리자** | 모든 기능 — 주문 상태 변경·카드 정보 입력·주문 취소·환불, 주문 영구 삭제, 관리자 계정 관리, 서비스 가격표 변경 |
| **일반 관리자** | 주문 상태 변경·카드 정보 입력·주문 취소·환불 처리 가능. 주문 영구 삭제 ✗ / 관리자 계정 관리 ✗ / 가격표 변경 ✗ |
| **매장 공유 계정** | 주문 조회 + 주문 상태 변경만 가능. 카드 정보 입력 ✗ / 주문 취소·환불 ✗ / 삭제 ✗ |

### 2.2 레이아웃 — 2단 그리드

`AdminUsersEditor` 의 `{canManage && <CreateAdminForm />}` 부분을 2단 그리드로 변경:

```
{canManage && (
  <div className="grid gap-4 lg:grid-cols-2">
    <CreateAdminForm />
    <RolePermissionGuide />
  </div>
)}
```

- 데스크톱(`lg` 이상): 좌측 "새 관리자 추가" 폼, 우측 "역할별 권한" 안내가 나란히.
- 모바일: 세로로 스택.
- 안내 섹션은 `canManage`(슈퍼관리자) 일 때만 노출 — "새 관리자 추가" 폼과 짝을 이루는
  요청 취지에 맞춤.

---

## 파일 변경 요약

**신규**

- `src/app/(user)/apply/_components/apply-form.tsx` — 신청 폼 클라이언트 컴포넌트

**수정**

- `src/lib/orders/queries.ts` — `getActiveGradingServices()` 추가
- `src/app/(user)/apply/page.tsx` — 서버 컴포넌트로 전환, 서비스 fetch
- `src/components/apply/step1-card-grading.tsx` — `services` prop 수용, `SERVICE_LEVELS` 제거
- `src/app/(admin)/admin/settings/_components/admin-users-editor.tsx` —
  `RolePermissionGuide` 추가 + 2단 그리드

**삭제 / 변경 없음**

- `SERVICE_LEVELS` (`src/constants/grading.ts`) — 유지 (어드민 필터가 사용)
- `createOrdersAction` (`actions.ts`) — 변경 없음 (이미 DB 기반)

## 검증

- `pnpm build` 타입체크 통과. (`pnpm lint` 는 프로젝트 전역 사전 이슈로 실행 불가 —
  빌드로 갈음.)
- 수동 확인:
  - 설정탭에서 서비스 가격 수정 → 신청 폼 `/apply` 1단계 드롭다운/소계/총액에 즉시 반영.
  - 설정탭에서 서비스 비활성화 → 신청 폼 드롭다운에서 사라짐.
  - 신청 폼에 표시된 총액과 결제 후 생성된 주문의 `prepaid_amount` 일치.
  - 설정탭 "새 관리자 추가" 옆에 권한 안내가 2단으로 표시(모바일은 스택).

## 범위 외 (Non-goals)

- 어드민 주문관리 필터 툴바의 서비스 옵션을 DB 화하는 것.
- 서버 결제/검증 로직 변경.
- 권한 안내 섹션을 일반 관리자·매장 계정에게도 노출하는 것.
