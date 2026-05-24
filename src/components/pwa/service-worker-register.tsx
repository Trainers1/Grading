"use client";

import { useEffect } from "react";

// 서비스 워커 등록 컴포넌트 — UI 없음, 마운트 시 SW 등록만 처리
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then(() => console.log("[push] sw registered"))
        .catch((err) => console.error("[push] sw registration failed", err));
    }
  }, []);

  return null;
}
