# PWA Push - 구조화 로그 명세

## 필수 로그 라인 패턴

| Level | Pattern | 발생 위치 | 의미 |
|-------|---------|----------|------|
| error | `[push] dispatch failed orderId=<id> error=<code>` | dispatcher.ts | web-push API 5xx 또는 예외 |
| warn | `[push] subscription expired endpoint=<prefix-8>` | dispatcher.ts | 410 Gone 응답, 자동 expired 처리 |
| error | `[push] vapid env missing` | vapid.ts | 환경변수 누락 |
| info | `[push] dispatched count=<n> duration_ms=<ms>` | dispatch route | 매 dispatch run 종료 |
| warn | `[push] subscribe rejected reason=<TEMP_ACCOUNTS_ABSENT\|ENDPOINT_OWNERSHIP_MISMATCH>` | subscribe route | 변조/허가 실패 |
| warn | `[push] sw version mismatch client=<v> server=<v>` | dispatcher.ts (선택) | SW 버전 skew 감지 |

## PII 마스킹 정책 (Critic patch 6b)

- `endpoint` 전체 URL 노출 금지 → prefix 8자만 (`endpoint=https://fc...`)
- `keys.p256dh`, `keys.auth` 절대 로깅 금지 (페이로드 암호화 키)
- 한국어 PII (이메일, 주문번호) 로깅 금지 — `subscriber_email` 대신 hash prefix 사용

## Admin Observability Surface

- `/admin/notifications` (`src/app/(admin)/admin/notifications/page.tsx`)
  - 24h 실패 row 표시 (`last_error IS NOT NULL`)
  - 실패율 % (실패 / 전체 dispatch 시도)
  - 마지막 성공 dispatch 시각
- 권한: SUPER_ADMIN/GRADING_MANAGER 한정 (Architect patch #3)

## SLO Alert 임계값 (운영 가이드)

- **마지막 성공 dispatch > 15분**: 경보 (cron 누락 의심)
- **실패율 > 10% (24h)**: 조사 필요
- **`attempt_count >= 5` row 누적**: dead letter 수동 개입

## 로그 조회 예시 (Vercel Log Drains / Supabase Dashboard)

```bash
# 최근 24h dispatch 실패 확인
SELECT id, order_id, status_key, attempt_count, last_error, created_at
FROM notifications_outbox
WHERE last_error IS NOT NULL
  AND created_at > now() - interval '24 hours'
ORDER BY created_at DESC;

# dead letter 확인 (5회 재시도 초과)
SELECT id, order_id, status_key, attempt_count, last_error
FROM notifications_outbox
WHERE attempt_count >= 5
  AND dispatched_at IS NULL;

# 실패율 계산
SELECT
  count(*) FILTER (WHERE last_error IS NOT NULL) AS failed,
  count(*) AS total,
  round(
    count(*) FILTER (WHERE last_error IS NOT NULL) * 100.0 / nullif(count(*), 0),
    1
  ) AS failure_rate_pct
FROM notifications_outbox
WHERE created_at > now() - interval '24 hours';
```
