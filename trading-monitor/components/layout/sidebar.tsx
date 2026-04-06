'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  DashboardSquare01Icon,
  Calendar03Icon,
  ChartLineData02Icon,
  Settings02Icon,
  Database02Icon,
  WorkflowSquare10Icon,
  CloudDownloadIcon,
  AiBrain02Icon,
  Layers01Icon,
  Logout03Icon,
  FileAttachmentIcon,
  AiChat02Icon,
  UserGroupIcon,
  SearchList01Icon,
} from '@hugeicons/core-free-icons';

interface NavItem {
  href: string;
  label: string;
  icon: typeof DashboardSquare01Icon;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { href: '/', label: '대시보드', icon: DashboardSquare01Icon },
  { href: '/scraping', label: '데이터 수집', icon: CloudDownloadIcon, adminOnly: true },
  { href: '/preprocessing', label: '데이터 전처리', icon: Layers01Icon, adminOnly: true },
  { href: '/model', label: 'ML 모니터링', icon: AiBrain02Icon, adminOnly: true },
  { href: '/pipeline', label: '파이프라인', icon: WorkflowSquare10Icon, adminOnly: true },
  { href: '/portfolio', label: '포트폴리오', icon: ChartLineData02Icon },
  { href: '/order-logs', label: 'KIS 주문 로그', icon: FileAttachmentIcon, adminOnly: true },
  { href: '/calendar', label: '달력', icon: Calendar03Icon },
  { href: '/db-viewer', label: 'DB 뷰어', icon: Database02Icon, adminOnly: true },
  { href: '/multi-ai', label: '멀티AI', icon: AiChat02Icon },
  { href: '/community', label: '커뮤니티', icon: UserGroupIcon },
  { href: '/stocks', label: '종목열람', icon: SearchList01Icon },
  { href: '/settings', label: '설정', icon: Settings02Icon },
];

function getCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : '';
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState('user');
  const [userName, setUserName] = useState('');

  useEffect(() => {
    setRole(getCookie('user-role') || 'user');
    setUserName(getCookie('user-name') || '');
  }, []);

  const isAdmin = role === 'admin';
  const visibleItems = navItems.filter(item => !item.adminOnly || isAdmin);

  const handleLogout = async () => {
    await fetch('/trading/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  return (
    <aside className="flex w-56 flex-col border-r border-border bg-sidebar">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
          <span className="text-xs font-bold text-primary-foreground">T</span>
        </div>
        <span className="text-sm font-semibold text-sidebar-foreground">Trading Monitor</span>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3 overflow-y-auto">
        {visibleItems.map((item) => {
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
              )}
            >
              <HugeiconsIcon icon={item.icon} className="h-4 w-4" strokeWidth={2} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-3 space-y-2">
        <div className="flex items-center gap-2 rounded-md px-3 py-2">
          <div className={`h-2 w-2 rounded-full ${isAdmin ? 'bg-amber-500' : 'bg-green-500'} animate-pulse`} />
          <span className="text-xs text-muted-foreground">
            {userName || 'User'} {isAdmin ? '(Admin)' : ''}
          </span>
        </div>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors"
        >
          <HugeiconsIcon icon={Logout03Icon} className="h-4 w-4" strokeWidth={2} />
          로그아웃
        </button>
      </div>
    </aside>
  );
}
