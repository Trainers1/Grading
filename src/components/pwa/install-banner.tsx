"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "pwa-install-banner-dismissed-at";
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7일

// iOS Safari 16.4+ Web Push 지원 여부 감지
function detectShouldShow(): boolean {
  if (typeof window === "undefined") return false;

  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  // CriOS(크롬), FxiOS(파이어폭스) 제외한 Safari만 허용
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS/.test(ua);

  // iOS OS 버전 파싱 (16.4 이상이면 Web Push 지원)
  const versionMatch = ua.match(/OS (\d+)_(\d+)/);
  const major = versionMatch ? parseInt(versionMatch[1], 10) : 0;
  const minor = versionMatch ? parseInt(versionMatch[2], 10) : 0;
  const isSupportedSafari =
    isIOS && isSafari && (major > 16 || (major === 16 && minor >= 4));

  // 이미 홈 화면에 추가된 PWA 환경이면 배너 불필요
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;

  // 7일 이내 닫은 경우 쿨다운 적용
  const dismissedAt = parseInt(localStorage.getItem(DISMISS_KEY) ?? "0", 10);
  const cooldownActive = Date.now() - dismissedAt < COOLDOWN_MS;

  return isSupportedSafari && !isStandalone && !cooldownActive;
}

// iOS Safari에서 홈 화면 추가 안내 배너
export function InstallBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(detectShouldShow());
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50",
        "bg-primary text-primary-foreground",
        "px-4 py-3 shadow-lg"
      )}
    >
      <div className="mx-auto flex max-w-lg items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-sm font-semibold">
            홈 화면에 추가하면 알림을 받을 수 있어요
          </p>
          <p className="mt-0.5 text-xs opacity-80">
            Safari 공유 버튼 → 홈 화면에 추가
          </p>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="배너 닫기"
          className="mt-0.5 shrink-0 text-primary-foreground opacity-80 hover:opacity-100"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
