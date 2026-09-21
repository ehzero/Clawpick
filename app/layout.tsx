import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);
const title = "Clawpick Physics Lab";
const description =
  "로커 링크 곡선 집게와 비신축 케이블 승강으로 실제 인형 뽑기 머신의 움직임을 검증하는 웹 물리 프로토타입";

export const metadata: Metadata = {
  metadataBase: new URL(origin),
  title,
  description,
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    noimageindex: true,
    nosnippet: true,
    googleBot: {
      index: false,
      follow: false,
      noarchive: true,
      noimageindex: true,
      nosnippet: true,
    },
  },
  openGraph: {
    title,
    description,
    type: "website",
    url: origin,
    images: [
      {
        url: `${origin}/og-single-hinge.png`,
        width: 1200,
        height: 630,
        alt: "비신축 케이블에 매달린 곡선 집게와 상부 크레인이 보이는 Clawpick Mechanical Lab",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [`${origin}/og-single-hinge.png`],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
