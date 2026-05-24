# Plan: Customer-Only PWA Web Push for Order Status Milestones (v1.0)

**Status:** APPROVED (RALPLAN consensus, Round 2)
**Mode:** DELIBERATE (auth + migration + PII)
**Spec:** `.omc/specs/deep-interview-pwa-push.md` (deep-interview, ambiguity 11%)
**Created:** 2026-05-10
**Owner:** hello@trainers.kr
**Pipeline:** deep-interview → ralplan(2 rounds) → autopilot

## Consensus Trail

| Round | Stage | Verdict | Key Notes |
|-------|-------|---------|-----------|
| 1 | Planner draft | — | 5 decisions + Phase A-E + 10 risks + 5 ADRs |
| 1 | Architect | ITERATE | 4 antithesis + 5 missing tradeoffs + 4 principle violations |
| 1 | Critic | ITERATE | 10 Required + 6 Recommended changes |
| 2 | Planner revise | — | Closes all 16 changes; brownfield correction (8-state OrderStatus); temp-auth Case B confirmed |
| 2 | Architect | APPROVE-WITH-CONDITIONS | 8/10 PASS, 2 PARTIAL → 5 patch recommendations |
| 2 | Critic | **APPROVE-WITH-CONDITIONS** | All 5 Architect patches accepted + 1 Critic R2 patch (4 sub-items) integrated |

All 6 closing patches integrated inline below.

---

## §0 Pre-conditions: Spec-vs-Codebase Reconciliation & Release Scope

### §0.1 OrderStatus는 8개 (spec body 14단계 가정 정정)

Spec body는 OrderStatus를 "14단계"로 기술하지만, 실제 `src/types/order.ts:6-14`의 `OrderStatus` union은 **8개**:

```
PAYMENT_PENDING / CARD_DELIVERY_PENDING / CARD_RECEIVED / DISTRIBUTOR_SHIPPED
/ GRADE_CONFIRMED / TRAINERS_ARRIVED / READY_FOR_PICKUP / COMPLETED
```

Spec acceptance criteria 11번의 milestone 초안 키 (`PAID / READY_FOR_PICKUP / OVERSEAS_SHIPPED / GRADING_COMPLETE / DELIVERED`) 중 **PAID, OVERSEAS_SHIPPED, GRADING_COMPLETE, DELIVERED는 실제 OrderStatus union에 부재**.

본 plan은 codebase 사실에 정렬하여 신규 단일 출처 작성:

```ts
// src/constants/notifications.ts (신규, 권한 있는 단일 출처)
// TRAINERS_ARRIVED는 stepper에서 READY_FOR_PICKUP과 step 6으로 통합되므로
// dispatch 대상 아님 (cite: src/constants/grading.ts:65-67)
import type { OrderStatus } from "@/types/order";

export const MILESTONE_STATUS_KEYS = [
  "CARD_DELIVERY_PENDING", // ← spec 'PAID' 의도 매핑 (결제 완료 직후 안내)
  "DISTRIBUTOR_SHIPPED",   // ← spec 'OVERSEAS_SHIPPED' 의도 매핑
  "GRADE_CONFIRMED",       // ← spec 'GRADING_COMPLETE' 의도 매핑
  "READY_FOR_PICKUP",      // TRAINERS_ARRIVED는 의도적 제외 (stepper 통합)
  "COMPLETED",             // ← spec 'DELIVERED' 의도 매핑
] as const satisfies readonly OrderStatus[];

export type MilestoneStatusKey = typeof MILESTONE_STATUS_KEYS[number];

export const NOTIFICATION_TITLE = "그레이딩 진행 알림" as const;
export const NOTIFICATION_BODY = "주문 상태가 업데이트되었습니다" as const;
```

`satisfies`로 OrderStatus union 변경 시 컴파일 타임에 sync drift가 즉시 표면화됨.

**Spec 본문 patch (Phase A0):** 별도 commit으로 spec의 "14단계" → "8단계", AC#11 milestone 키 → 실제 5개 키로 갱신.

### §0.2 v1.0 Release Scope = 내부 검증 출시 (Architect Patch #1)

**v1.0 release scope = `TEMP_ACCOUNTS` 2 users 내부 검증 출시; F-PUSH-1 (auth-supabase-migration 머지 후 user_id flip) 머지 시 prod 외부 사용자 합류.**

근거: `src/lib/auth/temp-auth.ts:1-67` 직접 read 결과 쿠키가 서명되지 않음 (Case B). subscribe route는 email이 `TEMP_ACCOUNTS` 하드코딩 allowlist (`customer1@example.com`, `host1@example.com`)에 존재함을 server-side에서 강제 검증한다. 이는 deep-interview Round 6의 "temp-auth 위에서 바로 출시" 결정의 **솔직한 운영 의미**다 — 외부 prod 사용자 도달은 F-PUSH-1 의존.

---

## §1 RALPLAN-DR DELIBERATE — 5개 결정

### 결정 1: PWA 플러그인 — 무 플러그인 + 수동 SW

**Principles:** 의존성 최소화, Next.js 16 호환, 디버깅 가능성, App Router 친화.
**Decision Drivers (top 3):** (1) `next-pwa`/`@serwist/next` Next 16 검증 미완료, (2) v1.0 SW는 push + notificationclick 2개 이벤트만 (~80 LOC로 자명), (3) 오프라인 캐싱 Non-Goal.

**Viable Options:**
- **O1 (Selected) 수동 SW**: `app/manifest.ts` (Next.js metadata API) + `public/sw.js` (classic worker, no imports) + `next.config.ts` `headers()`로 `Service-Worker-Allowed: /`.
- O2 `@serwist/next`: workbox 후속작, App Router 명시 지원. **Invalidation:** Next 16 호환 미검증, runtime caching 비활성화로 가치 0, 의존성 위험 비영(非零).
- O3 `next-pwa`: Next 13+ 유지보수 미흡, App Router/16 공식 지원 모호.

