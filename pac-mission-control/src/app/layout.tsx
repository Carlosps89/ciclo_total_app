import type { Metadata } from "next";
import "./globals.css";
import { Roboto, Roboto_Mono } from "next/font/google";

const roboto = Roboto({
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  display: "swap",
  variable: "--font-sans",
});

const robotoMono = Roboto_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "CCO - RUMO",
  description: "Centro de Controle Rodoviário - Ciclo Total",
  manifest: "/manifest.json",
  themeColor: "#010b1a",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "CCO - RUMO",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${roboto.variable} ${robotoMono.variable} font-sans antialiased bg-black text-white`}>
        {children}
      </body>
    </html>
  );
}
