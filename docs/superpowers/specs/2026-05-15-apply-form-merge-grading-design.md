# 그레이딩 신청 폼 — 단계 통합 + 그레이딩사 혼합 신청 (설계)

**작성일:** 2026-05-15
**상태:** 승인됨 (브레인스토밍 합의)
**범위 태그:** `apply-form-merge-grading`

## 배경 / 목적

현재 `/apply` 신청 폼은 3단계다:
1. 그레이딩 옵션 — 그레이딩사 1개 + 서비스 등급 1개를 **주문(order) 단위**로 선택
2. 카드 정보 — 카드 N장 입력
3. 수령 방식

데이터 구조상 한 신청서 = 한 주문 = 한 그레이딩사 + 한 서비스 등급이라, 사용자가
서로 다른 그레이딩사로 보낼 카드를 한 번에 신청할 수 없다.

**목표:** 그레이딩사 선택 단계와 카드 정보 입력 단계를 하나로 합치고, 카드마다
다른 그레이딩사·서비스 등급을 지정해도 한 번의 제출로 신청이 완료되게 한다.

## 결정 사항 (브레인스토밍 합의)

| # | 질문 | 결정 |
|---|------|------|
| 1 | 혼합 그레이딩사 데이터 저장 방식 | **그레이딩사별 주문 자동 분리** — DB 스키마 불변. 제출 시 `(그레이딩사, 서비스등급)`이 같은 카드끼리 묶어 주문을 자동 생성. 폼 1회 제출 → 주문 N건. |
| 2 | 카드별 그레이딩사·등급 지정 UI | **카드마다 인라인 선택** — 각 카드 블록 상단에 그레이딩사 버튼 + 서비스 등급 드롭다운. |
| 3 | 제출 후 이동 | **완료 페이지에 주문 목록 표시** — `/apply/complete`가 여러 주문 ID를 받아 그레이딩사별 주문번호를 나열. |

## 설계

### 1. 흐름

3단계 → **2단계**:
1. 카드 정보 + 그레이딩 옵션 (통합)
2. 수령 방식

DB 스키마 변경 없음. `orders.grading_company` / `service_level` / `service_price_snapshot`는
주문 단위 컬럼으로 그대로 유지된다.

### 2. 폼 상태 — `src/types/apply-form.ts`

- `CardFormData`에 필드 추가:
  - `gradingCompany: GradingCompany | ""`
  - `serviceLevel: string`
- `ApplyFormData`에서 최상위 `gradingCompany`, `serviceLevel` 제거
- `INITIAL_CARD`에 두 필드 빈 값(`""`)으로 추가
- 더 이상 수집하지 않는 동의 필드(`agreePrivacy`/`agreeTerms`/`agreeNotice`)는
  이미 vestigial 상태 — 본 작업에서 정리 가능하면 정리하되 핵심 범위는 아님.

### 3. 통합 스텝 컴포넌트

- **신규 `src/components/apply/step1-card-grading.tsx`** — 기존
  `step2-grading-option.tsx` + `step3-card-info.tsx`를 대체하고 두 파일은 삭제.
  - 각 카드 블록 상단: 그레이딩사 버튼 4개(PSA/BGS/CGC/BRG) + 서비스 등급 드롭다운
    (선택된 그레이딩사의 등급만 표시)
  - 그 아래: 기존 카드 별명*, 앞면 사진*, 세부 정보 토글(영문명/세트/카드번호/연도/신고가액/뒷면사진)
  - 그레이딩사 변경 시 해당 카드의 `serviceLevel` 리셋
  - `+ 카드 추가` / 카드별 삭제 동작 유지
- `step2-grading-option.tsx`에 있던 `SERVICE_LEVELS` 맵을 `src/constants/grading.ts`로
  이동해 컴포넌트와 공유. `grading_services` 테이블 동적 로드는 범위 밖(기존 TODO 유지).
- `step4-pickup-method.tsx` → `step2-pickup-method.tsx`로 이름 정리(스텝 번호 혼란 제거).

### 4. 신청 페이지 — `src/app/(user)/apply/page.tsx`

