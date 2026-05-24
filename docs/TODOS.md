# TODOS

운영 진입 전 반드시 보정해야 하는 항목 모음. 코드/스키마 자체는 동작하지만 임시값이 들어 있어 실무 정확도가 떨어지는 항목 위주.

## 출고(SHIPPED_OUT) → 그레이딩 진행 중 자동 승격 기간

- **현재 상태**: `grading_services.transit_days` 컬럼에 임시 차등 값이 들어가 있음. 마이그레이션 `006_shipped_out_and_payment_auto.sql` 의 시드 SQL 참조.
  - super_express → 3일
  - express / premium → 5일
  - standard / regular → 14일 (column default 동일)
  - economy → 21일
  - 그 외 코드 → 14일 (default)
- **해야 할 일**: 실제 운영 데이터를 기반으로 회사·서비스별 정확한 출고~그레이딩사 도착(또는 작업 시작) 평균 일수를 측정해 `transit_days` 를 갱신.
- **갱신 SQL 예시**:
  ```sql
  UPDATE grading_services SET transit_days = 7  WHERE company = 'PSA' AND code = 'psa_express';
  UPDATE grading_services SET transit_days = 12 WHERE company = 'PSA' AND code = 'psa_regular';
  -- … 회사·코드별로 반복
  ```
- **검증 후 영향**:
  - `/api/orders/auto-promote` (Vercel Cron 매시 정시) 호출 시 새 값을 즉시 사용.
  - 이미 출고 상태로 들어가 있는 주문은 다음 cron 실행 시점에 새 기간 기준으로 재평가됨 (NOW() >= shipped_out_at + transit_days).
- **누가**: 운영팀(트레이너스) 확인 후 SUPER_ADMIN 이 적용.
- **언제까지**: 첫 실사용 주문이 SHIPPED_OUT 단계에 진입하기 전.

## (참고) 결제 완료 자동 전이

- payment_status 가 'PAID' 로 갱신될 때 order_status 가 'PAYMENT_PENDING' 이면 'CARD_DELIVERY_PENDING' 으로 자동 전이.
- 트리거 `trg_auto_promote_on_payment_paid` 가 `orders` 테이블에 부착되어 있으므로, 토스페이먼츠 confirm 핸들러에서는 `payment_status` 만 'PAID' 로 업데이트하면 됨.