**Synthesis (Architect antithesis 흡수):** v2에서 오프라인 캐싱 필요 시 serwist 도입 비용은 별도 ADR 재검토.

---

### 결정 2: Cron 호스팅 — Vercel Cron + pg_cron 폴백 동봉

**Principles:** 호스팅 정합, 5분 SLO 신뢰성, 멱등성, 폴백 가능성.
**Decision Drivers:** (1) `web-push` Node.js 라이브러리 호환 런타임, (2) 비밀 관리 표면 최소, (3) Vercel Pro 결제 의존성 (OQ-1).

**Viable Options:**
- **O1 (Selected) Vercel Cron** + `/api/push/dispatch` Route Handler (`runtime: 'nodejs'`) + `vercel.json` `*/5 * * * *` + Bearer secret.
- **O2 (Fallback)** pg_cron + `pg_net.http_get` calls dispatch endpoint. SQL 동봉 (주석 처리, OQ-1 미체결 시 활성화).
- O3 GitHub Actions: 5분 best-effort, SLO 위반.

**Dual-trigger 안전성:** outbox UNIQUE 제약 + dispatcher 멱등성으로 Vercel Cron + pg_cron 동시 활성화에도 중복 발송 0.

---

### 결정 3: Dispatch 추적 — `notifications_outbox` + `order_status_log_id` FK

**Principles:** 멱등성(DB UNIQUE), audit/operations 분리, multi-channel 자연 확장.
**Decision Drivers:** (1) status_logs는 audit 불변 사실, (2) outbox는 가변 운영 fact (재시도/에러/skip 사유), (3) `order_status_logs.changed_by → admin_users(id)` FK 사실 (`002_redesign.sql:246`) — customer email은 `outbox → status_logs → orders → profiles` JOIN 필요.

**Viable Options:**
- **O1 (Selected)** `notifications_outbox` 테이블 + `order_status_log_id NOT NULL FK ON DELETE CASCADE` (Critic R2 patch 6a).
- O2 `order_status_logs.push_dispatched_at` 컬럼 추가: audit 무결성 침해, multi-channel 확장 어려움.
- O3 Redis stream/queue: 인프라 추가, 멱등성 별도 구현.

---

### 결정 4: 5개 Milestone Status Keys + Spoiler 필터 제거

**Principles:** spec ON/OFF 단일 스위치 정합, 사용자 가치 사슬 (행동 trigger), stepper UX 일치.
**Decision Drivers:** (1) spec Non-Goal "v1.0 ON/OFF 단일 스위치", (2) payload는 grade 미노출, (3) stepper 통합 정책 (TRAINERS_ARRIVED ↔ READY_FOR_PICKUP).

**Viable Options:**
- **O1 (Selected)** 5개 milestone (CARD_DELIVERY_PENDING, DISTRIBUTOR_SHIPPED, GRADE_CONFIRMED, READY_FOR_PICKUP, COMPLETED), spoiler 필터 분기 dispatcher에서 제거.
- O2 spoiler 필터 유지 (`GRADE_CONFIRMED + DENY` skip): **Invalidation** — spec Non-Goal 위반 (사실상 per-event off 스위치), payload에 grade 미노출이므로 알림 레벨 spoiler 보호 무의미.
- O3 milestone 7개 (CARD_RECEIVED, TRAINERS_ARRIVED 추가): stepper 통합 정합 깨짐.

**TRAINERS_ARRIVED 처리:** dispatcher가 `status_key NOT IN MILESTONE_STATUS_KEYS`이면 outbox INSERT 시도조차 안 함. 운영자가 둘 다 거치든 READY_FOR_PICKUP만 직접 set하든 push 정확히 1회.

**Spoiler UX 미묘 트레이드오프 (ADR-004 명문화):** payload는 grade 미노출이지만 push 도달 자체가 "grade 결정됨" 시그널 — 사용자가 mypage 탭 시 기존 spoiler UI가 grade 가림. v1.0은 이 미묘 충돌을 수용.

---

### 결정 5: 003 마이그 + RLS + temp-auth Case B Mitigation

**Principles:** RLS 명시, PII 최소화, 변조 가능 입력 신뢰 금지.
**Decision Drivers:** (1) temp-auth 쿠키 Case B (서명 부재) 직접 검증, (2) F-PUSH-1로 정식 `auth.uid()` 이행 경로, (3) service_role 단독 ALL.

**temp-auth Mitigation 채택 (Architect/Critic 합의):** subscribe route에서 email이 `TEMP_ACCOUNTS` 하드코딩 allowlist 멤버임을 server-side 검증. HMAC 서명 옵션은 거부(매몰 비용 — temp-auth는 곧 삭제 예정).

**Viable Options:**
- **O1 (Selected)** `push_subscriptions(email + nullable user_id)` + `notifications_outbox(+ order_status_log_id FK ON DELETE CASCADE)` + RLS service_role only + admin SELECT outbox + TEMP_ACCOUNTS allowlist 검증.
- O2 one-time email confirm token: UX 저하.
- O3 push 자체를 F-PUSH-1 후로 deferred: 출시 지연.

---

## §2 ADR 5건 (Final)

### ADR-001 — 무 플러그인 SW
- **Decision:** `app/manifest.ts` + `public/sw.js` + `next.config.ts` 헤더로 직접 구현.
- **Drivers:** Next 16 호환성 검증 비용 회피, push+notificationclick 외 SW 기능 불요, 의존성 표면 최소.
- **Alternatives Considered:** `@serwist/next` (Next 16 호환 미검증, runtime caching 비활성화 시 가치 0), `next-pwa` (App Router 지원 모호).
- **Why Chosen:** v1.0 SW는 ~80 LOC, 캐싱 불요, 빌드 산출물 가시.
- **Consequences:** SW 버전 관리 수동 (SW_VERSION 상수), Turbopack dev `next.config.ts headers()` 부분 미적용 가능 → production build에서만 SW 헤더 검증.
- **Follow-ups:** F-PUSH-3 (오프라인 캐싱 필요 시 Workbox/serwist 재검토).

