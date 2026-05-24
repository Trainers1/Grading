// 트레이너스 그레이딩 서비스 워커
// Web Push 알림 수신 및 클릭 처리 담당

const SW_VERSION = "1.0.0";

// 설치 즉시 활성화 (대기 없이 바로 새 버전 적용)
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

// 활성화 시 기존 클라이언트 즉시 제어권 획득
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// 푸시 알림 수신 처리
self.addEventListener("push", (event) => {
  const payload = event.data?.json() ?? {};
  const title = payload.title ?? "그레이딩 진행 알림";
  const body = payload.body ?? "주문 상태가 업데이트되었습니다";
  const data = payload.data ?? {};

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      lang: "ko",
    })
  );
});

// 알림 클릭 처리 — 해당 주문 상세 페이지 또는 마이페이지로 이동
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const orderId = event.notification.data?.orderId;
  const url = orderId ? `/mypage/orders/${orderId}` : "/mypage";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((cs) => {
        // 이미 열린 창이 있으면 포커스, 없으면 새 창 열기
        for (const c of cs) {
          if (c.url.includes(url) && "focus" in c) return c.focus();
        }
        return self.clients.openWindow(url);
      })
  );
});
