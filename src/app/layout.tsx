import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TRAINERS - 그레이딩 대행 서비스",
  description:
    "트레이딩 카드 그레이딩 대행 서비스. PSA, BGS, CGC, brg 등 해외 그레이딩사에 대행 제출합니다.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
