# Deep Interview Spec: PWA Web Push for Customer Order Milestones

## Metadata
- Interview ID: tg-pwa-push-2026-05-10
- Rounds: 7
- Final Ambiguity Score: 11%
- Type: brownfield
- Generated: 2026-05-10
- Threshold: 0.20
- Initial Context Summarized: no
- Status: PASSED

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.95 | 0.35 | 0.3325 |
| Constraint Clarity | 0.80 | 0.25 | 0.2000 |
| Success Criteria | 0.90 | 0.25 | 0.2250 |
| Context Clarity | 0.90 | 0.15 | 0.1350 |
| **Total Clarity** | | | **0.8925** |
| **Ambiguity** | | | **0.1075** |

## Goal

트레이너스 그레이딩 프록시 서비스의 **고객 전용 PWA Web Push** 기능을 구축한다. 고객이 mypage에서 푸시 알림을 구독한 뒤, 본인 주문이 8단계 상태 흐름 중 4~5개의 핵심 이정표(milestone) 이벤트로 전환될 때 5분 이내에 푸시를 수신한다. 알림을 탭하면 해당 주문 상세(`/mypage/orders/[id]`)로 딥링크된다. 페이로드는 개인정보(주문번호·카드 정보·등급사명) 노출을 최소화하여 잠금화면·푸시 서비스 로그에 PII가 남지 않게 한다.

## Constraints

- **채널**: Web Push 단독. 카카오 알림톡 연동은 이번 범위 외(env 변수만 정의되어 있고 구현 0).
- **수신 대상**: 고객(`(user)/**` 경로 사용자)만. 관리자 푸시·마케팅 푸시는 범위 외.
- **트리거 모델**: Supabase Postgres `order_status_logs` 테이블을 5분 간격 cron이 폴링하여 미발송 milestone 이벤트를 dispatch.
  - 인라인 동기 발송 아님 → 관리자 액션 응답 시간 영향 0
  - 멱등성: dispatch outbox에 발송 이력 기록하여 중복 발송 차단
- **인증 키잉**:
  - v1.0은 `temp-auth` 쿠키 세션의 이메일을 `push_subscriptions.subscriber_email`로 사용
  - Supabase Auth 마이그레이션 cutover 시 `subscriber_user_id uuid REFERENCES auth.users(id)` 컬럼을 추가하고 이메일→user_id 매핑 작업 1회만 실행
  - Auth 마이그 완료 후에도 이메일 컬럼은 PII 폴백 식별자로 유지하다가 후속 마이그에서 제거
- **iOS 정책**: Android/데스크톱(Chrome/Edge/Firefox) 우선. iOS Safari 16.4+ 감지 시 `홈화면에 추가` **패시브 배너만** 노출. 풀스크린 가이드·강제 모달 없음. 미설치 iOS 사용자 도달률 0% 수용.
- **Payload 정책**:
  - title = `"그레이딩 진행 알림"` (브랜드 이름 미노출, "트레이너스" 단어로 다른 푸시와 충돌 방지는 ralplan에서 검토)
  - body = `"주문 상태가 업데이트되었습니다"` (주문번호·상태명·등급사·카드 수량 모두 미노출)
  - data 필드에는 `{ orderId: string, statusKey: string }`을 담아 Service Worker가 `clients.openWindow('/mypage/orders/' + data.orderId)`로 처리
- **SLO**: 관리자 상태 변경 → 고객 디바이스 수신까지 P95 ≤ 5분 (cron 주기와 일치)
- **언어/시간대**: 한국어, Asia/Seoul. 메시지 문구는 i18n 미도입(기존 코드베이스가 한국어 하드코딩 패턴이므로 동일 패턴 유지)
- **VAPID 키**: 신규 환경변수 `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` 도입. `.env.local.example`에 추가하고 README/AGENTS.md 갱신.

## Non-Goals

- 카카오 알림톡 연동 (별도 프로젝트로 분리)
- 관리자용 운영 푸시(신규 주문 접수, 결제 완료 즉시 알림 등) (별도 프로젝트)
- 마케팅·공지 푸시(프로모션, 신규 등급사, marketingEnabled 동의 분기) (별도 프로젝트)
- iOS 설치 적극 유도 onboarding 플로우 / iOS 설치 전환율 디자이너 투자
- 5초 이내 실시간 발송, Postgres 트리거 + Edge Function 직결 발송 (느슨 SLO 채택으로 cron 폴링 구조)
- 푸시 사용자 per-event toggle UI (v1.0은 ON/OFF 단일 스위치만, per-event는 v1.1+)
- 다국어 메시지(영어 등)
- Web Push API의 silent push, encrypted payload custom 구현 (`web-push` 라이브러리 표준 사용)