### ADR-002 — Vercel Cron + pg_cron 폴백
- **Decision:** Vercel Cron 5분 슬롯 + Bearer-secret Route Handler. pg_cron 폴백 SQL을 003 마이그에 주석 처리하여 동봉. dual-trigger는 outbox UNIQUE로 안전.
- **Drivers:** `web-push` Node.js lib 호환, 비밀 관리 1곳, 폴백 가능성.
- **Alternatives Considered:** Supabase pg_cron 단독 (Edge Function Deno에서 web-push 미호환), GitHub Actions cron (5분 best-effort).
- **Why Chosen:** 5분 SLO 보장 + `web-push` 호환 + 운영 단순. Vercel Pro 미체결 시 폴백 활성화 한 줄.
- **Consequences:** Vercel Pro 결제 결정 stakeholder 미확인 (OQ-1). 폴백 활성화 시 **`ALTER DATABASE postgres SET app.cron_secret = '<secret>'`** 또는 `supabase secrets set` 절차 선행 필수 (Architect patch #4).
- **Follow-ups:** F-PUSH-4 (Vercel Pro 확정 또는 pg_cron 활성화 결정).

### ADR-003 — outbox + `order_status_log_id` FK
- **Decision:** `notifications_outbox` 신규 테이블 + `(order_id, status_key, channel)` UNIQUE + `order_status_log_id NOT NULL FK ON DELETE CASCADE`.
- **Drivers:** 멱등성 = UNIQUE 제약, channel 컬럼으로 알림톡 후속 자연 확장, audit/operations 책임 분리, JOIN 경로 자명화.
- **Alternatives Considered:** status_logs 컬럼 추가 (audit 무결성 훼손), Redis stream (인프라 추가).
- **Why Chosen:** `order_status_logs.changed_by → admin_users(id)` 사실(`002_redesign.sql:246`)이므로 customer email 추출은 `outbox → status_logs → orders → profiles` JOIN 필요. log_id FK가 이 경로 명시화.
- **Consequences:** 테이블 1개 추가, dispatcher INSERT-then-dispatch 순서 + 동일 트랜잭션 내 status_log+outbox INSERT 엄수 필수 (Architect patch #2).
- **Follow-ups:** outbox 90일 retention 정책 (F-PUSH-5).

### ADR-004 — Milestone 5개 + Spoiler 필터 제거
- **Decision:** `MILESTONE_STATUS_KEYS = [CARD_DELIVERY_PENDING, DISTRIBUTOR_SHIPPED, GRADE_CONFIRMED, READY_FOR_PICKUP, COMPLETED]`. spoiler 필터 분기 dispatcher에서 완전 제거.
- **Drivers:** spec Non-Goal "v1.0 ON/OFF 단일 스위치" 정합, payload PII 부재로 spoiler 무관, stepper 통합 정책 존중.
- **Alternatives Considered:** spoiler 필터 유지(spec 위반), 7개 milestone(stepper 충돌), 3개 milestone(spec AC 11번 "4~5개" 위반).
- **Why Chosen:** payload는 "주문 상태가 업데이트되었습니다"로 grade 미노출 → 알림 레벨 spoiler 보호 무의미. 사용자가 앱 열면 mypage 기존 spoiler 로직이 grade 가림. **미묘 트레이드오프:** push 도달 자체가 "grade 결정됨" 신호이지만, 본 v1.0은 이 신호가 spoiler 의도와 충돌하지 않는다고 판단(payload에 grade 미포함이고 mypage UI가 1차 가림 책임).
- **Consequences:** `outbox.skipped_reason` 컬럼은 다른 skip 사유(구독 0건, VAPID 환경 누락) 위해 유지. TRAINERS_ARRIVED 의도적 제외, 코드 주석으로 cite (`src/constants/grading.ts:65-67`).
- **Follow-ups:** v1.1 사용자 선호 milestone 토글 시 분기 추가 (F-PUSH-6).

### ADR-005 — 003 마이그 + RLS + temp-auth Case B
- **Decision:** `push_subscriptions(email + nullable user_id)` + `notifications_outbox(+ order_status_log_id FK ON DELETE CASCADE)` + RLS service_role only + admin SELECT outbox. **temp-auth 쿠키는 서명되지 않음 (`src/lib/auth/temp-auth.ts:1-67` 직접 검증) — subscribe route는 email이 `TEMP_ACCOUNTS` 하드코딩 allowlist 멤버임을 server-side 강제 검증.**
- **Drivers:** PII 최소화, 변조 가능 입력 신뢰 금지, F-PUSH-1로 정식 `auth.uid()` 이행 경로 확보.
- **Alternatives Considered:**
  - (i) one-time email confirm token: UX 저하.
  - (ii) push 자체를 F-PUSH-1 후로 보류: 출시 지연.
  - (iii) temp-auth 자체에 HMAC 서명 추가: 곧 삭제될 모듈 매몰 비용.
- **Why Chosen:** allowlist 검증이 최소 코드로 변조 위험 실질 차단. F-PUSH-1 후 `auth.uid()` 자연 대체.
- **Consequences:** v1.0 push subscribe는 `TEMP_ACCOUNTS` 2개 계정 한정 (dev/staging 정책). prod 외부 사용자 출시는 F-PUSH-1 머지 후. 본 사실은 §0.2에 명문화.
- **Follow-ups:** F-PUSH-1 (Supabase Auth 마이그 후 user_id NOT NULL flip + RLS `auth.uid()` 정책).

---

## §3 Pre-mortem 15 시나리오 (5결정 × 3)

각 시나리오: `Scenario / Cause / Mitigation / Detection / Recovery`.

### 결정 1 (수동 SW)

**1.1 SW 버전 skew**
- **Scenario:** 캐시된 클라이언트 SW가 새 dispatch 페이로드 contract(예: 신규 `data.deepLink` 키) 미지원.
- **Cause:** SW 자동 업데이트 24h stale 정책.
- **Mitigation:** SW 상단 `const SW_VERSION = "1.0.0"` 상수, payload에 `v` 필드, mismatch 시 `self.registration.update()` 트리거.
- **Detection:** 구조화 로그 `[push] sw version mismatch client=<v> server=<v>` (admin route surface).
- **Recovery:** 24h `skipWaiting()` 자연 만료, 긴급 시 SW URL query bust.

**1.2 Service-Worker-Allowed 헤더 누락**
- **Scenario:** scope=/ 등록 silent fail.
- **Cause:** `next.config.ts headers()` 누락 또는 Turbopack dev 무시.
- **Mitigation:** Phase A2에 production build에서 `curl -I /sw.js` smoke step 명시.
- **Detection:** 클라이언트 `navigator.serviceWorker.register` reject.
- **Recovery:** 헤더 추가 재배포; 영향은 신규 구독자 한정.

**1.3 Chrome install criteria 변경**
- **Scenario:** maskable icon 필수화 등 정책 변동으로 PWA installable 안 됨.
- **Cause:** Chrome 향후 버전 정책 변경.
- **Mitigation:** manifest icons `purpose: "any maskable"` 양쪽, display/start_url/theme/background 모두 명시.
- **Detection:** Lighthouse `installable-manifest` audit fail.
- **Recovery:** 누락 필드 보강 PR.

### 결정 2 (Vercel Cron)

**2.1 Cron 60s 타임아웃 mid-batch**
- **Scenario:** 100 outbox rows × 150ms web-push API = 15s, p99 외부 지연 시 60s 초과 livelock.
- **Cause:** 외부 push service 지연 + 누적 backlog.
- **Mitigation:** `LIMIT 100` + `SELECT FOR UPDATE SKIP LOCKED` (R2), 내부 50s timeout, 미처리는 다음 슬롯.
- **Detection:** 로그 `[push] dispatched count=<n> duration_ms=<ms>`, ms > 50000 warn.
- **Recovery:** 자동 (다음 cron). 누적 시 admin route backlog 가시화.

**2.2 CRON_SECRET 유출**
- **Scenario:** 외부에서 dispatch 폭격.
- **Cause:** env 유출, 로그 노출.
- **Mitigation:** `crypto.timingSafeEqual` route handler 내부 검증 (R4), secret rotation runbook (Vercel env + `current_setting` 갱신), outbox UNIQUE로 중복 발송 차단.
- **Detection:** dispatch 호출 빈도 비정상 spike.
- **Recovery:** secret rotation, redeploy.

**2.3 Vercel infra 5분 슬롯 누락**
- **Scenario:** 한두 슬롯 skip → 10분 지연.
- **Cause:** Vercel infra 장애.
- **Mitigation:** spec 5분 SLO는 단일 슬롯 누락 허용(degrade), pg_cron 폴백 활성화 가능.
- **Detection:** admin route "마지막 성공 dispatch 시각" > 10분 초과.
- **Recovery:** 자동 catch-up; 반복 시 폴백 활성화.

### 결정 3 (Outbox)

**3.1 UNIQUE 위반 race**
- **Scenario:** 동시 cron 두 번 호출 (Vercel + pg_cron 또는 manual).
- **Cause:** dual-trigger.
- **Mitigation:** UNIQUE 제약, INSERT는 `ON CONFLICT (order_id, status_key, channel) DO NOTHING`.
- **Detection:** PG 로그 `duplicate key value` (정상 동작).
- **Recovery:** 자동.

**3.2 INSERT 후 push 발송 실패**
- **Scenario:** outbox row 생성 후 web-push API 실패 → 발송 누락.
- **Cause:** 외부 push service 일시 장애.
- **Mitigation:** `dispatched_at IS NULL AND attempt_count < 5` 다음 cron 재시도, `last_error` 기록. **status_log INSERT와 outbox INSERT는 동일 트랜잭션** (Architect patch #2).
- **Detection:** admin observability route "재시도 중" 카운터.
- **Recovery:** 자동 재시도, 5회 초과 시 dead letter (수동 개입).

**3.3 status_key가 milestone 집합에서 누락**
- **Scenario:** dispatcher가 영원히 dispatch 안 함.
- **Cause:** MILESTONE_STATUS_KEYS sync drift.
- **Mitigation:** `satisfies readonly OrderStatus[]` 컴파일 타임 (R1).
- **Detection:** smoke 스크립트 typecheck step + "TRAINERS_ARRIVED → outbox 0건" 케이스 (Architect patch #5).
- **Recovery:** 상수 갱신 + 재배포.

### 결정 4 (Milestones)

**4.1 운영자 backdate로 같은 milestone 재트리거**
- **Scenario:** GRADE_CONFIRMED→DISTRIBUTOR_SHIPPED→GRADE_CONFIRMED 되돌림.
- **Cause:** 운영자 실수.
- **Mitigation:** outbox UNIQUE `(order_id, status_key, channel)`이 두 번째 INSERT 차단.
- **Detection:** PG 로그 + 운영자 가시 결과(push 미수신).
- **Recovery:** 의도적 재발송 시 outbox row 수동 삭제 + status 재set runbook.

**4.2 신규 milestone 도입 mass backfill 폭격**
- **Scenario:** 새 milestone 추가 PR이 기존 모든 order에 status_log INSERT 트리거 → 전체 사용자 폭격.
- **Cause:** 마이그 dry-run 미실행.
- **Mitigation:** 마이그 SQL 작성 시 `notifications_outbox` 사전 INSERT (`dispatched_at = now()`)로 dummy row로 발송 차단 runbook (ADR-004 명시).
- **Detection:** staging dry-run에서 outbox row 폭증.
- **Recovery:** dispatch route 즉시 disable + outbox cleanup.

**4.3 ORDER_STATUS 변경(8 → 9단계) MILESTONE 상수 sync 깨짐**
- **Scenario:** OrderStatus 키 rename → 미발송.
- **Cause:** PR 리뷰 누락.
- **Mitigation:** `satisfies readonly OrderStatus[]` 컴파일 타임 빨간 줄 (R1 흡수).
- **Detection:** `pnpm tsc --noEmit` CI step.
- **Recovery:** MILESTONE_STATUS_KEYS 갱신 PR.

### 결정 5 (003 마이그 + RLS + temp-auth)

**5.1 `auth.users` row 삭제 후 매핑 실패 좀비 row**
- **Scenario:** F-PUSH-1 시점 customer 탈퇴 후 재가입 → user_id 매핑 unmatched.
- **Cause:** F-PUSH-1 자동 매핑 SQL의 LEFT JOIN unmatched.
- **Mitigation:** F-PUSH-1 마이그가 unmatched row를 `expired_at = now()` 처리.
- **Detection:** F-PUSH-1 dry-run SELECT count `WHERE user_id IS NULL AND expired_at IS NULL`.
- **Recovery:** 좀비 row는 expired_at으로 dispatch 제외.

**5.2 anon client가 push_subscriptions 직접 select**
- **Scenario:** 개발자 실수로 client.ts에서 `from("push_subscriptions").select()`.
- **Cause:** RLS 정책 부재 = anon DENY.
- **Mitigation:** RLS enabled + 정책 부재 default DENY.
- **Detection:** smoke 테스트가 anon 클라이언트로 select 시도, empty result 검증.
- **Recovery:** 코드 수정 (RLS 이미 차단).

**5.3 ON CONFLICT (endpoint) DO UPDATE ownership 변조**
- **Scenario:** A 사용자가 B 사용자의 endpoint를 알아내 자신 email로 INSERT 시도.
- **Cause:** `ON CONFLICT DO UPDATE`가 email 덮어씀.
- **Mitigation:** route handler가 INSERT 전 SELECT로 기존 email 확인, mismatch면 409.
- **Detection:** 로그 `[push] subscribe rejected reason=ENDPOINT_OWNERSHIP_MISMATCH`.
- **Recovery:** 정상 거부.

---

## §4 Implementation Plan (Phase A~E)

### Phase A — Foundation (마이그 + 상수 + spec patch + env)

| ID | Task | Files | Verify |
|----|------|-------|--------|
| A0 | Spec 본문 patch | `.omc/specs/deep-interview-pwa-push.md` (14단계→8단계, AC#11 키 갱신) | git diff 검토 |
| A1 | 003 마이그 작성 | `supabase/migrations/003_pwa_push.sql` | `supabase db reset` + `\d push_subscriptions/notifications_outbox` |
| A2 | notifications 상수 | `src/constants/notifications.ts` (신규) | `pnpm tsc --noEmit` |
| A3 | env + 문서 | `.env.local.example`, `CLAUDE.md`, README | dev 시작 시 missing env 워닝 |
| A4 | web-push 의존성 | `pnpm add web-push @types/web-push` | `pnpm build` 통과 |

**003_pwa_push.sql 핵심 (Critic patch 6a 통합):**

```sql
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_email TEXT NOT NULL,
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- nullable until F-PUSH-1
  endpoint        TEXT NOT NULL UNIQUE,
  p256dh          TEXT NOT NULL,
  auth_key        TEXT NOT NULL,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expired_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_push_subs_email_active
  ON push_subscriptions(subscriber_email) WHERE expired_at IS NULL;

CREATE TABLE IF NOT EXISTS notifications_outbox (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_status_log_id UUID NOT NULL REFERENCES order_status_logs(id) ON DELETE CASCADE,
  status_key          TEXT NOT NULL,
  channel             TEXT NOT NULL DEFAULT 'web_push',
  dispatched_at       TIMESTAMPTZ,
  attempt_count       INT NOT NULL DEFAULT 0,
  last_error          TEXT,
  skipped_reason      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notifications_outbox_unique UNIQUE (order_id, status_key, channel)
);
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON notifications_outbox(created_at)
  WHERE dispatched_at IS NULL AND skipped_reason IS NULL;
CREATE INDEX IF NOT EXISTS idx_outbox_log ON notifications_outbox(order_status_log_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications_outbox ENABLE ROW LEVEL SECURITY;
-- service_role implicit ALL; anon/authenticated DENY (no policies until F-PUSH-1).
CREATE POLICY outbox_admin_select ON notifications_outbox
  FOR SELECT USING (is_admin()); -- §B6 role gating은 application-layer (ADR-005 see §B6)

-- -- Optional pg_cron fallback (uncomment if Vercel Cron unavailable)
-- -- Bootstrap (one-time, run once outside migration):
-- --   ALTER DATABASE postgres SET app.cron_secret = '<secret>';   (Architect patch #4)
-- --   또는 supabase secrets set CRON_SECRET=<secret>
-- -- Requires pg_net extension: SELECT * FROM pg_extension WHERE extname='pg_net';
-- SELECT cron.schedule('push_dispatch_5min', '*/5 * * * *', $$
--   SELECT net.http_get(
--     url := 'https://<host>/api/push/dispatch',
--     headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.cron_secret'))
--   );
-- $$);
```

### Phase B — Server (subscribe / dispatch / VAPID / observability)

| ID | Task | Files | Notes |
|----|------|-------|-------|
| B1 | VAPID 모듈 | `src/lib/push/vapid.ts` | `getWebPushClient()` setup |
| B2 | subscribe route | `src/app/api/push/subscribe/route.ts` | TEMP_ACCOUNTS allowlist 검증 + endpoint ownership 가드 |
| B3 | unsubscribe route | `src/app/api/push/unsubscribe/route.ts` | endpoint hash로 expired_at 채움 |
| B4 | dispatch route | `src/app/api/push/dispatch/route.ts` (`runtime: 'nodejs'`) | Bearer `timingSafeEqual` (R4), `LIMIT 100 + FOR UPDATE SKIP LOCKED` (R2), JOIN customer email, 410→expired_at, **로그 마스킹: endpoint/p256dh/auth는 prefix 8자만** (Critic patch 6b) |
| B5 | status change → outbox INSERT | admin Server Action 또는 `order_status_logs` AFTER INSERT trigger | **status_log + outbox 동일 트랜잭션 INSERT** (Architect patch #2). status_key가 MILESTONE_STATUS_KEYS에 포함될 때만 outbox INSERT |
| B6 | admin observability route | `src/app/(admin)/admin/notifications/page.tsx` (Server Component) | 24h 실패 row, 실패율, 마지막 성공 시각. **권한: SUPER_ADMIN/GRADING_MANAGER 한정** (Architect patch #3) — `getAdminRole()`로 application-layer 가드, fallback unauthenticated → 403 |

**B4 dispatcher 핵심 SQL 패턴:**

```sql
-- Pending pick (lock-safe)
SELECT o.id, o.order_id, o.order_status_log_id, o.status_key,
       p.email AS subscriber_email
FROM notifications_outbox o
JOIN order_status_logs l ON l.id = o.order_status_log_id
JOIN orders ord ON ord.id = o.order_id
JOIN profiles p ON p.id = ord.customer_id
WHERE o.dispatched_at IS NULL AND o.skipped_reason IS NULL AND o.attempt_count < 5
ORDER BY o.created_at
LIMIT 100
FOR UPDATE SKIP LOCKED;
```

**B6 admin role gating 패턴:**

```ts
// src/app/(admin)/admin/notifications/page.tsx
const session = await getAdminSession();
if (!session || !["SUPER_ADMIN", "GRADING_MANAGER"].includes(session.role)) {
  redirect("/admin"); // or 403
}
```

### Phase C — Client (manifest / SW / mypage 토글)

| ID | Task | Files | Notes |
|----|------|-------|-------|
| C1 | manifest | `src/app/manifest.ts` | name, display=standalone, scope=/, theme=#1a237e, icons any+maskable |
| C2 | Service Worker | `public/sw.js` | classic worker, push + notificationclick, SW_VERSION 상수 |
| C3 | next.config 헤더 + 등록 | `next.config.ts`, `src/components/pwa/service-worker-register.tsx` | `Service-Worker-Allowed: /`, `Cache-Control: no-cache`. (user) layout에 등록 컴포넌트 마운트 |
| C4 | iOS install banner | `src/components/pwa/install-banner.tsx` | iOS Safari 16.4+ 감지, dismiss 7일 쿨다운 |
| C5 | mypage push toggle | `src/components/mypage/push-toggle.tsx`, `src/app/(user)/mypage/profile/page.tsx` 통합 | 권한 요청 + subscribe API 호출 |

### Phase D — Vercel Cron 등록

| ID | Task | Files | Notes |
|----|------|-------|-------|
| D1 | vercel.json crons | `vercel.json` | `crons: [{ path: "/api/push/dispatch", schedule: "*/5 * * * *" }]` |
| D2 | Vercel env 입력 | Vercel 대시보드 | VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET (스크린샷 capture) |
| D3 | pg_cron 폴백 runbook | `docs/qa/push-pg-cron-fallback.md` | Vercel Pro 미체결 시 활성화 절차 (`ALTER DATABASE` 포함) |

### Phase E — Test Plan + Lighthouse + 문서 (4영역)

> Test runner 부재 명시: Vitest/Jest 도입은 deferred (F-PUSH-2). 본 plan은 smoke 스크립트 + 매뉴얼 체크리스트로 구성.

#### §E.1 Unit-equivalent — `scripts/smoke-push.mjs` (Node ESM)

- `pnpm tsc --noEmit` typecheck (MILESTONE_STATUS_KEYS satisfies)
- web-push 페이로드 서명 round-trip (VAPID + payload encryption)
- outbox UNIQUE 위반 시뮬: 같은 (order_id, status_key, channel) INSERT 두 번 → 두 번째 `duplicate key`
- anon Supabase client로 push_subscriptions select → empty (RLS deny)
- endpoint hijack 시뮬: 동일 endpoint, 다른 email INSERT → 409
- **TRAINERS_ARRIVED 입력 → outbox INSERT 0건 검증** (Architect patch #5)
- 실행: `node --env-file=.env.local scripts/smoke-push.mjs`

#### §E.2 Integration — `docs/qa/push-smoke.md`

- 로컬 `supabase start` recipe (003 마이그 적용 → `\d push_subscriptions`, `\d notifications_outbox`)
- order status 변경 → outbox row INSERT → curl `/api/push/dispatch` (Bearer 헤더) → outbox `dispatched_at` 채움 검증
- **Lighthouse PWA score ≥ 90/100** (Required #10), production build에서만:
  - `installable-manifest`, `service-worker`, `themed-omnibox`, `viewport`, `apple-touch-icon`, `maskable-icon`, `is-on-https`(prod) 모두 PASS

#### §E.3 E2E — 매뉴얼 체크리스트 (spec AC #1~#6 + launch)

- [ ] AC#1: mypage 토글 ON → 권한 허용 → push_subscriptions row 생성
- [ ] AC#2: 관리자 status 변경 → 5분 이내 push 수신
- [ ] AC#3: 푸시 탭 → `/mypage/orders/[id]` 정확 deeplink
- [ ] AC#4: 동일 milestone 두 번 set → push 1회 (idempotency)
- [ ] AC#5: 만료 endpoint → 410 → push_subscriptions.expired_at 자동 채움
- [ ] AC#6: iOS Safari 16.4+ InstallBanner 노출, Android Chrome 미노출
- [ ] **Launch checklist: prod VAPID 키 발급 완료 (NEXT_PUBLIC_VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT 모두 staging≠prod 분리 확인)** (Critic patch 6d)

#### §E.4 Observability — 구조화 로그 명세

필수 로그 라인:
- `[push] dispatch failed orderId=<id> error=<code>`
- `[push] subscription expired endpoint=<hash>`
- `[push] vapid env missing`
- `[push] dispatched count=<n> duration_ms=<ms>`
- `[push] subscribe rejected reason=<TEMP_ACCOUNTS_ABSENT|ENDPOINT_OWNERSHIP_MISMATCH>`
- `[push] sw version mismatch client=<v> server=<v>`

**로그 PII 마스킹** (Critic patch 6b): endpoint/p256dh/auth는 prefix 8자만 기록 (`endpoint=https://fcm...`).

admin route(B6)에서 위 로그를 outbox `last_error` 컬럼 + 실패율로 surface.

#### §E.5 Korean string presence/absence greps

**MUST be present:**
```bash
grep -F "그레이딩 진행 알림" src/constants/notifications.ts
grep -F "주문 상태가 업데이트되었습니다" src/constants/notifications.ts
grep -F "홈 화면에 추가하면 알림을 받을 수 있어요" src/components/pwa/install-banner.tsx
```

**MUST be absent (PII 누출 방지):**
```bash
# payload body에 주문번호 패턴, 카드 정보, 등급사명 부재
grep -rE "주문번호.*[0-9]{8}-[0-9]+" src/lib/push/
grep -rFi "PSA\|BGS\|CGC\|BRG" src/lib/push/
```

---

## §5 Acceptance Criteria 매핑

| AC ID | spec AC | Phase | 검증 방법 |
|-------|---------|-------|----------|
| AC-1 | manifest.ts | C1 | E.2 Lighthouse `installable-manifest` |
| AC-2 | SW push/notificationclick | C2, C3 | E.3 manual #1, #3 |
| AC-3 | next.config PWA 통합 (무 플러그인) | C3 | E.2 `curl -I /sw.js` |
| AC-4 | DB 마이그 003 + RLS + 인덱스 | A1 | E.2 supabase start + `\d` |
| AC-5 | notifications.ts | A2 | E.1 typecheck |
| AC-6 | dispatcher (410 처리) | B4 | E.3 manual #5 |
| AC-7 | subscribe route | B2 | E.3 manual #1 |
| AC-8 | unsubscribe route | B3 | E.3 manual (curl) |
| AC-9 | dispatch route + cron-secret | B4 | E.1 Bearer 검증 |
| AC-10 | mypage 구독 토글 | C5 | E.3 manual #1 |
| AC-11 | iOS InstallBanner | C4 | E.3 manual #6 |
| AC-12 | 5개 milestone 확정 | A2 (§0) | E.1 satisfies + smoke |
| AC-13 | E2E 시나리오 1~6 | E.3 | manual checklist |
| AC-14 | Lighthouse PWA pass | E.2 | score ≥ 90 |
| AC-15 | VAPID env + 문서 | A3, E.3 | launch checklist |
| AC-16 | Auth cutover 플레이북 | F-PUSH-1 stub | §9 |

---

## §6 Risk Register

| ID | Risk | Severity | Mitigation | Round 변동 |
|----|------|----------|-----------|-----------|
| R1 | SW 캐시 stale (버전 skew) | M | SW_VERSION + payload v 필드 | Round 2 신규 (Pre-mortem 1.1) |
| R2 | Cron 60s 타임아웃 | M | LIMIT 100 + FOR UPDATE SKIP LOCKED | Round 2 보강 |
| R3 | CRON_SECRET 유출 | H | timingSafeEqual + rotation runbook | Round 2 보강 |
| R4 | Vercel Pro 미체결 | H | pg_cron 폴백 SQL 동봉 + ALTER DATABASE 절차 | Round 2 신규 |
| R5 | UNIQUE race | L | UNIQUE + ON CONFLICT DO NOTHING | 동일 |
| R6 | dispatch 실패 누락 | M | attempt_count 재시도, dead letter 5회 | 동일 |
| R7 | MILESTONE 상수 sync 깨짐 | M | satisfies readonly OrderStatus[] | Round 2 보강 |
| R8 | **temp-auth 쿠키 변조** | **H** | TEMP_ACCOUNTS allowlist server-side 검증 | Round 2 갱신 (Case B) |
| R9 | endpoint hijack | M | route handler ownership 가드 | Round 2 신규 |
| R10 | RLS 누락 | H | ENABLE RLS, 정책 부재=DENY | 동일 |
| R11 | 신규 milestone backfill 폭격 | H | 사전 dummy outbox INSERT runbook (ADR-004) | Round 2 신규 |
| R12 | Lighthouse PWA fail | L | manifest 필드 전수 + maskable | Round 2 보강 |
| R13 | VAPID 키 환경 혼재 (staging→prod 발송) | M | .env 환경별 분리, launch checklist 검증 | Round 2 신규 (R3 Recommended) |
| R14 | order_status_log_id FK CASCADE 의도하지 않은 삭제 전파 | L | ON DELETE CASCADE 명시 (의도된 동작), retention 정책 분리 | Round 2 신규 (Critic patch 6a) |

---

## §7 Open Questions

| ID | Question | Why matters | Owner | Due |
|----|----------|------------|-------|-----|
| OQ-1 | Vercel Pro 결제 확정/포기 | 5분 cron 보장 vs pg_cron 폴백 활성화 | hello@trainers.kr | Phase D 시작 전 |
| OQ-2 | F-PUSH-1 일정 | TEMP_ACCOUNTS 한정 정책 종료 시점 | hello@trainers.kr | auth-supabase-migration 머지 후 2주 |
| OQ-3 | VAPID 키 환경별 발급 (dev/staging/prod 3쌍) | 키 유출 시 환경 격리 | hello@trainers.kr | Phase A3 |
| OQ-4 | iOS InstallBanner 카피 검토 | "홈 화면에 추가하면 알림을 받을 수 있어요" | hello@trainers.kr | Phase C4 |
| OQ-5 | outbox retention 정책 (90일/1년) | F-PUSH-5 마이그 입력 | hello@trainers.kr | 출시 후 1개월 |
| OQ-6 | Spec patch (A0) 본 PR 포함 여부 | 리뷰 단위 결정 | planner | A0 시점 |

---

## §8 Test Runner Decision: Deferred to F-PUSH-2

본 plan은 자동화 test runner(Vitest/Jest) 도입을 시도하지 않는다. `auth-supabase-migration.md` §F3와 동일 전략:
- §E.1 smoke 스크립트 + §E.2 supabase 로컬 통합 검증 + §E.3 매뉴얼 체크리스트 + §E.4 구조화 로그 + §E.5 grep
- F-PUSH-2 (별도 PR)에서 Vitest 도입 + smoke를 unit test로 전환

---

## §9 Follow-Ups (F-Series, Critic patch 6c)

| ID | Title | Description | Depends on | Owner |
|----|-------|-------------|------------|-------|
| **F-PUSH-1** | Auth cutover: subscriber_email → user_id | Supabase Auth 마이그 머지 후 `UPDATE push_subscriptions SET user_id = u.id FROM auth.users u WHERE u.email = subscriber_email`. unmatched는 `expired_at = now()`. RLS를 `auth.uid() = user_id`로 강화. TEMP_ACCOUNTS allowlist 검증 제거. **prod 외부 사용자 합류 게이트.** | auth-supabase-migration 머지 | hello@trainers.kr |
| **F-PUSH-2** | Test runner 도입 (Vitest) | smoke-push.mjs를 unit test로 전환, integration test framework 추가 | F-PUSH-1 | TBD |
| **F-PUSH-3** | 오프라인 캐싱 도입 검토 | mypage 캐시, serwist/Workbox 비교 ADR | v1.x 운영 1개월 후 | TBD |
| **F-PUSH-4** | Vercel Pro 결정 closing | OQ-1 결과 따라 pg_cron 폴백 활성화 또는 Vercel Pro 결제 확정 | OQ-1 | hello@trainers.kr |
| **F-PUSH-5** | Outbox retention 정책 | 90일/1년 결정 + cleanup cron + outbox archive 정책 | 출시 후 1개월 | TBD |
| **F-PUSH-6** | per-event milestone toggle UI | mypage에서 사용자 선호 milestone 부분집합 선택 (v1.1) | F-PUSH-1, sufficient v1.0 운영 데이터 | TBD |
| **F-PUSH-7** | Kakao Alimtalk 채널 추가 | `notifications_outbox.channel = 'alimtalk'` 자연 확장 | spec 결정 변경 | TBD |
| **F-PUSH-FOLLOWUP-A** ✅ | Database typed client + as any 제거 | **RESOLVED 2026-05-12**: database.types.ts에 orders/profiles/order_status_logs 최소 컬럼 추가, dispatcher.ts에 SupabaseClient<Database>/WebPushClient 타입 적용, JoinedOutboxRow 정의 + `.returns<>()` 사용, eslint-disable 5개 제거. tsc 0 errors, build 23/23 pass. | Phase 3 typed client | DONE |
| **F-PUSH-FOLLOWUP-B** | Smoke case 8: dispatcher integration dry-run | Supabase URL 있을 때 dispatcher 실 호출 (FK satisfied seed → endpoint stub → expected stats) | F-PUSH-2 | TBD |
| **F-PUSH-FOLLOWUP-C** | dispatcher 함수 분리 | pickPendingDispatches/processOutboxRow/sendToEndpoint 3개로 split | F-PUSH-2 (Vitest) | TBD |
| **F-PUSH-FOLLOWUP-D** ✅ | dispatch + notifications route force-dynamic | **RESOLVED 2026-05-12**: /api/push/dispatch, subscribe, unsubscribe + admin/notifications/page.tsx 4곳에 `export const dynamic = "force-dynamic"` 추가. 빌드 라우트맵에서 4곳 모두 `ƒ Dynamic` 확인. | - | DONE |
| **F-PUSH-FOLLOWUP-E** | admin role-aware RLS | 003 outbox_admin_select policy를 admin_users.role IN(SUPER_ADMIN, GRADING_MANAGER)로 강화 | F-PUSH-1 | TBD |
| **F-PUSH-FOLLOWUP-F** ✅ | manifest start_url UX | **RESOLVED 2026-05-12 (정책 유지)**: middleware 분석 결과 `/login`은 보호 경로가 아니어서 비로그인 PWA launch 시 `/mypage → /login?redirect=/mypage` 단일 redirect만 발생, redirect loop 없음. PWA 핵심 용도가 주문 추적이므로 `start_url="/mypage"` 유지. 변경 없음. | - | DONE |

---

## §10 Final Verdict

**RALPLAN consensus reached** — APPROVE with 6 patches integrated inline:
1. ✅ Architect Patch #1: §0.2 v1.0 release scope 명문화
2. ✅ Architect Patch #2: §B5 동일 트랜잭션 status_log + outbox INSERT
3. ✅ Architect Patch #3: §B6 SUPER_ADMIN/GRADING_MANAGER 한정
4. ✅ Architect Patch #4: ADR-002 ALTER DATABASE bootstrap 절차
5. ✅ Architect Patch #5: §E.1 TRAINERS_ARRIVED → outbox 0건 케이스
6. ✅ Critic R2 Patch (6 sub-items): order_status_log_id ON DELETE CASCADE / dispatcher 로그 마스킹 / F-Series stubs / launch checklist VAPID 발급

**다음 단계:** autopilot Phase 2 (Execution) 진입. Phase 0+1(Expansion + Planning)은 본 plan으로 대체됨.

**산출물 위치:**
- Spec: `.omc/specs/deep-interview-pwa-push.md`
- Plan: `.omc/plans/pwa-customer-push-v1.md` (본 파일)

**Co-Authored-By:** Claude (deep-interview + ralplan consensus, Round 2)
