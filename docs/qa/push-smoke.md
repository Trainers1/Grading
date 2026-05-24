# PWA Push - Integration Smoke Test

## 1. 로컬 Supabase + 003 마이그 검증

```bash
supabase start
supabase db reset  # 또는 supabase db push
```

psql로 접속 후 확인:

```sql
\d push_subscriptions
```

기대 결과: 컬럼 8개 + `UNIQUE(endpoint)` 제약 확인

```sql
\d notifications_outbox
```

기대 결과: 컬럼 9개 + `UNIQUE(order_id, status_key, channel)` 제약 확인

## 2. Status 변경 트리거 검증

```sql
-- 테스트 주문 1건 생성 (002 fixture 사용 가정)
-- 상태를 milestone으로 변경
UPDATE orders SET status = 'GRADE_CONFIRMED' WHERE id = '<test-order-id>';
-- order_status_logs trigger가 자동으로 outbox INSERT
SELECT * FROM notifications_outbox WHERE order_id = '<test-order-id>';
-- expect: 1 row, dispatched_at IS NULL, status_key = 'GRADE_CONFIRMED'
```

TRAINERS_ARRIVED는 milestone 제외 대상이므로 outbox INSERT 없음:

```sql
UPDATE orders SET status = 'TRAINERS_ARRIVED' WHERE id = '<test-order-id>';
SELECT count(*) FROM notifications_outbox WHERE order_id = '<test-order-id>' AND status_key = 'TRAINERS_ARRIVED';
-- expect: 0
```

## 3. Dispatch endpoint 호출 검증

```bash
curl -X GET http://localhost:3000/api/push/dispatch \
  -H "Authorization: Bearer $CRON_SECRET" \
  -v
```

응답 기대값:

```json
{
  "processed": 1,
  "dispatched": 0,
  "expired": 0,
  "failed": 0,
  "skipped": 1,
  "durationMs": 42
}
```

- 구독 0건인 경우: `skipped=1`, `skipped_reason='no_subscription'`
- 구독 1건 이상인 경우: `dispatched=1`, `notifications_outbox.dispatched_at` 채워짐 확인

DB 확인:

```sql
SELECT id, order_id, status_key, dispatched_at, skipped_reason
FROM notifications_outbox
ORDER BY created_at DESC
LIMIT 5;
```

## 4. Lighthouse PWA Audit (Production Build)

```bash
pnpm build
pnpm start
# Chrome DevTools → Lighthouse → PWA category → Generate report
```

**목표 점수:** PWA score ≥ 90/100

**필수 PASS audit IDs:**

| Audit ID | 설명 |
|----------|------|
| `installable-manifest` | manifest.json 유효성 |
| `service-worker` | SW 등록 확인 |
| `themed-omnibox` | theme-color 메타 |
| `viewport` | viewport 메타 |
| `apple-touch-icon` | Apple 터치 아이콘 |
| `maskable-icon` | 마스크 아이콘 (192×192) |
| `is-on-https` | HTTPS (production only) |

## 5. 운영 동작 검증

milestone 외 status는 outbox에 row가 생성되지 않아야 함:

```sql
-- MILESTONE_STATUS_KEYS: CARD_DELIVERY_PENDING, DISTRIBUTOR_SHIPPED, GRADE_CONFIRMED, READY_FOR_PICKUP, COMPLETED
-- 아래 쿼리 결과 = 0 이어야 함
SELECT count(*)
FROM notifications_outbox
WHERE status_key NOT IN (
  'CARD_DELIVERY_PENDING',
  'DISTRIBUTOR_SHIPPED',
  'GRADE_CONFIRMED',
  'READY_FOR_PICKUP',
  'COMPLETED'
);
```

## 6. Node smoke 스크립트 실행

VAPID 키 발급 후 `.env.local`에 입력하고 실행:

```bash
pnpm smoke:push
```

기대 출력:

```
[smoke] case 1: VAPID 환경변수 검증... PASS
[smoke] case 2: web-push 페이로드 서명 round-trip... PASS
[smoke] case 3: MILESTONE_STATUS_KEYS TypeScript typecheck (pnpm tsc --noEmit)... PASS
[smoke] case 4: outbox UNIQUE 위반 시뮬 (idempotency)... PASS
[smoke] case 5: anon RLS deny 검증 (push_subscriptions)... PASS
[smoke] case 6: endpoint hijack 시뮬 (동일 endpoint 다른 email 거부)... PASS
[smoke] case 7: TRAINERS_ARRIVED → outbox INSERT 0건 검증 (마일스톤 제외 확인)... PASS

Total: 7 cases (7 PASS / 0 SKIP / 0 FAIL)
```

Supabase 미연결 CI 환경 기대 출력:

```
[smoke] case 1: VAPID 환경변수 검증... PASS
[smoke] case 2: web-push 페이로드 서명 round-trip... PASS
[smoke] case 3: MILESTONE_STATUS_KEYS TypeScript typecheck (pnpm tsc --noEmit)... PASS
[smoke] case 4: outbox UNIQUE 위반 시뮬 (idempotency)... SKIP (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정)
[smoke] case 5: anon RLS deny 검증 (push_subscriptions)... SKIP (SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 미설정)
[smoke] case 6: endpoint hijack 시뮬 (동일 endpoint 다른 email 거부)... SKIP (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정)
[smoke] case 7: TRAINERS_ARRIVED → outbox INSERT 0건 검증 (마일스톤 제외 확인)... SKIP (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정 — SQL 트리거 시뮬 불가)

Total: 7 cases (3 PASS / 4 SKIP / 0 FAIL)
```
