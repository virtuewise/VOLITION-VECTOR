import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Volition Vector — Discover your direction", description: "A trusted global ecosystem for skills, services, learning and opportunity." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