## Acceptance Criteria

- [ ] `public/manifest.json` 또는 `app/manifest.ts` 추가, `display=standalone`, `scope=/`, `theme_color=#1a237e`(브랜드 primary), `name="트레이너스 그레이딩"`, 적절한 아이콘 세트
- [ ] Service Worker 등록 (`public/sw.js` 또는 `serwist`/`next-pwa` 통합) — `push` 이벤트, `notificationclick` 이벤트 핸들러 구현
- [ ] `next.config.ts`에 PWA 플러그인(`@serwist/next` 권장) 통합 — ralplan에서 `next-pwa` vs `serwist` 비교 결정
- [ ] DB 마이그 `003_pwa_push.sql` 신규 추가:
  - `push_subscriptions(id, subscriber_email, endpoint, keys_p256dh, keys_auth, user_agent, created_at, last_seen_at, expired_at)` + RLS
  - `notifications_outbox(id, order_id, status_key, dispatched_at, error)` 또는 `order_status_logs.push_dispatched_at` 컬럼 추가 (ralplan 결정)
  - 적절한 인덱스 (subscriber_email, endpoint UNIQUE)
- [ ] `src/types/notification.ts` 신규 — `PushSubscription`, `PushPayload`, `MilestoneStatusKey` 타입
- [ ] `src/lib/push/dispatcher.ts` — 5분 cron 진입점에서 outbox/logs 스캔, `web-push` 라이브러리로 발송, 410 Gone 응답 시 구독 자동 만료 처리
- [ ] `src/app/api/push/subscribe/route.ts` (POST) — 신규 구독 등록, temp-auth 쿠키 검증
- [ ] `src/app/api/push/unsubscribe/route.ts` (POST) — 구독 해지
- [ ] `src/app/api/push/dispatch/route.ts` (GET, cron-secret 헤더 검증) — Vercel/Supabase cron이 호출, dispatcher 실행
- [ ] mypage 신규 UI: 구독 토글 컴포넌트 (`src/components/mypage/push-toggle.tsx`) — 권한 요청, 구독 등록, 해지, 현재 상태 표시
- [ ] iOS Safari 16.4+ 감지 시 `<InstallBanner />` 컴포넌트 패시브 노출 (디스미스 가능, 7일 쿨다운)
- [ ] 5개 milestone status keys 확정 (ralplan 단계에서 stakeholder 확인). **확정 키**: `CARD_DELIVERY_PENDING`, `DISTRIBUTOR_SHIPPED`, `GRADE_CONFIRMED`, `READY_FOR_PICKUP`, `COMPLETED` (plan §0.1 정정 — PAID·OVERSEAS_SHIPPED·GRADING_COMPLETE·DELIVERED는 실제 OrderStatus union에 부재)
- [ ] E2E 검증 시나리오:
  - 1. 고객 로그인 → mypage 푸시 토글 ON → 브라우저 권한 허용 → DB에 subscription row 생성 확인
  - 2. 관리자가 해당 고객의 주문을 milestone 상태로 변경 → 5분 이내 cron이 dispatcher 호출 → 디바이스에 푸시 수신
  - 3. 푸시 탭 → `/mypage/orders/[id]`로 정확히 deeplink
  - 4. 동일 주문에 동일 milestone 상태가 다시 set되어도 중복 발송 안 됨 (idempotency)
  - 5. 고의로 만료된 endpoint를 등록 후 dispatch → 410 Gone 응답 → DB에서 자동 expired 처리
  - 6. iOS Safari 16.4+에서 mypage 접속 시 InstallBanner 노출, Android Chrome에서는 미노출
- [ ] Lighthouse PWA audit 통과 (installable + 충분한 manifest 메타데이터)
- [ ] VAPID 환경변수 3개 README/AGENTS.md 문서화 + `.env.local.example` 갱신
- [ ] Supabase Auth 마이그 cutover 플레이북에 "subscriber_email → auth.users.id 매핑" 작업 추가 문서화

## Assumptions Exposed & Resolved

| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| 푸시는 고객·관리자 양쪽에 보내야 한다 | Round 1: 청중 명시 요청 | 고객 전용으로 잠금. 관리자 푸시는 별도 프로젝트 |
| Web Push와 알림톡을 병행해야 한다 | Round 2: 채널 전략 명시화 | Web Push 단독, 알림톡은 별도 프로젝트로 분리 |
| 8단계 상태 변경 모두 푸시해야 한다 | Round 3: 트리거 부분집합 결정 | 핵심 이정표 5개 확정: CARD_DELIVERY_PENDING, DISTRIBUTOR_SHIPPED, GRADE_CONFIRMED, READY_FOR_PICKUP, COMPLETED (plan §0.1) |
| iOS는 어떻게든 지원해야 한다 | Round 4 (Contrarian): "iOS 도달률 0%여도 가치 있는가?" | Android/데스크톱 우선, iOS는 패시브 배너만 — iOS 설치 미전환 사용자 도달률 0% 수용 |
| 5초 이내 실시간 발송이 필요하다 | Round 5: SLO 명시 요청 | 5분 이내 폴링으로 충분, 관리자 UX 영향 0, 비용·구현 단순 |
| Supabase Auth 마이그 완료 후에야 push 출시 가능 | Round 6 (Simplifier): "정말 기다려야 하는가?" | temp-auth 위에서 즉시 출시, Auth cutover 시 단일 매핑 step만 추가 |
| Payload에 주문번호·상태명을 풀어서 보여줘야 한다 | Round 7: 개인정보 노출 수준 명시 | 상태명·주문번호 모두 미노출, body="주문 상태가 업데이트되었습니다", data에 orderId만 — 잠금화면·푸시 서비스 로그에 PII 0 |

## Technical Context

### 기존 코드베이스 사실 (explore 조사 결과)

| 영역 | 상태 | 영향 |
|---|---|---|
| `public/manifest.json`, `app/manifest.ts` | **없음** | 신규 작성 필요 |
| `next.config.ts` PWA 설정 | **없음** | 플러그인 통합 필요 (`@serwist/next` 권장) |
| Service Worker | **없음** | 신규 작성 필요 |
| `src/types/notification.ts` | **없음** | 신규 작성 필요 |
| `notifications` / `push_subscriptions` 테이블 | **없음** (002_redesign 미정의) | 003 마이그에서 신규 추가 |
| 카카오 알림톡 구현 | env만, 코드 0 | 범위 외 (이번 프로젝트 후 별도 프로젝트로) |
| `src/app/api/{auth,orders,payments}/` | 디렉터리 비어있음 | `src/app/api/push/` 신규 생성 (이번 프로젝트가 첫 API 라우트) |
| Auth | temp-auth 쿠키 기반 (`src/lib/auth/temp-auth.ts` + `src/lib/supabase/middleware.ts`) | 구독 키잉을 temp-auth 이메일로, Auth cutover 후 매핑 |
| 주문 상태 14 vs stepper 10 | `src/types/order.ts` + `src/constants/grading.ts`에 정의 | 5개 milestone subset은 stepper 10단계 안에서 선택 |
| Locale | 한국어 하드코딩, `Asia/Seoul`은 `toLocaleDateString('ko-KR')` 패턴 | 동일 패턴 유지 |
| 환경변수 | `KAKAO_ALIMTALK_*`, Supabase, Toss 정의됨. VAPID 없음 | VAPID 3종 신규 추가 |

### 기술 선택 권장 (ralplan 검증 대상)

- **PWA 플러그인**: `@serwist/next` (Next.js 15+ App Router 호환, workbox 후속작) 권장. 대안 `next-pwa`는 Next.js 13+에서 maintenance 미흡.
- **푸시 라이브러리**: 백엔드 `web-push` (Node.js 표준) 권장.
- **Cron 호스팅**: Vercel Cron 또는 Supabase pg_cron + Edge Function 호출. ralplan에서 비용·복잡도 비교.

## Ontology (Key Entities)

| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| Customer | core domain | email, role | has many Order, has many PushSubscription |
| Order | core domain | id (`YYYYMMDD-순번`), status, customer | has many OrderStatusLog, triggers MilestoneEvent |
| OrderStatus | supporting | 8-value union | drives MilestoneEvent classification |
| MilestoneEvent | core domain | orderId, statusKey, dispatchedAt | subset of OrderStatusLog (4~5 statuses) |
| PushNotification | core domain | title, body, data, sentAt | dispatched per MilestoneEvent per PushSubscription |
| PushSubscription | core domain | subscriberEmail, endpoint, keys_p256dh, keys_auth, userAgent, lastSeenAt, expiredAt | belongs to Customer (via temp-auth email), receives PushNotification |
| PushPayload | supporting | title="그레이딩 진행 알림", body="주문 상태가 업데이트되었습니다", data={orderId, statusKey} | shape of PushNotification |
| VAPIDKey | infra | publicKey (NEXT_PUBLIC_), privateKey, subject | signs PushNotification dispatch |
| ServiceWorker | infra | scope=/ | handles push, notificationclick events |
| WebManifest | infra | name, display=standalone, theme_color=#1a237e, icons | enables PWA install |
| InstallBanner | UI component | iOS Safari 16.4+ detection, dismiss cooldown | passive prompt for iOS |
| NotificationOutbox | infra | order_id, status_key, dispatched_at, error | tracks dispatch idempotency |
| DispatchCron | infra | 5-min interval | reads OutBox, calls dispatcher |
| TempAuthSession | supporting (legacy) | cookie email | identifies subscription owner pre-Auth-migration |

