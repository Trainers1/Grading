import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
  },
  // 신청 폼의 카드 앞면 이미지 업로드(uploadApplyCardImageAction)는 슬롯당
  // 최대 10MB 의 단일 파일 FormData. 기본 1MB 한도로는 거부되므로 12MB 로 상향.
  // (다중 파일은 client 에서 슬롯별로 호출하므로 한 번의 요청 본문은 항상 1장.)
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
  // NOTE: Turbopack dev에서 부분 미적용 가능 — production build에서만 SW 헤더 검증 (.omc/plans/pwa-customer-push-v1.md §E.2)
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;
