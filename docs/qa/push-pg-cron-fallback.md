# PWA Push 디스패치 — pg_cron 폴백 활성화 절차

## 활성화 조건
Vercel Pro 플랜 미체결 또는 Vercel Cron 신뢰성 이슈 발생 시 본 절차로 Supabase pg_cron 활성화.

## 사전 검증

### 1. `pg_net` 확장 활성화 확인
```sql
SELECT * FROM pg_extension WHERE extname = 'pg_net';
```
결과가 없으면 Supabase 대시보드 **Database → Extensions**에서 `pg_net` 활성화.

### 2. `pg_cron` 확장 활성화 확인
```sql
SELECT * FROM pg_extension WHERE extname = 'pg_cron';
```
결과가 없으면 활성화.

## Bootstrap (CRON_SECRET 주입)

### Supabase SQL Editor 사용 (1회 실행)
```sql
ALTER DATABASE postgres SET app.cron_secret = '<your-cron-secret>';
```

### 또는 Supabase CLI 사용
```bash
supabase secrets set CRON_SECRET=<your-cron-secret>
```

## 폴백 활성화

`supabase/migrations/003_pwa_push.sql` 마지막 부분의 주석 해제:

```sql
SELECT cron.schedule('push_dispatch_5min', '*/5 * * * *', $$
  SELECT net.http_get(
    url := 'https://<host>/api/push/dispatch',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.cron_secret'))
  );
$$);
```

**주의:** `<host>`를 실제 배포 호스트로 치환하세요 (예: `https://trainers.kr`).

### 마이그레이션 적용
```bash
supabase db push
```

## 검증

### pg_cron 작업 상태 확인
```sql
SELECT * FROM cron.job WHERE jobname = 'push_dispatch_5min';
```

### 최근 실행 로그 확인
```sql
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;
```

## 비활성화 (Vercel Pro 체결 후 원복)

```sql
SELECT cron.unschedule('push_dispatch_5min');
```

또는 `supabase/migrations/003_pwa_push.sql`에서 `cron.schedule()` 호출을 주석 처리하고:
```bash
supabase db push
```

## Dual-trigger 안전성

Vercel Cron + pg_cron 동시 활성화 시에도 다음 메커니즘으로 중복 발송 방지 (plan ADR-002):

- `notifications_outbox` 테이블의 `UNIQUE(order_id, status_key, channel)` 제약
- Dispatcher 엔드포인트 (`/api/push/dispatch`)의 멱등성 설계

중복 발송 리스크 없이 안전하게 양쪽 모두 활성화 가능.

## 환경별 호스트 URL 치환

마이그레이션 적용 전, 다음과 같이 환경별로 호스트를 설정하세요:

| 환경 | 호스트 URL |
|------|-----------|
| **dev** | `http://localhost:3000` |
| **staging** | `https://staging.trainers.kr` |
| **production** | `https://trainers.kr` |

`supabase/migrations/003_pwa_push.sql`의 `<host>` placeholder를 환경에 맞게 변경한 후 `supabase db push`.
