import type { Metadata } from "next";
import "./globals.css";
import "./workspace.css";
export const metadata: Metadata = {
  metadataBase: new URL("http://127.0.0.1:3000"),
  title: "AgentBridge — Where businesses meet personal AI",
  description:
    "Discover business agents and personal skills, ask questions, and connect what businesses offer with what people need. Accommodation is the first supported test booking workflow.",
  robots: { index: false, follow: false },
  openGraph: {
    title: "AgentBridge — Where businesses meet personal AI",
    description: "Connect what your business offers with what people need through personal AI.",
    siteName: "AgentBridge",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AgentBridge — Where businesses meet personal AI",
    description: "Connect what your business offers with what people need through personal AI.",
  },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