## Ontology Convergence

| Round | Entities | New | Changed | Stable | Stability Ratio |
|-------|----------|-----|---------|--------|----------------|
| 1 | 4 | 4 | 0 | 0 | N/A |
| 2 | 5 | 1 (VAPIDKey) | 0 | 4 | 80% |
| 3 | 6 | 1 (MilestoneEvent) | 0 | 5 | 83% |
| 4 | 9 | 3 (ServiceWorker, WebManifest, InstallBanner) | 0 | 6 | 67% |
| 5 | 11 | 2 (NotificationOutbox, DispatchCron) | 0 | 9 | 82% |
| 6 | 12 | 1 (TempAuthSession) | 0 | 11 | 92% |
| 7 | 13 | 1 (PushPayload) | 0 | 12 | 92% |

**수렴 분석**: 라운드 6~7에서 안정도 92%로 수렴. 새 엔티티는 기존 결정의 자연스러운 명시화이지 도메인 reframe이 아님.

## Interview Transcript

<details>
<summary>전체 Q&A (7 rounds)</summary>

### Round 1 — Goal Clarity 타깃
**Q:** 이번 PWA push 기능의 주된 수신 대상과 트리거 범위는 무엇인가요?
**A:** 고객 전용 - 주문 상태 변경 알림
**Ambiguity:** 60% (Goal: 0.50, Constraint: 0.10, Success: 0.15, Context: 0.55)

### Round 2 — Constraint Clarity 타깃
**Q:** Web Push는 주문 상태 알림의 유일한 채널인가요, 아니면 기존 카카오 알림톡을 병행·보완하나요?
**A:** Web Push 단독 - 알림톡 구현 안 함
**Ambiguity:** 60% (Goal: 0.50, Constraint: 0.40, Success: 0.15, Context: 0.60)

### Round 3 — Success Criteria 타깃
**Q:** PWA push v1.0을 "완성"되었다고 선언하려면 처리해야 하는 트리거 설계 철학은 무엇인가요?
**A:** 핵심 이정표 4~5개만 푸시
**Ambiguity:** 39% (Goal: 0.80, Constraint: 0.40, Success: 0.55, Context: 0.60)

### Round 4 — CONTRARIAN MODE — Constraint Clarity 타깃
**Q:** iOS 사용자의 push 수신을 위해 어느 수준까지 구현해야 하나요? (iOS PWA 설치 필수 조건의 도달률 트레이드오프 명시)
**A:** Android/데스크톱 우선, iOS 설치 배너만 안내
**Ambiguity:** 33% (Goal: 0.80, Constraint: 0.65, Success: 0.55, Context: 0.60)

### Round 5 — Success Criteria 타깃
**Q:** 관리자가 주문 상태를 변경한 시점부터 고객 디바이스에 push가 도착하는 까지의 허용 지연(SLO)과 동작 방식은 어느 수준이어야 하나요?
**A:** 느슨 (5분 이내) - 폴링 기반
**Ambiguity:** 24% (Goal: 0.80, Constraint: 0.75, Success: 0.80, Context: 0.60)

### Round 6 — SIMPLIFIER MODE — Context Clarity 타깃
**Q:** PWA push의 상용화 배포 시점을 어떻게 처리할까요? (Supabase Auth 마이그 진행 단계 고려)
**A:** temp-auth 위에서 바로 출시, Supabase Auth 마이그 시 구독만 재연결
**Ambiguity:** 18.5% (Goal: 0.80, Constraint: 0.80, Success: 0.80, Context: 0.90)

### Round 7 — Goal Clarity 타깃
**Q:** Push 페이로드는 어떤 정보를 담고, 알림 탭은 어디로 이동해야 하나요? (개인정보 노출 수준)
**A:** 상태명만, 탭 → 주문 상세 (개인정보 최소)
**Ambiguity:** 11% (Goal: 0.95, Constraint: 0.80, Success: 0.90, Context: 0.90) ✅

</details>
