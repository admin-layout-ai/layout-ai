import type { ReactNode } from 'react';
import './globals.css';

interface RootLayoutProps {
  children: ReactNode;
}

export const metadata = {
  title: 'Layout AI - AI-Powered Floor Plan Generator',
  description: 'Generate professional floor plans for Australian builders using AI technology',
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}