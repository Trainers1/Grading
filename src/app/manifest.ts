import type { MetadataRoute } from "next";

// 현재 public/icons/ 는 scripts/generate-placeholder-icons.ps1 로 생성한
// 브랜드 컬러 'T' placeholder PNG. 디자이너 최종 아이콘으로 동일 파일명
// 교체 필요:
// - public/icons/icon-192.png  (192x192)
// - public/icons/icon-512.png  (512x512)
// - public/icons/icon-maskable.png (마스커블 변형)
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "트레이너스 그레이딩",
    short_name: "트레이너스",
    description: "트레이딩 카드 해외 그레이딩 대행 서비스",
    display: "standalone",
    scope: "/",
    start_url: "/mypage/orders",
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
    // PWA standalone 모드에서 주소창 접근이 어려운 어드민 진입용 단축키.
    // Android Chrome / Windows Edge / Samsung Internet 에서 앱 아이콘 길게
    // 누르면 OS 메뉴에 노출된다.
    shortcuts: [
      {
        name: "관리자 로그인",
        short_name: "관리자",
        description: "트레이너스 어드민 콘솔",
        url: "/admin/login",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
        ],
      },
      {
        name: "신청내역",
        short_name: "신청내역",
        url: "/mypage/orders",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
        ],
      },
    ],
  };
}
