# 설계: 홈 프로세스 라벨 · 헤더 이름 표시 · 마이페이지 재구성

- 작성일: 2026-05-22
- 대상: `src/app/(user)/page.tsx`, `src/components/user/user-header.tsx`,
  `src/app/(user)/mypage/**`, `src/lib/auth/actions.ts`

## 배경 / 목표

1. 홈 메인 페이지의 "대행 프로세스" 7단계 중 3·6단계 명칭이 어드민 주문관리의
   "출고/입고" 용어와 불일치한다.
2. 헤더 로그인 영역이 이메일을 노출 — 이름 표시가 더 적절하다.
3. `/mypage` 가 주문 목록을 보여주지만, 실제 "내정보(계정 정보 수정)" 페이지는 없다
   (`/mypage/profile` 에 목업만 존재 — 하드코딩 데이터, 저장 기능 없음).

## 확정된 결정 사항 (브레인스토밍 합의)

- 홈 프로세스 3단계 → "출고", 6단계 → "입고" + 설명 수정.
- 헤더는 `profiles.name` 표시, 없으면 이메일 폴백.
- 라우팅: `/mypage` = 내정보, `/mypage/orders` = 신청내역, `/mypage/orders/[id]` = 주문 상세.
  목업 `/mypage/profile` 삭제.
- 내정보 페이지: 진입 시 **비밀번호 재인증 게이트** 필수, 통과 후에야 데이터 노출.
  회원가입 입력 정보(이메일·이름·연락처) 표시·수정 + 비밀번호 변경 기능 포함.
- 목업에 있던 **푸시 알림 토글(PushToggle)** 은 기능 유실 방지를 위해 내정보 페이지
  (잠금 해제 후)에 포함한다.

---

## Part 1 — 홈 대행 프로세스 단계 라벨 수정

`src/app/(user)/page.tsx` 의 7단계 배열에서 두 항목만 수정:

| 단계 | 기존 title / desc | 신규 title / desc |
|---|---|---|
| 03 | 총판 발송 / "월말 일괄 국내 총판업체로 발송" | **출고** / "월말 일괄로 국내 총판에 출고" |
| 06 | 총판 수령 / "그레이딩 업체 → 총판으로 카드 반송" | **입고** / "그레이딩 완료 후 총판으로 입고" |

나머지 5개 단계, FAQ, 그 외 문구는 변경하지 않는다.

---

## Part 2 — 헤더에 이름 표시

`src/components/user/user-header.tsx` (서버 컴포넌트):

- 현재: `supabase.auth.getUser()` → `user.email` 을 표시.
- 변경: 로그인 사용자의 `profiles` 행에서 `name` 을 조회해 표시.
  - `supabase.from("profiles").select("name").eq("id", user.id).maybeSingle()`.
  - 표시 우선순위: `profile.name` → (없으면) `user.email` → (없으면) 미표시.
- 이름 텍스트는 `/mypage`(내정보)로 가는 링크로 만든다 (Part 3 헤더 네비 참조).

---

## Part 3 — 마이페이지 재구성

### 3.1 라우팅 구조

| 경로 | 내용 | 비고 |
|---|---|---|
| `/mypage` | **내정보** (재인증 게이트 + 정보 수정) | 신규 — 서버 컴포넌트가 게이트 클라이언트 렌더 |
| `/mypage/orders` | **신청내역** (주문 목록) | 신규 페이지 — 기존 `/mypage` 목록 이동 |
| `/mypage/orders/[id]` | 주문 상세 | 변경 없음 |
| `/mypage/profile` | — | **삭제** (목업 제거) |

미들웨어는 `/mypage` 프리픽스를 보호하므로 `/mypage/orders` 도 자동 보호된다 (변경 없음).

### 3.2 신청내역 페이지 (`/mypage/orders`)

- 신규 `src/app/(user)/mypage/orders/page.tsx` — 서버 컴포넌트. `getMyOrders()` 호출 후
  `<MyOrdersList orders={orders} />` 렌더. `export const dynamic = "force-dynamic"`.
- `my-orders-list.tsx` 를 `mypage/_components/` 에서 `mypage/orders/_components/` 로 이동.
  컴포넌트 내부 제목 `"마이페이지"` → `"신청 내역"` 으로 변경. 그 외 로직 변경 없음.
- 기존 `src/app/(user)/mypage/page.tsx` 는 3.3 의 내정보 페이지로 교체.

### 3.3 내정보 페이지 (`/mypage`)

**서버 컴포넌트** `src/app/(user)/mypage/page.tsx` — 프로필 데이터를 fetch하지 않고
`<MyInfoGate />` 만 렌더한다 (민감 정보를 재인증 전 클라이언트로 보내지 않기 위함).

**재인증 게이트** `mypage/_components/my-info-gate.tsx` (클라이언트):
- 진입 시 현재 비밀번호 입력 폼만 표시.
- 제출 → `unlockMyProfileAction({ password })` 호출.
  - 성공: 반환된 프로필(`email`·`name`·`phone`)을 state 에 저장, `<MyInfoPanel>` 렌더.
  - 실패: 오류 메시지 표시.
- 잠금 상태는 클라이언트 state — 새로고침 시 다시 잠김 (보안 게이트로서 의도된 동작).