- `TOTAL_STEPS = 2`
- 스텝 렌더링: 1 → `Step1CardGrading`, 2 → `Step2PickupMethod`
- `validateStep`:
  - 1단계: 각 카드에 대해 그레이딩사·서비스 등급·카드 별명·앞면 사진 필수.
    오류 메시지는 기존 패턴 유지 — `카드 #N: 그레이딩사를 선택해 주세요.` 등
  - 2단계: `pickupMethod === "DELIVERY"`면 배송 주소 필수
- `handleSubmit`: 신규 `createOrdersAction` 호출 → 성공 시
  `router.push(\`/apply/complete?orderIds=\${result.orderIds.join(",")}\`)`

### 5. 서버 액션 — `src/lib/orders/actions.ts`

- `createOrderAction` → **`createOrdersAction`**로 교체:
  - 입력: 카드 배열(각 카드가 `gradingCompany`, `serviceLevel` 보유) + 공통
    `pickupMethod`, `deliveryAddress`, `spoilerPreference`, `customerMemo`
  - 카드를 `(gradingCompany, serviceLevel)` 조합으로 그룹핑
  - 그룹마다: `grading_services`에서 단가 스냅샷 조회 → `generate_order_id()` RPC →
    `orders` + 해당 그룹 `cards` insert. `prepaid_amount = 그룹 단가 × 그룹 카드 수`
  - 반환: `{ ok: true, orderIds: string[] }`
  - 인증·profiles 보강·service-role 사용은 기존 로직 유지
- **부분 실패 시 전체 롤백**: 그룹 K 생성 실패 시 이번 제출로 생성된 주문(및 카드)을
  모두 delete 후 오류 반환. all-or-nothing.
- 모든 카드가 동일 `(그레이딩사, 등급)`이면 그룹 1개 → 주문 1건 (기존 동작과 호환).

### 6. 완료 페이지 — `src/app/(user)/apply/complete/page.tsx`

- 쿼리 파라미터를 `orderId`(단수) → `orderIds`(콤마 구분 복수)로 변경
- "신청서가 접수되었습니다" 확인 + 생성된 주문을 그레이딩사별 주문번호로 나열
- 주문이 1건일 때도 자연스럽게 렌더되도록 처리

### 7. StepIndicator — `src/components/apply/step-indicator.tsx`

- `STEPS`를 2개로: `[{1, "카드 · 그레이딩 옵션"}, {2, "수령 방식"}]`
- `grid-cols-3` → `grid-cols-2`

## 오류 처리

- **폼 검증:** 카드별 그레이딩사/서비스 등급 미선택을 오류 리스트에 표면화
  (기존 `errors: string[]` 패턴 재사용)
- **액션:** 그룹별 `grading_services` 조회 실패 → 사용자 친화 오류 메시지.
  DB insert 부분 실패 → 전체 롤백 후 오류 반환
- **가격:** 각 주문의 `prepaid_amount`는 해당 그룹의 단가 × 그룹 카드 수로 계산

## 테스트 / 검증

프로젝트에 테스트 러너 없음. 다음으로 검증한다:
- `pnpm tsc --noEmit` — 0 errors
- `pnpm build` — 성공
- 수동:
  - 서로 다른 그레이딩사 카드 혼합 제출 → 마이페이지에 주문 N건 생성 확인
  - 모든 카드 동일 그레이딩사 제출 → 주문 1건 (기존 동작 회귀 없음)
  - 완료 페이지가 생성된 주문번호를 모두 표시
  - 그레이딩사/등급 미선택 시 카드별 검증 오류 표시

## 범위 밖 (YAGNI)

- `grading_services` 테이블에서 서비스 등급 동적 로드 (기존 하드코딩 맵 유지)
- 카드별로 다른 수령 방식 (수령 방식은 신청서 단위 유지)
- DB 스키마 변경
- 결제 플로우 (별도 작업)

## 비고

- 이 저장소는 아직 git 저장소가 아니므로 본 설계 문서의 git 커밋은 생략한다.
