import type { ReactNode } from 'react';
export const metadata = {
  title: '1行要約',
  description: 'URLから本文を抽出して日本語で一文要約するアプリ',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
