import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "건물 냉난방 부하 예측",
  description: "건물 설계 조건에 따른 난방 및 냉방 부하 예측 시연",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
