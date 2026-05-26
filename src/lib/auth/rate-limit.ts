// 비밀번호 재검증 등 민감 액션에 대한 1차 brute-force 방어.
// 인메모리 카운터 — 단일 서버리스 인스턴스 범위에서만 정확. 다인스턴스에서는
// 공격자가 인스턴스를 골고루 분산시키면 정확도가 떨어진다. 본격 방어는 추후
// DB·Redis 기반 카운터로 교체할 것 (TODO).
//
// 정책:
//   - 같은 key 로 5회 연속 실패 → 5분 잠금
//   - 잠금 중에는 즉시 거절, lockedUntil 까지 남은 초 반환
//   - 성공 시 카운터 리셋
//   - 메모리 누수 방지를 위해 lockedUntil + 1시간 지나면 GC

const MAX_FAILURES = 5;
const LOCKOUT_MS = 5 * 60 * 1000;
const GC_AFTER_MS = 60 * 60 * 1000;

type Entry = { failures: number; lockedUntil: number; lastUpdated: number };

const store = new Map<string, Entry>();

function gc(now: number) {
  for (const [key, entry] of store) {
    if (now - entry.lastUpdated > GC_AFTER_MS) {
      store.delete(key);
    }
  }
}

export type RateLimitCheck =
  | { locked: false }
  | { locked: true; retryAfterSec: number };

/** 현재 잠금 상태 확인 — 액션 시작 시 호출. */
export function checkAuthAttempt(key: string): RateLimitCheck {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry) return { locked: false };
  if (entry.lockedUntil > now) {
    return {
      locked: true,
      retryAfterSec: Math.ceil((entry.lockedUntil - now) / 1000),
    };
  }
  return { locked: false };
}

/** 실패 기록 — 임계치 도달 시 자동 잠금. */
export function recordAuthFailure(key: string): RateLimitCheck {
  const now = Date.now();
  gc(now);
  const entry = store.get(key) ?? {
    failures: 0,
    lockedUntil: 0,
    lastUpdated: now,
  };
  entry.failures += 1;
  entry.lastUpdated = now;
  if (entry.failures >= MAX_FAILURES) {
    entry.lockedUntil = now + LOCKOUT_MS;
  }
  store.set(key, entry);

  if (entry.lockedUntil > now) {
    return {
      locked: true,
      retryAfterSec: Math.ceil((entry.lockedUntil - now) / 1000),
    };
  }
  return { locked: false };
}

/** 성공 — 카운터 리셋. */
export function resetAuthAttempts(key: string): void {
  store.delete(key);
}
