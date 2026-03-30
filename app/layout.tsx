import type { Metadata } from "next";
import { ReactNode } from "react";

export const metadata: Metadata = {
  title: "MasterSauce",
  description:
    "MasterSauce is an affordable, simple, smart automatic mastering web app for independent musicians and AI music creators.",
  // Bump ?v= when regenerating favicons so browsers pick up new files (favicons cache aggressively).
  icons: {
    icon: [
      { url: "/favicon.ico?v=ms2", type: "image/x-icon" },
      { url: "/favicon-16x16.png?v=ms2", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png?v=ms2", sizes: "32x32", type: "image/png" },
      { url: "/favicon-48x48.png?v=ms2", sizes: "48x48", type: "image/png" }
    ],
    apple: [{ url: "/apple-touch-icon.png?v=ms2", sizes: "180x180", type: "image/png" }]
  }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={bodyStyle}>{children}</body>
    </html>
  );
}

const bodyStyle: React.CSSProperties = {
  margin: 0,
  minHeight: "100vh",
  fontFamily: "Work Sans, Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell",
  background:
    "radial-gradient(1200px 420px at 10% -30%, rgba(47, 176, 255, 0.16), rgba(47,176,255,0) 56%), radial-gradient(1000px 540px at 90% -18%, rgba(140, 96, 255, 0.24), rgba(140,96,255,0) 62%), linear-gradient(145deg, #0f1831 0%, #0b1225 54%, #070f20 100%)",
  color: "#eef2ff",
  lineHeight: 1.5
};
