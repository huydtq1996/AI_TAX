import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Trợ lý Khai báo Thuế",
  description: "Dành cho Hộ Kinh doanh Nhỏ - Tư duy Trí tuệ Nhân tạo",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
