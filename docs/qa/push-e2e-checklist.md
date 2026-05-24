# PWA Push - E2E Manual Checklist

## Pre-flight (Launch Checklist)

- [ ] **Prod VAPID 키 발급 완료** (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` 모두 staging≠prod 분리 확인) ⚠️ Critic patch 6d
- [ ] Vercel 대시보드에 4종 env 입력 완료 (VAPID 3종 + CRON_SECRET)
- [ ] `vercel.json` cron 등록 확인
- [ ] (옵션) Vercel Pro 플랜 결제 확정 — 미체결 시 pg_cron 폴백 활성화 (`docs/qa/push-pg-cron-fallback.md`)
- [ ] Public icons (`/icons/icon-192.png`, `/icons/icon-512.png`, `/icons/icon-maskable.png`) 디자이너 산출물 추가됨
- [ ] 003 마이그 staging DB 적용 완료
- [ ] `TEMP_ACCOUNTS` (customer1@example.com, host1@example.com) 인지 — v1.0 release scope = 내부 검증

---

## AC #1 - 구독 등록 (mypage 토글 ON)

- [ ] customer1@example.com으로 로그인
- [ ] /mypage/profile 진입
- [ ] "푸시 알림 받기" 토글 ON 클릭
- [ ] 브라우저 권한 prompt → 허용
- [ ] DB: `SELECT * FROM push_subscriptions WHERE subscriber_email = 'customer1@example.com'` 1행 생성 확인
- [ ] 토글 상태 ON 유지 (페이지 새로고침 후에도)

---

## AC #2 - 5분 이내 push 수신

- [ ] Admin (host1@example.com)으로 로그인
- [ ] 위 customer1@example.com의 주문 1건 status를 `GRADE_CONFIRMED`로 변경
- [ ] DB: `notifications_outbox`에 row 1건 생성 확인 (`dispatched_at IS NULL`)
- [ ] 5분 이내 customer1 디바이스에 push 수신 (notification 표시)
- [ ] DB: `notifications_outbox.dispatched_at` 채움 확인

---

## AC #3 - Tap deeplink

- [ ] Push notification 탭
- [ ] `/mypage/orders/<order-id>` 페이지 정확히 열림
- [ ] PWA 설치 상태면 standalone 창에서, 아니면 Safari/Chrome 일반 탭

---

## AC #4 - Idempotency

- [ ] Admin이 동일 주문을 GRADE_CONFIRMED → DISTRIBUTOR_SHIPPED → GRADE_CONFIRMED로 되돌림
- [ ] DB: `notifications_outbox`에 GRADE_CONFIRMED row 1건만 존재 (UNIQUE 차단)
- [ ] customer1 디바이스에 GRADE_CONFIRMED push 1회만 수신

---

## AC #5 - Subscription 만료 (410 Gone)

- [ ] 의도적으로 endpoint 만료 시뮬: customer1이 mypage 토글 OFF (unsubscribe API 호출)
- [ ] DB: `push_subscriptions.expired_at` 채움 확인
- [ ] 새 milestone 발생 → dispatcher가 expired endpoint 발송 시도 → 410 응답 → expired_at 자동 갱신 (이미 채워져 있으면 무시)

---

## AC #6 - iOS InstallBanner

- [ ] iOS Safari 16.4+ 디바이스에서 mypage 접속 → 하단 InstallBanner 노출 확인
- [ ] 닫기 버튼 클릭 → localStorage `pwa-install-banner-dismissed-at` 채움 확인
- [ ] 7일 내 재방문 → 배너 미노출 (쿨다운 동작)
- [ ] Android Chrome에서 mypage 접속 → 배너 미노출
- [ ] iOS Safari < 16.4 (시뮬레이터)에서 mypage 접속 → 배너 미노출
