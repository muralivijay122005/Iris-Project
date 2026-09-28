import type { Metadata, Viewport } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import ClientProvider from "../components/ClientProvider";
import { SETTINGS_STORAGE_KEY } from "../lib/settings-key";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Iris",
  description: "Iris — a fast, personal AI assistant with memory.",
  icons: { icon: "/Iris_X.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfcfd" },
    { media: "(prefers-color-scheme: dark)", color: "#16171a" },
  ],
};

// Applies saved appearance before first paint to avoid a theme flash
const themeBootstrap = `(function(){try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(
  SETTINGS_STORAGE_KEY
)})||"{}");var m=s.theme||"system";var d=m==="dark"||(m==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.dataset.accent=s.accent||"lagoon";r.dataset.fontSize=s.fontSize||"md";r.dataset.wide=String(!!s.wide);}catch(e){document.documentElement.classList.add("dark")}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // Font variables live on <html> so :root tokens (e.g. --mono) can use them
    <html lang="en" className={`${inter.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="font-sans antialiased">
        <ClientProvider>{children}</ClientProvider>
      </body>
    </html>
  );
}
