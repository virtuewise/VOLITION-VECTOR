import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Volition Vector — Direction for What Comes Next",
  description:
    "Discover a connected ecosystem for capability, trusted connections and opportunity. Find direction for what comes next with Volition Vector.",
  openGraph: {
    title: "Volition Vector — Direction for What Comes Next",
    description:
      "One considered ecosystem for capability, trusted connections and opportunity.",
    type: "website",
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
