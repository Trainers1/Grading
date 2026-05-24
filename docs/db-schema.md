# trainers-grading DB 스키마 상세 문서

> **단일 진실의 출처(SoT)**: `supabase/migrations/002_redesign.sql`
> 본 문서는 운영자/개발자가 빠르게 참조할 수 있도록 SQL을 풀어 설명한 것입니다. SQL과 본 문서가 어긋나면 SQL이 우선합니다.
>
> **대상 PostgreSQL**: 15+ (Supabase 표준)
> **마이그레이션 버전**: `002_redesign` (001을 전면 재설계)

---

## 목차

1. [개요](#1-개요)
2. [테이블 일람 & ERD](#2-테이블-일람--erd)
3. [테이블 상세 정의](#3-테이블-상세-정의)
4. [Enum 카탈로그](#4-enum-카탈로그)
5. [인덱스 전략](#5-인덱스-전략)
6. [함수 / 트리거](#6-함수--트리거)
7. [RLS 정책](#7-rls-정책)
8. [명명 규약 & TypeScript 매핑](#8-명명-규약--typescript-매핑)
9. [운영 노트](#9-운영-노트)
10. [자주 쓰는 쿼리](#10-자주-쓰는-쿼리)
11. [마이그레이션 적용 가이드](#11-마이그레이션-적용-가이드)
12. [알려진 격차 & 다음 단계](#12-알려진-격차--다음-단계)

---

## 1. 개요

트레이너스(TRAINERS)는 카드 그레이딩 대행 서비스입니다. 사용자가 카드를 신청하면 매장 또는 택배로 수령 → 월별 배치 묶음으로 그레이딩 회사(PSA/BGS/CGC/BRG)에 발송 → 등급 확정 → 사용자에게 반환하는 워크플로우를 추적합니다.

본 스키마는 다음 도메인 영역을 커버합니다.

| 영역 | 테이블 |
|---|---|
| **사용자** | `profiles`, `admin_users` |
| **카탈로그** | `grading_services` |
| **주문** | `orders`, `cards`, `order_receipt_photos`, `order_status_logs` |
| **결제** | `payments` |
| **배치 발송** | `batches`, `batch_orders` |
| **운영 보조** | `consent_logs` |

총 **11개 테이블**, **5개 함수**, **10개 트리거**, **26개 RLS 정책**.

> **본 redesign에서 의도적으로 제외된 항목**:
> - **알림 발송 이력 테이블 (`notifications`)** — 카카오 알림톡/SMS/Email 발송 추적은 별도 마이그레이션으로 분리. `profiles.notification_enabled`(사용자 수신 토글)는 유지.
> - **그레이딩 진행 중 세부 추적** — 총판(카드하비) 발송 후 등급 확정 전까지의 그레이딩사 접수/진행/반송 등 중간 단계는 운영자가 추적하지 않으므로 단일 상태(`DISTRIBUTOR_SHIPPED`)로 압축.

---

## 2. 테이블 일람 & ERD

### 2.1 일람표

| # | 테이블 | 분류 | PK | UNIQUE | 비고 |
|---|---|---|---|---|---|
| 1 | `profiles` | 사용자 | `id UUID` (= `auth.users.id`) | — | `handle_new_user()`로 자동 생성 |
| 2 | `admin_users` | 사용자 | `id UUID` | `email` | `auth.users`와 분리 (현재) |
| 3 | `grading_services` | 카탈로그 | `id UUID` | (`company`, `code`) | apply form `serviceLevel` 참조 |
| 4 | `orders` | 주문 | `id TEXT` (`YYYYMMDD-NNN`) | — | 8단계 `order_status` |
| 5 | `cards` | 주문 자식 | `id UUID` | — | 1주문 N카드, FK CASCADE |
| 6 | `order_receipt_photos` | 주문 자식 | `id UUID` | — | 관리자 수령 시 다중 사진 |
| 7 | `order_status_logs` | 주문 자식 | `id UUID` | — | 트리거로 자동 적재 (append-only) |
| 8 | `payments` | 결제 | `id UUID` | `idempotency_key`, `toss_payment_key` (partial) | Toss 멱등성 보장 |
| 9 | `batches` | 배치 | `id UUID` | (`company`, `batch_month`) | 회사·월별 1건 |
| 10 | `batch_orders` | 조인 | (`batch_id`, `order_id`) | — | 배치 ↔ 주문 M:N |
| 11 | `consent_logs` | 약관 | `id UUID` | — | append-only legal trail |

### 2.2 ERD (텍스트)

```
                         ┌──────────────┐
                         │  auth.users  │  (Supabase 내장)
                         └──────┬───────┘
                                │ 1:1 (handle_new_user 트리거)
                                ▼
┌──────────────┐         ┌──────────────┐
│ admin_users  │         │   profiles   │
└──────┬───────┘         └──────┬───────┘
       │                         │ 1:N
       │                         ▼
       │  uploaded_by      ┌──────────────┐         ┌──────────────────┐
       │  ─────────────►   │    orders    │ ──1:N─► │      cards       │
       │                   └─┬──┬──┬─────┬┘         └──────────────────┘
       │  changed_by         │  │  │     │
       │  ─────────────►   ┌─┘  │  │     └─► order_receipt_photos
       │                   │    │  └─────► order_status_logs (append-only)
       │                   │    │
       │                   │    └─M:N (batch_orders)─┐
       │                   ▼                          ▼
       │              payments                    ┌─────────┐
       │                                          │ batches │
       │                                          └─────────┘
       └─ admin_users.id is referenced by:
            order_status_logs.changed_by, order_receipt_photos.uploaded_by

profiles ──1:N─► consent_logs (append-only)
```

### 2.3 외래 키 요약

| 자식 컬럼 | 부모 | 삭제 정책 |
|---|---|---|
| `profiles.id` | `auth.users(id)` | CASCADE |
| `orders.user_id` | `profiles(id)` | RESTRICT |
| `cards.order_id` | `orders(id)` | CASCADE |
| `order_receipt_photos.order_id` | `orders(id)` | CASCADE |
| `order_receipt_photos.uploaded_by` | `admin_users(id)` | SET NULL |
| `order_status_logs.order_id` | `orders(id)` | CASCADE |
| `order_status_logs.changed_by` | `admin_users(id)` | SET NULL |
| `payments.order_id` | `orders(id)` | RESTRICT |
| `batch_orders.batch_id` | `batches(id)` | CASCADE |
| `batch_orders.order_id` | `orders(id)` | RESTRICT |
| `consent_logs.user_id` | `profiles(id)` | CASCADE |

> **RESTRICT 의도**: 결제·배치에 묶인 주문이 있으면 사용자/주문 삭제를 차단해 회계 무결성을 보장합니다. 차단된 경우 먼저 자식 데이터를 정리해야 합니다.

---

## 3. 테이블 상세 정의

각 테이블의 컬럼 정의·제약·운영 의미를 설명합니다.

### 3.1 `profiles` — 일반 사용자 프로필

`auth.users`와 1:1 관계. Supabase Auth에서 회원가입이 완료되면 `handle_new_user()` 트리거가 자동으로 row를 생성합니다.

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | UUID | PK, FK→`auth.users(id)` ON DELETE CASCADE | Supabase Auth와 동일한 UUID |
| `email` | TEXT | NOT NULL | 가입 시 이메일. `auth.users.email`과 일치 |
| `name` | TEXT | NOT NULL | 성함 |
| `phone` | TEXT | NOT NULL | 연락처 (e.g. `010-1234-5678`) |
| `provider` | TEXT | NOT NULL DEFAULT `'email'`, CHECK ∈ {`email`, `kakao`, `naver`} | 가입 경로 |
| `phone_verified` | BOOLEAN | NOT NULL DEFAULT FALSE | 본인 확인 여부 |
| `is_blocked` | BOOLEAN | NOT NULL DEFAULT FALSE | 운영자 차단 여부 |
| `block_reason` | TEXT | NULL 허용 | 차단 사유 |
| `notification_enabled` | BOOLEAN | NOT NULL DEFAULT TRUE | 사용자 알림 수신 토글(UI 설정). 발송 인프라는 별도 마이그레이션 |
| `marketing_enabled` | BOOLEAN | NOT NULL DEFAULT FALSE | 마케팅 수신 동의 (회원가입 폼 `agreeMarketing`) |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 트리거로 자동 갱신 |

**트리거**: `set_profiles_updated_at`, `on_auth_user_created` (auth.users → profiles)

---

### 3.2 `admin_users` — 관리자 계정

`auth.users`와 분리되어 있습니다. 관리자 로그인은 본 테이블의 email/role을 기준으로 운영하며, RLS 헬퍼 `is_admin()`이 `auth.users.email`과 매칭하여 판정합니다.

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | UUID | PK, DEFAULT `gen_random_uuid()` | |
| `email` | TEXT | NOT NULL UNIQUE | 관리자 로그인 이메일 |
| `name` | TEXT | NOT NULL | |
| `role` | TEXT | NOT NULL, CHECK ∈ {`SUPER_ADMIN`, `STORE_MANAGER`, `GRADING_MANAGER`, `CS_AGENT`} | 권한 단계 |
| `is_active` | BOOLEAN | NOT NULL DEFAULT TRUE | 비활성화 시 RLS에서 차단 |
| `created_at` / `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

**Role별 책임 (앱 레이어 enforcement)**:
- `SUPER_ADMIN` — 모든 권한
- `STORE_MANAGER` — 매장 접수/수령/발송
- `GRADING_MANAGER` — 등급 입력, 상태 변경
- `CS_AGENT` — 조회

> 현재 RLS는 role을 구분하지 않고 `is_admin()` 단일 체크입니다. role-별 분리가 필요해지면 `is_admin(role TEXT)` 헬퍼를 추가해 정책을 세분화하세요.

---

### 3.3 `grading_services` — 등급 서비스 카탈로그

회사별 서비스 등급(`PSA Regular` 등)의 메타와 가격을 보관합니다. apply form에서 사용자가 선택하면 `code`가 `orders.service_level`에 저장됩니다.

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | UUID | PK | |
| `company` | TEXT | NOT NULL, CHECK ∈ 4사 | |
| `code` | TEXT | NOT NULL | apply form 식별자 (e.g. `psa_economy`) |
| `name` | TEXT | NOT NULL | 표시명 |
| `price` | INTEGER | NOT NULL, CHECK ≥ 0 | 카드 1장당 원가 (원) |
| `estimated_days` | TEXT | NOT NULL | 예상 소요일 (e.g. "30~45일") |
| `description` | TEXT | NULL 허용 | |
| `is_active` | BOOLEAN | NOT NULL DEFAULT TRUE | 비활성 시 신청 폼에서 숨김 |
| `sort_order` | INTEGER | NOT NULL DEFAULT 0 | 정렬 순서 |
| `created_at` / `updated_at` | TIMESTAMPTZ | | |

**제약**: `UNIQUE (company, code)` — 회사 내 코드 중복 방지
**인덱스**: `idx_grading_services_company_active (company, is_active)`

> **가격 변경 시 주의**: `price`를 변경해도 기존 `orders.service_price_snapshot`은 영향받지 않습니다 (의도된 분리).

---

### 3.4 `orders` — 등급 신청 주문 (가장 중요한 테이블)

PK가 사람이 읽을 수 있는 `YYYYMMDD-NNN` 텍스트입니다.

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | TEXT | PK | `YYYYMMDD-순번` (e.g. `20260315-001`). 앱 코드에서 생성 |
| `user_id` | UUID | NOT NULL, FK→`profiles(id)` ON DELETE RESTRICT | 신청자 |
| `name` | TEXT | NOT NULL | 신청 시점 성함 (스냅샷) |
| `phone` | TEXT | NOT NULL | 신청 시점 연락처 (스냅샷) |
| `pickup_method` | TEXT | NOT NULL, CHECK ∈ {`STORE_PICKUP`, `DELIVERY`} | |
| `delivery_address` | TEXT | NULL 허용 | DELIVERY 시 필수 (테이블 CHECK 강제) |
| `grading_company` | TEXT | NOT NULL, CHECK ∈ 4사 | |
| `service_level` | TEXT | NOT NULL | `grading_services.code` 참조 (FK 아님) |
| `service_price_snapshot` | INTEGER | NOT NULL, CHECK ≥ 0 | 신청 시점 카드당 단가 |
| `payment_status` | TEXT | NOT NULL DEFAULT `'PENDING'`, CHECK ∈ 6값 | |
| `prepaid_amount` | INTEGER | NOT NULL DEFAULT 0 | 선결제 총액 |
| `overcharge_amount` | INTEGER | NULL | 오버차지 발생 시 |
| `shipping_fee` | INTEGER | NOT NULL DEFAULT 0 | 택배 수령 추가비 |
| `order_status` | TEXT | NOT NULL DEFAULT `'PAYMENT_PENDING'`, CHECK ∈ **8값** | 4절 참고 |
| `spoiler_preference` | TEXT | NOT NULL DEFAULT `'ALLOW'`, CHECK ∈ {`ALLOW`, `DENY`} | 등급 결과 미리보기 |
| `customer_memo` | TEXT | NULL | 고객 메모 |
| `internal_memo` | TEXT | NULL | 운영자 내부 메모 |
| `received_at` | TIMESTAMPTZ | NULL | 매장에서 카드 실물 수령 시각 |
| `distributor_shipped_at` | TIMESTAMPTZ | NULL | 총판 발송 시각 |
| `distributor_tracking_number` | TEXT | NULL | 총판 운송장 |
| `user_tracking_number` | TEXT | NULL | 사용자 택배 운송장 (반환 시) |
| `cancelled_at` | TIMESTAMPTZ | NULL | 취소 시각 |
| `cancel_reason` | TEXT | NULL | 취소 사유 |
| `created_at` / `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

**테이블 CHECK**: `pickup_method <> 'DELIVERY' OR delivery_address IS NOT NULL`

**인덱스**:
- `idx_orders_user_id (user_id)` — 마이페이지 목록
- `idx_orders_status (order_status)` — 관리자 상태별 필터
- `idx_orders_payment_status (payment_status)` — 오버차지 페이지
- `idx_orders_created_at_desc (created_at DESC)` — 최근 주문
- `idx_orders_company_status (grading_company, order_status)` — 배치 묶음

**트리거**: `set_orders_updated_at`, `log_orders_status_change`, `enforce_orders_user_columns`

---

### 3.5 `cards` — 카드 상세 (1주문 : N카드)

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | UUID | PK | |
| `order_id` | TEXT | NOT NULL, FK→`orders(id)` ON DELETE CASCADE | |
| `card_name` | TEXT | NOT NULL | 사용자 입력 별명 (예: "피카츄 100덱 AR") |
| `english_name` | TEXT | NULL | 영문명 (선택) |
| `set_name` | TEXT | NULL | Step3 isDetailed=false 시 비어있을 수 있음 |
| `card_number` | TEXT | NULL | |
| `year` | TEXT | NULL | |
| `declared_value` | INTEGER | NULL | 신고가액 (원) |
| `front_image_url` | TEXT | NOT NULL | 앞면 사진 URL (필수) |
| `back_image_url` | TEXT | NULL | 뒷면 사진 (현재 UI는 선택) |
| `condition_photo_url` | TEXT | NULL | (legacy) 단일 수령 사진 — 다중은 `order_receipt_photos` |
| `grade_result` | TEXT | NULL | 확정 등급 (e.g. `PSA 10`) |
| `slab_photo_url` | TEXT | NULL | 슬랩 결과 사진 |
| `created_at` / `updated_at` | TIMESTAMPTZ | | |

**인덱스**: `idx_cards_order_id (order_id)`
**트리거**: `set_cards_updated_at`

> `set_name`/`card_number`/`year`/`back_image_url`을 NULL 허용으로 둔 이유: 신청 폼 Step3에서 "상세 정보 직접 입력" 토글이 꺼진 경우 비어있어도 유효한 신청으로 받기 위함입니다.

---

### 3.6 `order_receipt_photos` — 관리자 수령 사진 (1주문 : N사진)

관리자 수령 페이지(`/admin/orders/[id]/receive`)에서 다중 업로드.

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | UUID | PK | |
| `order_id` | TEXT | NOT NULL, FK→`orders(id)` ON DELETE CASCADE | |
| `photo_url` | TEXT | NOT NULL | Supabase Storage URL |
| `caption` | TEXT | NULL | 수령 메모 |
| `uploaded_by` | UUID | NULL, FK→`admin_users(id)` ON DELETE SET NULL | 업로드한 관리자 |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

**인덱스**: `idx_order_receipt_photos_order_id (order_id)`

---

### 3.7 `order_status_logs` — 주문 상태 변경 이력 (append-only)

`log_order_status_change()` 트리거가 자동으로 INSERT합니다. 일반 INSERT/UPDATE/DELETE는 RLS로 차단되어 있습니다.

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | UUID | PK | |
| `order_id` | TEXT | NOT NULL, FK→`orders(id)` ON DELETE CASCADE | |
| `previous_status` | TEXT | NULL | 첫 row 또는 시스템 초기값 |
| `new_status` | TEXT | NOT NULL | |
| `changed_by` | UUID | NULL, FK→`admin_users(id)` ON DELETE SET NULL | 변경자 (시스템/사용자 변경 시 NULL) |
| `change_reason` | TEXT | NULL | |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

**인덱스**: `idx_order_status_logs_order_id_created (order_id, created_at DESC)`

---

### 3.8 `payments` — 결제 이력 (Toss 멱등성)

선결제, 오버차지, 환불, 택배비 모두 같은 테이블에 `payment_type`으로 구분됩니다.

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | UUID | PK | |
| `order_id` | TEXT | NOT NULL, FK→`orders(id)` ON DELETE RESTRICT | |
| `payment_type` | TEXT | NOT NULL, CHECK ∈ {`PREPAYMENT`, `OVERCHARGE`, `REFUND`, `SHIPPING`} | |
| `amount` | INTEGER | NOT NULL | 환불은 음수가 아닌 양수로 저장 |
| `payment_method` | TEXT | NULL | `card`, `transfer` 등 |
| `toss_order_id` | TEXT | NULL | 가맹점 주문번호 (우리 발급) |
| `toss_payment_key` | TEXT | NULL | 토스 발급 키 (성공 시) |
| `idempotency_key` | TEXT | UNIQUE | 클라이언트 발급 (재시도 안전) |
| `status` | TEXT | NOT NULL DEFAULT `'PENDING'`, CHECK ∈ {`PENDING`, `COMPLETED`, `FAILED`, `CANCELLED`} | |
| `raw_response` | JSONB | NULL | 토스 응답 원본 보존 |
| `failure_reason` | TEXT | NULL | |
| `paid_at` | TIMESTAMPTZ | NULL | 결제 확정 시각 |
| `created_at` / `updated_at` | TIMESTAMPTZ | | |

**인덱스**:
- `idx_payments_order_id (order_id)`
- `idx_payments_toss_payment_key (toss_payment_key)` UNIQUE WHERE NOT NULL — partial unique
- `idx_payments_status (status)`

> **멱등성 패턴**: 클라이언트는 결제 시도 전 UUID를 생성해 `idempotency_key`로 저장합니다. 네트워크 재시도 시 동일 키로 INSERT를 시도하면 UNIQUE 위반이 발생해 중복 결제를 방지합니다.

---

### 3.9 `batches` — 월별/회사별 배치 발송

운영자가 월말마다 회사별로 묶음을 만들어 EMS로 발송합니다.

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | UUID | PK | |
| `company` | TEXT | NOT NULL, CHECK ∈ 4사 | |
| `batch_month` | TEXT | NOT NULL | `'YYYY-MM'` 포맷 |
| `status` | TEXT | NOT NULL DEFAULT `'PREPARING'`, CHECK ∈ {`PREPARING`, `SHIPPED`, `RECEIVED`, `COMPLETED`} | |
| `submitted_at` | TIMESTAMPTZ | NULL | 카드하비 접수 |
| `shipped_at` | TIMESTAMPTZ | NULL | EMS 발송 |
| `received_at` | TIMESTAMPTZ | NULL | 그레이딩사 도착 |
| `completed_at` | TIMESTAMPTZ | NULL | 반송 완료 |
| `tracking_number` | TEXT | NULL | EMS 운송장 |
| `receipt_url` | TEXT | NULL | 영수증/송장 PDF URL |
| `note` | TEXT | NULL | |
| `created_at` / `updated_at` | TIMESTAMPTZ | | |

**제약**: `UNIQUE (company, batch_month)` — 회사·월별 1건만 허용
**인덱스**: `idx_batches_status (status)`

> **배치 status vs 주문 order_status**: 배치는 운영자 관점의 발송 묶음 추적이라 4단계 모두 사용합니다. 주문은 사용자 관점이라 그레이딩사 접수/진행/반송 등을 노출하지 않습니다.

---

### 3.10 `batch_orders` — 배치 ↔ 주문 (M:N)

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `batch_id` | UUID | NOT NULL, FK→`batches(id)` ON DELETE CASCADE | |
| `order_id` | TEXT | NOT NULL, FK→`orders(id)` ON DELETE RESTRICT | |
| `added_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

**PK**: (`batch_id`, `order_id`) 복합
**인덱스**: `idx_batch_orders_order_id (order_id)` — 역방향 조회

---

### 3.11 `consent_logs` — 약관 동의 이력 (append-only)

개인정보보호법 대응. 동의·철회는 절대 UPDATE/DELETE하지 않고 새 row를 INSERT합니다.

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | UUID | PK | |
| `user_id` | UUID | NOT NULL, FK→`profiles(id)` ON DELETE CASCADE | |
| `consent_type` | TEXT | NOT NULL, CHECK ∈ {`TERMS`, `PRIVACY`, `PRIVACY_THIRD_PARTY`, `MARKETING`} | |
| `version` | TEXT | NOT NULL | 약관 버전 (e.g. `v1.0`) |
| `agreed` | BOOLEAN | NOT NULL | 철회는 새 row(false) |
| `ip_address` | INET | NULL | |
| `user_agent` | TEXT | NULL | |
| `context` | TEXT | NULL | `SIGNUP` / `APPLY` / `PROFILE_UPDATE` |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

**인덱스**: `idx_consent_logs_user_type_created (user_id, consent_type, created_at DESC)`

> **회원 탈퇴 시**: `ON DELETE CASCADE`로 동의 이력도 같이 삭제됩니다. 법적 보존이 필요하면 `SET NULL`로 변경 + `user_id NULL` 허용을 검토하세요.

---

## 4. Enum 카탈로그

DB CHECK 제약 + TypeScript 유니온 타입을 함께 정리합니다.

### 4.1 `orders.order_status` (8단계)

| # | 값 | 사용자 표시 라벨 | 사용자 스텝퍼 | 의미 |
|---|---|---|---|---|
| 1 | `PAYMENT_PENDING` | 그레이딩 신청 완료 | 1 | 신청 직후, 결제 전 |
| 2 | `CARD_DELIVERY_PENDING` | 결제 완료 | 2 | 결제 완료, 카드 전달 대기 |
| 3 | `CARD_RECEIVED` | 접수 완료 | 3 | 매장에서 실물 수령 |
| 4 | `DISTRIBUTOR_SHIPPED` | 그레이딩 진행 중 | 4 | 총판(카드하비) 발송 ~ 등급 확정 전 (단일 상태) |
| 5 | `GRADE_CONFIRMED` | 등급 확정 | 5 | 그레이딩 결과 입력 완료 |
| 6 | `TRAINERS_ARRIVED` | 트레이너스 도착 | 6 | 슬랩이 매장에 회수됨 |
| 7 | `READY_FOR_PICKUP` | 트레이너스 도착 | 6 | 사용자에게 수령 안내 발송 (TRAINERS_ARRIVED와 동일 스텝) |
| 8 | `COMPLETED` | 수령 완료 | 7 | 사용자가 수령 |

> **단순화 결정**: 총판 발송 후 그레이딩사 접수/진행/반송 등 중간 상태는 운영자가 추적하지 않아 `DISTRIBUTOR_SHIPPED` 단일 상태로 표현합니다.
> 유지된 `READY_FOR_PICKUP`은 `TRAINERS_ARRIVED`의 후속 운영 상태(수령 안내 발송 후 대기)이며 사용자 표시는 동일합니다.

### 4.2 기타 enum

| 필드 | 값 |
|---|---|
| `payment_status` | `PENDING`, `PAID`, `OVERCHARGE_PENDING`, `OVERCHARGE_PAID`, `REFUNDED`, `FAILED` |
| `pickup_method` | `STORE_PICKUP`, `DELIVERY` |
| `spoiler_preference` | `ALLOW`, `DENY` |
| `grading_company` | `PSA`, `BGS`, `CGC`, `BRG` |
| `admin_users.role` | `SUPER_ADMIN`, `STORE_MANAGER`, `GRADING_MANAGER`, `CS_AGENT` |
| `payments.payment_type` | `PREPAYMENT`, `OVERCHARGE`, `REFUND`, `SHIPPING` |
| `payments.status` | `PENDING`, `COMPLETED`, `FAILED`, `CANCELLED` |
| `batches.status` | `PREPARING`, `SHIPPED`, `RECEIVED`, `COMPLETED` |
| `consent_logs.consent_type` | `TERMS`, `PRIVACY`, `PRIVACY_THIRD_PARTY`, `MARKETING` |
| `profiles.provider` | `email`, `kakao`, `naver` |

> **enum 변경 시 동기화 위치**:
> - DB: `002_redesign.sql` CHECK 제약
> - TS 타입: `src/types/order.ts`, `user.ts`, `consent.ts`, `batch.ts`
> - 라벨/스텝퍼: `src/constants/grading.ts`, `src/constants/mock-admin-data.ts`
> - 매핑 함수: `src/components/user/order-status-tracker.tsx` (READY_FOR_PICKUP → TRAINERS_ARRIVED)

---

## 5. 인덱스 전략

목적별 분류:

### 5.1 PK / UNIQUE (자동 생성)
- 모든 PK
- `admin_users.email`
- `grading_services (company, code)`
- `payments.idempotency_key`
- `batches (company, batch_month)`

### 5.2 FK 역참조 / 조회 가속
- `idx_orders_user_id` — 마이페이지 사용자 주문 목록
- `idx_cards_order_id` — 주문 상세에서 카드 로드
- `idx_order_receipt_photos_order_id`
- `idx_payments_order_id`
- `idx_batch_orders_order_id`
- `idx_consent_logs_user_type_created`

### 5.3 필터 / 정렬 가속
- `idx_orders_status`, `idx_orders_payment_status`, `idx_orders_created_at_desc`
- `idx_orders_company_status (grading_company, order_status)` — 배치 후보 추출
- `idx_grading_services_company_active (company, is_active)`
- `idx_batches_status`
- `idx_payments_status`
- `idx_order_status_logs_order_id_created`

### 5.4 Partial Unique
- `idx_payments_toss_payment_key (toss_payment_key) WHERE toss_payment_key IS NOT NULL`

---

## 6. 함수 / 트리거

### 6.1 함수 일람

| 함수 | 언어 | SECURITY | 동작 |
|---|---|---|---|
| `update_updated_at()` | plpgsql | INVOKER | `NEW.updated_at = NOW()` |
| `handle_new_user()` | plpgsql | DEFINER | `auth.users` INSERT 시 `profiles` row 생성 |
| `is_admin()` | sql | DEFINER | `auth.uid()`의 email이 활성 admin인지 |
| `log_order_status_change()` | plpgsql | DEFINER | `orders.order_status` 변경 시 `order_status_logs` INSERT |
| `enforce_order_user_update_columns()` | plpgsql | DEFINER | 일반 사용자가 수정 가능한 컬럼 화이트리스트 |

### 6.2 트리거 일람 (10개)

| 트리거 | 테이블 | 시점 | 함수 |
|---|---|---|---|
| `set_profiles_updated_at` | profiles | BEFORE UPDATE | `update_updated_at` |
| `set_admin_users_updated_at` | admin_users | BEFORE UPDATE | `update_updated_at` |
| `set_grading_services_updated_at` | grading_services | BEFORE UPDATE | `update_updated_at` |
| `set_orders_updated_at` | orders | BEFORE UPDATE | `update_updated_at` |
| `set_cards_updated_at` | cards | BEFORE UPDATE | `update_updated_at` |
| `set_payments_updated_at` | payments | BEFORE UPDATE | `update_updated_at` |
| `set_batches_updated_at` | batches | BEFORE UPDATE | `update_updated_at` |
| `on_auth_user_created` | auth.users | AFTER INSERT | `handle_new_user` |
| `log_orders_status_change` | orders | AFTER UPDATE OF order_status | `log_order_status_change` |
| `enforce_orders_user_columns` | orders | BEFORE UPDATE | `enforce_order_user_update_columns` |

### 6.3 핵심 함수 상세

#### `handle_new_user()`

```sql
INSERT INTO profiles (id, email, name, phone, provider)
VALUES (NEW.id, NEW.email,
  COALESCE(NEW.raw_user_meta_data->>'name', ''),
  COALESCE(NEW.raw_user_meta_data->>'phone', ''),
  COALESCE(NEW.raw_user_meta_data->>'provider', 'email'));
```

회원가입 호출 시 `signUp({ email, password, options: { data: { name, phone, provider } } })` 형태로 메타데이터를 넘겨야 합니다.

**주의**: `provider`가 `email/kakao/naver` 외 값이면 CHECK 위반으로 트리거가 실패하고 `auth.users` INSERT 자체가 롤백됩니다. OAuth provider 추가 시 CHECK도 함께 확장하세요.

#### `is_admin()`

```sql
SELECT EXISTS (
  SELECT 1 FROM admin_users a
  JOIN auth.users u ON u.email = a.email
  WHERE u.id = auth.uid() AND a.is_active = TRUE
);
```

- `SECURITY DEFINER`로 실행되므로 admin_users의 RLS를 우회합니다 → 무한 재귀 없음.
- temp-auth 단계에서는 `auth.uid()`가 NULL → 항상 false 반환.

#### `log_order_status_change()`

`orders.order_status`가 변경된 경우에만 INSERT (`UPDATE OF order_status` 트리거 + `IS DISTINCT FROM` 가드 이중 체크).
SECURITY DEFINER 덕분에 `order_status_logs`의 INSERT 정책이 없어도 동작합니다.

#### `enforce_order_user_update_columns()`

일반 사용자가 변경할 수 있는 컬럼은 다음 7개로 제한:
- `pickup_method`, `delivery_address`, `spoiler_preference`, `customer_memo`, `user_tracking_number`, `cancelled_at`, `cancel_reason`

그 외 컬럼을 변경하면 `RAISE EXCEPTION` 발생. `is_admin()` 또는 `auth.role() = 'service_role'`이면 우회.

> **컬럼 추가 시 갱신 필요**: `orders` 스키마에 새 컬럼이 추가되면 본 함수의 화이트리스트도 함께 검토하세요.

---

## 7. RLS 정책

전 11개 테이블이 `ENABLE ROW LEVEL SECURITY` 상태입니다.

### 7.1 정책 매트릭스

| 테이블 | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `profiles` | own OR admin | (트리거) | own OR admin | admin |
| `admin_users` | admin | admin | admin | admin |
| `grading_services` | **anyone** | admin | admin | admin |
| `orders` | own OR admin | own / admin | own (컬럼 제한) OR admin | admin |
| `cards` | own (via order) OR admin | own (via order) OR admin | admin | admin |
| `order_receipt_photos` | own (via order) OR admin | admin | admin | admin |
| `order_status_logs` | own (via order) OR admin | (트리거) | ✗ | ✗ |
| `payments` | own (via order) OR admin | admin | admin | ✗ |
| `batches` | admin | admin | admin | admin |
| `batch_orders` | admin | admin | admin | admin |
| `consent_logs` | own OR admin | own OR admin | ✗ | ✗ |

> **✗** = 정책 미정의 → 모든 호출 차단 (append-only 보장)
> **own** = `auth.uid() = user_id` (또는 order 조인)
> **admin** = `is_admin()` 호출 결과

### 7.2 정책 명 일람 (총 26개)

```
profiles_select_own_or_admin              profiles_update_own_or_admin
profiles_admin_delete

admin_users_admin_all                     -- ALL FOR

grading_services_select_anyone            grading_services_admin_write
grading_services_admin_update             grading_services_admin_delete

orders_select_own_or_admin                orders_insert_self
orders_update_own_or_admin                orders_admin_delete

cards_select_owner_or_admin               cards_insert_owner_or_admin
cards_admin_update                        cards_admin_delete

orp_select_owner_or_admin                 orp_admin_write          -- ALL FOR

osl_select_owner_or_admin                 -- INSERT는 트리거(SECURITY DEFINER)만

payments_select_owner_or_admin            payments_admin_write
payments_admin_update                     -- DELETE 미정의

batches_admin_all                         batch_orders_admin_all   -- ALL FOR

consent_logs_select_own_or_admin          consent_logs_insert_self_or_admin
                                          -- UPDATE/DELETE 미정의
```

### 7.3 정책 검증 예시

```sql
-- 익명 호출 (auth.uid() = NULL)
SET LOCAL ROLE anon;
SELECT * FROM orders;            -- 0 rows (own/admin 조건 모두 false)
SELECT * FROM grading_services;  -- 가시 (USING TRUE)

-- 사용자 X로 호출
SELECT set_config('request.jwt.claims',
  '{"sub":"USER_X_UUID","role":"authenticated"}'::text, true);
SET LOCAL ROLE authenticated;
SELECT * FROM orders;            -- 자기 주문만

-- service_role (RLS 우회)
SET LOCAL ROLE service_role;
SELECT * FROM orders;            -- 전체
```

> **현재 단계의 제약**: 앱이 아직 temp-auth(쿠키)를 쓰므로 `auth.uid()`가 NULL입니다. anon key로 호출 시 모든 데이터가 차단되며, 서버 코드는 `service_role` 키를 사용해야 동작합니다. Supabase Auth 마이그레이션 후 anon key + RLS로 전환됩니다.

---

## 8. 명명 규약 & TypeScript 매핑

### 8.1 케이스 컨벤션

| 레이어 | 케이스 | 예 |
|---|---|---|
| PostgreSQL | `snake_case` | `service_price_snapshot` |
| TypeScript | `camelCase` | `servicePriceSnapshot` |
| URL/route | `kebab-case` | `/admin/orders/[id]/receive` |

### 8.2 변환 위치

데이터 액세스 boundary에서 변환합니다. 권장 위치:

```
src/lib/supabase/mappers/
  ├─ order.ts      // dbToOrder(row) / orderToDb(order)
  ├─ card.ts
  ├─ payment.ts
  └─ ...
```

(현재는 mock-data가 직접 camelCase로 작성되어 변환 불필요. 실 Supabase 연동 시 추가)

### 8.3 TypeScript 타입 위치

| TS 타입 | 파일 | 매핑 테이블 |
|---|---|---|
| `User`, `AdminRole`, `AdminUser` | `src/types/user.ts` | `profiles`, `admin_users` |
| `Order`, `OrderStatus`(8값), `PaymentStatus`, `PickupMethod`, `SpoilerPreference`, `GradingCompany` | `src/types/order.ts` | `orders` |
| `Card`, `OrderReceiptPhoto`, `OrderStatusLog` | `src/types/order.ts` | `cards`, `order_receipt_photos`, `order_status_logs` |
| `Payment`, `PaymentType`, `PaymentRecordStatus` | `src/types/order.ts` | `payments` |
| `GradingService` | `src/types/order.ts` | `grading_services` |
| `Batch`, `BatchStatus`, `BatchOrder` | `src/types/batch.ts` | `batches`, `batch_orders` |
| `ConsentLog`, `ConsentType`, `ConsentContext` | `src/types/consent.ts` | `consent_logs` |

전체 barrel: `src/types/index.ts`

---

## 9. 운영 노트

### 9.1 `service_level` ↔ `grading_services.code`

`orders.service_level`은 **FK가 아닌 TEXT**입니다. 이유:
- `grading_services.price` 변경 시 기존 주문 단가가 영향받지 않도록 보호
- 비활성화/삭제된 서비스로도 조회/통계 가능

신청 시점 단가는 `orders.service_price_snapshot`에 별도 저장되어 회계 무결성 보장.

### 9.2 주문 ID 생성 (`YYYYMMDD-NNN`)

- 생성 위치: 앱 코드 (현재 미구현, 향후 `/api/orders` 라우트)
- 권장 패턴: `BEGIN; SELECT max(...) FROM orders WHERE id LIKE 'YYYYMMDD-%' FOR UPDATE; ...; COMMIT;` 또는 SEQUENCE
- DB-side 헬퍼는 의도적으로 미제공 (앱 트랜잭션과 분리)

### 9.3 다중 사진 분리

| 사진 | 위치 |
|---|---|
| 사용자 신청 시 카드 앞/뒷면 | `cards.front_image_url`, `cards.back_image_url` |
| 관리자 수령 시 카드 컨디션 (단일, legacy) | `cards.condition_photo_url` |
| 관리자 수령 시 다중 업로드 | `order_receipt_photos.photo_url` |
| 그레이딩 후 슬랩 사진 | `cards.slab_photo_url` |

### 9.4 결제 멱등성

- 클라이언트가 결제 시도 직전 UUID 생성 → `idempotency_key`로 INSERT (status `PENDING`)
- 토스 호출 → 응답 시 같은 row를 UPDATE (`status`, `toss_payment_key`, `paid_at`, `raw_response`)
- 네트워크 재시도가 발생해도 동일 `idempotency_key` 재사용으로 UNIQUE 위반 → 중복 결제 방지

### 9.5 회원 탈퇴 시 데이터 처리

`profiles` 삭제 시:
- `auth.users` CASCADE → `profiles` CASCADE
- `orders` RESTRICT → 주문이 있으면 탈퇴 차단
- `consent_logs` CASCADE → 동의 이력 삭제 (법적 보존이 필요하면 정책 변경 필요)

### 9.6 RLS와 service_role

- `service_role` 키는 RLS를 완전히 우회합니다
- 서버 코드(API 라우트, server action)에서만 사용
- **절대 클라이언트에 노출 금지** — env에서 `SUPABASE_SERVICE_ROLE_KEY`는 server-only

### 9.7 OAuth Provider 확장

현재 `profiles.provider` CHECK은 `email/kakao/naver`만 허용. Google/Apple 추가 시:

```sql
ALTER TABLE profiles
  DROP CONSTRAINT profiles_provider_check,
  ADD CONSTRAINT profiles_provider_check
    CHECK (provider IN ('email', 'kakao', 'naver', 'google', 'apple'));
```

OAuth 플로우에서 `signInWithOAuth({ provider: 'google', options: { data: { provider: 'google' } } })`로 메타데이터를 넘겨야 트리거가 정상 동작합니다.

### 9.8 그레이딩 진행 중 단계가 단일 상태인 이유

총판(카드하비)에 발송한 시점부터 등급이 확정되기까지의 모든 중간 단계(그레이딩사 접수/진행/반송/총판 회수 등)는 **운영자가 추적하지 않습니다**. 이유:
- 외부 업체 진행이라 정확한 시점 파악이 어려움
- 사용자에게는 "그레이딩 진행 중" 단일 표시로 충분
- 상태 전이 횟수가 줄어 운영 부담 감소

이 구간이 길어 사용자가 답답해할 수 있으므로, UI에서는 "보통 N일 소요됩니다" 안내를 함께 표시하세요. (`grading_services.estimated_days` 활용)

---

## 10. 자주 쓰는 쿼리

### 10.1 사용자 마이페이지 — 자기 주문 목록

```sql
SELECT
  o.*,
  COUNT(c.id) AS card_count
FROM orders o
LEFT JOIN cards c ON c.order_id = o.id
WHERE o.user_id = auth.uid()
GROUP BY o.id
ORDER BY o.created_at DESC;
```

### 10.2 관리자 — 회사·상태별 주문 카운트

```sql
SELECT grading_company, order_status, COUNT(*)
FROM orders
GROUP BY grading_company, order_status
ORDER BY grading_company, order_status;
-- 인덱스 idx_orders_company_status 활용
```

### 10.3 관리자 — 배치 후보 (총판 발송 대기)

```sql
SELECT id, grading_company, created_at
FROM orders
WHERE order_status = 'CARD_RECEIVED'
  AND grading_company = 'PSA'
  AND id NOT IN (SELECT order_id FROM batch_orders);
```

### 10.4 결제 멱등 INSERT

```sql
INSERT INTO payments (order_id, payment_type, amount, idempotency_key, status)
VALUES ($1, 'PREPAYMENT', $2, $3, 'PENDING')
ON CONFLICT (idempotency_key) DO NOTHING
RETURNING id;
```

### 10.5 주문 상태 변경 (트리거가 자동 로깅)

```sql
UPDATE orders
SET order_status = 'CARD_RECEIVED', received_at = NOW()
WHERE id = '20260315-001';
-- log_orders_status_change 트리거가 order_status_logs에 INSERT
```

### 10.6 약관 동의 기록

```sql
INSERT INTO consent_logs (user_id, consent_type, version, agreed, ip_address, user_agent, context)
VALUES (auth.uid(), 'PRIVACY', 'v1.2', TRUE, $1, $2, 'SIGNUP');
```

### 10.7 등급 확정으로 일괄 전환 (배치 단위)

```sql
-- 특정 배치의 모든 주문을 GRADE_CONFIRMED로 (등급 입력 완료 후)
UPDATE orders
SET order_status = 'GRADE_CONFIRMED'
WHERE id IN (
  SELECT order_id FROM batch_orders WHERE batch_id = $1
)
AND order_status = 'DISTRIBUTOR_SHIPPED';
```

---

## 11. 마이그레이션 적용 가이드

### 11.1 로컬 환경 (clean reset)

```bash
# Supabase CLI 로컬 DB 초기화 + 모든 마이그레이션 재적용
pnpm dlx supabase db reset
```

### 11.2 단일 마이그레이션 적용

```bash
pnpm dlx supabase migration up
```

### 11.3 운영 환경

> **운영 데이터가 있는 경우 002_redesign은 DROP TABLE을 포함하므로 데이터 유실됩니다.**

권장 순서:
1. `pg_dump`로 전체 백업
2. 다운타임 공지
3. 데이터 보존이 필요한 경우 별도 이관 스크립트 작성
4. 002 적용
5. 검증 쿼리 (아래 11.4) 실행
6. 앱 재배포

### 11.4 적용 후 검증 쿼리

```sql
-- 11개 테이블 존재 확인
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- RLS 활성 확인 (11개 row 기대, 모두 rowsecurity = true)
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public';

-- 정책 카운트 (26개 기대)
SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public';

-- 함수 존재 확인 (5개)
SELECT proname FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('update_updated_at', 'handle_new_user', 'is_admin',
                  'log_order_status_change', 'enforce_order_user_update_columns');

-- order_status enum 8값 확인
SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'orders_order_status_check';
```

### 11.5 적용 직후 필요한 seed

`grading_services`가 비어있으면 신청 폼이 동작하지 않습니다. 최소 seed 예:

```sql
INSERT INTO grading_services (company, code, name, price, estimated_days, sort_order) VALUES
  ('PSA', 'psa_economy',  'PSA Economy',   55000, '60~90일', 10),
  ('PSA', 'psa_regular',  'PSA Regular',  110000, '30~45일', 20),
  ('PSA', 'psa_express',  'PSA Express',  220000, '10~15일', 30),
  ('BGS', 'bgs_standard', 'BGS Standard',  40000, '60~90일', 10),
  ('BGS', 'bgs_premium',  'BGS Premium',   90000, '30~45일', 20),
  ('CGC', 'cgc_standard', 'CGC Standard',  35000, '60~90일', 10),
  ('CGC', 'cgc_express',  'CGC Express',   47500, '20~30일', 20),
  ('BRG', 'brg_standard', 'BRG Standard',  45000, '14~21일', 10);
```

---

## 12. 알려진 격차 & 다음 단계

### 12.1 본 마이그레이션 적용 후에도 별도 작업 필요

| 항목 | 위치/계획 |
|---|---|
| temp-auth → Supabase Auth 전환 | `.omc/plans/auth-supabase-migration.md` |
| **알림 발송 인프라** (notifications 테이블 + 워커) | 추후 별도 마이그레이션 — 본 redesign 제외 |
| Storage 버킷 생성 + 정책 (카드 이미지, 슬랩 사진, 영수증) | 별도 마이그레이션 필요 |
| API 라우트 구현 | `src/app/api/{auth,orders,payments}/` 디렉터리는 비어있음 |
| `grading_services` seed | 위 11.5 |
| mock-data → 실제 Supabase 쿼리 교체 | `src/constants/mock-data.ts`, `mock-admin-data.ts` |
| OAuth provider 확장 (Google/Apple 등) | 위 9.7 |
| 결제 웹훅 핸들러 | Toss 웹훅 검증 + `payments.raw_response` 저장 |

### 12.2 제외된 항목 (의도)

- **알림 발송 이력 (`notifications`)**: 카카오 알림톡/SMS/Email 발송 추적 — 인프라 결정 후 별도 마이그레이션
- **그레이딩 진행 중 세부 단계**: 총판 발송 후 ~ 등급 확정 전 중간 상태 추적 — `DISTRIBUTOR_SHIPPED` 단일 상태로 통합
- **Role-별 RLS 분기**: 현재 `is_admin()` 단일 체크. STORE_MANAGER vs GRADING_MANAGER 구분이 필요해지면 헬퍼 추가
- **`generate_order_id()` DB 헬퍼**: 앱 코드에서 처리 (트랜잭션 분리)
- **`audit_logs` 일반 감사 테이블**: order_status_logs로 충분 — 다른 테이블 감사가 필요해지면 별도 추가
- **소프트 삭제 (`deleted_at`)**: 현재는 hard delete + RLS DELETE 정책으로 통제

---

## 부록 A. 마이그레이션 변경 요약 (001 → 002)

| 영역 | 변경 |
|---|---|
| `cards` | `english_name` 추가, `set_name`/`card_number`/`year`/`back_image_url` NULL 허용 |
| `orders` | `service_price_snapshot`, `shipping_fee`, `cancelled_at`, `cancel_reason` 추가, DELIVERY 시 주소 강제 CHECK, **`order_status` 14→8 단순화** |
| `profiles` | `marketing_enabled` 추가 |
| `grading_services` | `code` + `UNIQUE(company, code)` 추가 |
| `batches` | `company`, `received_at`, `completed_at`, `note` 추가, `status`에 `RECEIVED` 추가, `UNIQUE(company, batch_month)` |
| `payments` | `toss_order_id`, `idempotency_key UNIQUE`, `raw_response`, `failure_reason`, `paid_at` 추가 |
| `order_status_logs` | `changed_by`에 `admin_users(id)` FK 추가 |
| **신규 테이블** | `order_receipt_photos`, `consent_logs` |
| **제외** (이전 redesign 시도에서 후 제거) | `notifications` 테이블 — 별도 마이그레이션으로 분리 |
| **신규 함수** | `is_admin()`, `log_order_status_change()`, `enforce_order_user_update_columns()` |
| **RLS** | 전 11개 테이블 활성, 26개 정책 |

### 제거된 order_status 값 (vs 001)

`DISTRIBUTOR_RECEIVED`, `GRADING_COMPANY_SHIPPED`, `GRADING_COMPANY_RECEIVED`, `GRADING_IN_PROGRESS`, `GRADING_COMPANY_RETURNED`, `DISTRIBUTOR_ARRIVED`

→ 모두 `DISTRIBUTOR_SHIPPED` 단일 상태로 흡수

---

## 부록 B. 참고 파일

| 파일 | 역할 |
|---|---|
| `supabase/migrations/002_redesign.sql` | DDL/RLS 정의 (SoT) |
| `src/types/*.ts` | TypeScript 도메인 타입 |
| `src/constants/grading.ts` | 라벨/스텝퍼/메타 |
| `src/constants/mock-admin-data.ts`, `mock-data.ts` | 개발용 목업 데이터 |
| `src/components/user/order-status-tracker.tsx` | 사용자 진행 단계 시각화 (READY_FOR_PICKUP→TRAINERS_ARRIVED 매핑) |
| `CLAUDE.md` | 프로젝트 가이드 |
| `.omc/plans/auth-supabase-migration.md` | 인증 마이그레이션 계획 (별건) |
| `C:\Users\user\.claude\plans\splendid-booping-turing.md` | 본 002 redesign 설계 계획서 |