**내정보 패널** `mypage/_components/my-info-panel.tsx` (클라이언트) — `profile` prop 수용:
1. **이메일** — 읽기 전용 표시.
2. **이름 · 연락처** — 수정 폼. 연락처는 기존 목업의 자동 하이픈 포맷 로직 재사용.
   "저장" → `updateMyProfileAction({ name, phone })`.
3. **비밀번호 변경** — 현재/새/확인 입력. "변경" → `changeMyPasswordAction(...)`.
   새 비밀번호 8자 이상, 확인 일치 검증.
4. **푸시 알림** — 기존 `PushToggle` 컴포넌트 그대로 배치.

### 3.4 신규 서버 액션 (`src/lib/auth/actions.ts`)

기존 admin `changeMyAdminPasswordAction` 의 probe-client 비밀번호 검증 패턴을 재사용한다
(별도 익명 클라이언트로 `signInWithPassword` 호출 → 현재 세션 미影響).

- **`unlockMyProfileAction({ password })`**
  - 현재 로그인 사용자 확인(`auth.getUser()`), `email` 확보.
  - probe-client 로 `signInWithPassword(email, password)` 검증.
  - 성공 시 `profiles` 에서 `name`·`phone` 조회.
  - 반환: `{ ok: true; profile: { email; name; phone } }` 또는 `{ ok: false; error }`.
- **`updateMyProfileAction({ name, phone })`**
  - `auth.getUser()` 로 사용자 확인. `name`·`phone` 공백 불가 검증(둘 다 NOT NULL 컬럼).
  - service-role 클라이언트로 `profiles` 의 본인 행(`id = user.id`)만 `name`·`phone` 갱신.
  - 반환: `{ ok: true } | { ok: false; error }`.
- **`changeMyPasswordAction({ currentPassword, newPassword })`**
  - `auth.getUser()` 로 `email` 확보. probe-client 로 현재 비밀번호 검증.
  - 새 비밀번호 8자 이상, 현재와 동일 불가 검증.
  - 서버 클라이언트의 `auth.updateUser({ password: newPassword })` 로 본인 비번 변경.
  - 반환: `{ ok: true } | { ok: false; error }`.

### 3.5 헤더 네비게이션 (`user-header.tsx`)

로그인 상태일 때:
- `"신청내역"` 링크 → `/mypage/orders`.
- 사용자 **이름** → `/mypage`(내정보) 링크.
- `로그아웃` 버튼 (기존 유지).

기존 `"마이페이지"` 링크는 제거(위 두 링크로 대체).

### 3.6 `/mypage` 참조 경로 수정

`/mypage` 를 "주문 목록"의 의미로 가리키던 링크/리다이렉트를 `/mypage/orders` 로 수정:
- `apply-form.tsx` 의 신청 완료 리다이렉트 `/mypage?paid=...` → `/mypage/orders?paid=...`.
- 주문 상세·오버차지·배송 클라이언트 컴포넌트의 "목록으로" 류 뒤로가기 링크.
- 구현 계획 단계에서 `/mypage` 전체 참조를 grep 으로 수집해 빠짐없이 반영한다.

---

## 파일 변경 요약

**신규**

- `src/app/(user)/mypage/orders/page.tsx` — 신청내역 서버 페이지
- `src/app/(user)/mypage/orders/_components/my-orders-list.tsx` — 이동 + 제목 변경
- `src/app/(user)/mypage/_components/my-info-gate.tsx` — 재인증 게이트
- `src/app/(user)/mypage/_components/my-info-panel.tsx` — 내정보 수정 패널

**수정**

- `src/app/(user)/page.tsx` — 프로세스 3·6단계 라벨/설명
- `src/components/user/user-header.tsx` — 이름 표시 + 네비 재구성
- `src/app/(user)/mypage/page.tsx` — 내정보 서버 페이지로 교체
- `src/lib/auth/actions.ts` — 서버 액션 3종 추가
- `apply-form.tsx` 등 `/mypage` → `/mypage/orders` 참조 경로

**삭제**

- `src/app/(user)/mypage/page.tsx` 의 기존 주문목록 렌더링 (내정보로 대체)
- `src/app/(user)/mypage/_components/my-orders-list.tsx` (orders/ 하위로 이동)
- `src/app/(user)/mypage/profile/page.tsx` — 목업 프로필 페이지

## 검증

- `pnpm build` 타입체크 통과. (`pnpm lint` 는 프로젝트 전역 사전 이슈로 실행 불가 — 빌드로 갈음.)
- 수동 확인:
  - 홈 프로세스 3·6단계가 "출고"/"입고"로 표시.
  - 로그인 헤더에 이름 표시, 클릭 시 `/mypage`(내정보) 이동.
  - `/mypage` 진입 시 비밀번호 게이트 → 통과 후 이메일·이름·연락처·비번변경·푸시 노출.
  - 이름·연락처 수정 저장 후 재진입 시 반영. 비밀번호 변경 후 새 비번으로 로그인 가능.
  - `/mypage/orders` 가 신청내역(제목 "신청 내역")으로 표시, 주문 상세 진입 정상.
  - 신청 완료 후 `/mypage/orders` 로 이동.

## 범위 외 (Non-goals)

- 회원 탈퇴 기능 (목업에 있었으나 미구현 — 별도 작업).
- 마케팅 수신 동의(`marketing_enabled`) 토글.
- 이메일 변경.
- FAQ·기타 홈 문구 수정.
