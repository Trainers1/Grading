// VAPID 초기화 모듈 — web-push 라이브러리를 1회 설정하고 싱글턴으로 노출
// 환경변수 누락 시 명시적 에러를 던져 사일런트 실패 방지

import webpush from "web-push";

let initialized = false;

/**
 * web-push 클라이언트를 반환한다.
 * 최초 호출 시 VAPID 설정을 수행하며, 이후 호출은 이미 설정된 인스턴스를 재사용한다.
 * 환경변수가 누락된 경우 서버 시작 시 즉시 에러가 표면화된다.
 */
export function getWebPushClient(): typeof webpush {
  if (initialized) return webpush;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    // 누락된 변수를 구체적으로 로그에 기록
    const missing = [
      !publicKey && "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
      !privateKey && "VAPID_PRIVATE_KEY",
      !subject && "VAPID_SUBJECT",
    ]
      .filter(Boolean)
      .join(", ");
    console.error(`[push] vapid env missing: ${missing}`);
    throw new Error(`VAPID 환경변수 누락 — 설정을 확인하세요: ${missing}`);
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  initialized = true;

  return webpush;
}
