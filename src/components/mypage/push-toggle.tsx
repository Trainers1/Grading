"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// VAPID 공개키를 ArrayBuffer로 변환하는 helper (Web Push 표준)
function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer as ArrayBuffer;
}

type ToggleState = "loading" | "off" | "on" | "error";

// 마이페이지 프로필용 푸시 알림 ON/OFF 토글
export function PushToggle() {
  const [state, setState] = useState<ToggleState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 마운트 시 현재 구독 상태 조회 (SW pushManager 직접 확인)
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("off");
      return;
    }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        setState(sub ? "on" : "off");
      })
      .catch(() => {
        setState("off");
      });
  }, []);

  const handleToggle = async () => {
    setErrorMessage(null);

    if (state === "on") {
      // OFF: 구독 해제
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await sub.unsubscribe();
          await fetch("/api/push/unsubscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
        }
        setState("off");
      } catch {
        setErrorMessage("알림 해제 중 오류가 발생했습니다.");
        setState("error");
      }
      return;
    }

    // ON: 권한 요청 → 구독 → 서버 등록
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      // iOS 미설치 환경 등 Web Push 미지원
      setErrorMessage(
        "iOS에서는 홈 화면에 추가 후 사용 가능합니다."
      );
      setState("error");
      return;
    }

    // 알림 권한 요청
    const permission = await Notification.requestPermission();
    if (permission === "denied") {
      setErrorMessage("브라우저 설정에서 알림 권한을 허용해 주세요.");
      setState("error");
      return;
    }
    if (permission !== "granted") {
      // 사용자가 닫은 경우 — 상태 변경 없이 종료
      return;
    }

    try {
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        throw new Error("VAPID 공개키가 설정되지 않았습니다.");
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      const json = sub.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          keys: {
            p256dh: json.keys?.p256dh ?? "",
            auth: json.keys?.auth ?? "",
          },
          userAgent: navigator.userAgent,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "서버 등록 실패");
      }

      setState("on");
    } catch (err) {
      // iOS 홈 화면 미추가 환경에서 pushManager.subscribe 실패
      const message =
        err instanceof Error && err.message.includes("permission")
          ? "iOS에서는 홈 화면에 추가 후 사용 가능합니다."
          : "알림 설정 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
      setErrorMessage(message);
      setState("error");
    }
  };

  const isChecked = state === "on";
  const isLoading = state === "loading";

  return (
    <div className="space-y-2">
      <label className="flex items-center justify-between">
        <span className="text-sm">푸시 알림 받기</span>
        <button
          type="button"
          onClick={handleToggle}
          disabled={isLoading}
          aria-label={isChecked ? "푸시 알림 끄기" : "푸시 알림 켜기"}
          className={cn(
            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer",
            "disabled:cursor-not-allowed disabled:opacity-50",
            isChecked ? "bg-primary" : "bg-muted"
          )}
        >
          <span
            className={cn(
              "inline-block h-4 w-4 rounded-full bg-white transition-transform",
              isChecked ? "translate-x-6" : "translate-x-1"
            )}
          />
        </button>
      </label>
      {errorMessage && (
        <p className="text-xs text-error">{errorMessage}</p>
      )}
    </div>
  );
}
