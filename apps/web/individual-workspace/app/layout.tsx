import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'Individual Workspace | Volition Vector', description: 'A trusted global opportunity ecosystem.' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
