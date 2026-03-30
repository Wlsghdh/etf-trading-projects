'use client';

import { usePathname } from 'next/navigation';
import { useConnectionStatus } from '@/hooks/use-connection-status';

const pageTitles: Record<string, string> = {
  '/': '대시보드',
  '/scraping': '데이터 수집 관리',
  '/preprocessing': '데이터 전처리 (피처 엔지니어링)',
  '/model': 'ML 모니터링',
  '/pipeline': '파이프라인 모니터링',
  '/calendar': '달력',
  '/portfolio': '포트폴리오',
  '/db-viewer': 'DB 뷰어',
  '/settings': '설정',
  '/admin': '관리자',
};

export function Header() {
  const pathname = usePathname();
  const title = pageTitles[pathname ?? ''] || '대시보드';
  const { isConnected } = useConnectionStatus();

  return (
    <header className="flex h-14 items-center justify-between border-b border-border px-6">
      <h1 className="text-lg font-semibold">{title}</h1>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span
            className={`h-2 w-2 rounded-full ${
              isConnected ? 'bg-green-500 animate-pulse' : 'bg-yellow-400'
            }`}
          />
          <span
            className={`text-xs font-medium ${
              isConnected ? 'text-green-500' : 'text-yellow-500'
            }`}
          >
            {isConnected ? 'Live' : 'Demo'}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          {new Date().toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'short',
          })}
        </span>
      </div>
    </header>
  );
}
