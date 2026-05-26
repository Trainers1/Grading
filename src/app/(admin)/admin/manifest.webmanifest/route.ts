// 어드민 전용 PWA 매니페스트 — 일반 사용자 PWA(src/app/manifest.ts)와 분리.
// /admin/** 경로의 layout 에서 <link rel="manifest"> 를 이 경로로 오버라이드하므로
// 어드민 화면에서 "앱 설치" 프롬프트가 뜨면 별도 "트레이너스 관리자" PWA 가 설치된다.
// scope 를 /admin 으로 좁혀, 설치된 어드민 PWA 아이콘은 어드민 콘솔 전용 컨텍스트로 동작.
//
// 아이콘은 현재 일반 PWA 와 동일 placeholder 를 재사용 — 디자이너 최종 어드민 아이콘 확정 시
// /public/icons/admin-* 로 분리하여 교체 필요.
export function GET() {
  const body = JSON.stringify({
    id: "/admin",
    name: "트레이너스 관리자",
    short_name: "관리자",
    description: "트레이너스 그레이딩 어드민 콘솔",
    display: "standalone",
    scope: "/admin",
    start_url: "/admin",
    theme_color: "#1a237e",
    background_color: "#ffffff",
    lang: "ko",
    dir: "ltr",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600, must-revalidate",
    },
  });
}
