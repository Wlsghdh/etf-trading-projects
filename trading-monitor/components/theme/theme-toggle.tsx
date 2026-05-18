'use client';

import { useEffect, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Sun03Icon, Moon02Icon } from '@hugeicons/core-free-icons';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'tm-theme';

function getInitialTheme(): Theme {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* localStorage 비활성 환경 무시 */
  }
}

export function ThemeToggle() {
  // 마운트 전에는 SSR-safe 기본값 (인라인 스크립트가 이미 설정해둔 값을 읽음)
  const [theme, setTheme] = useState<Theme>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(getInitialTheme());
    setMounted(true);
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
  };

  // 마운트 전에는 placeholder (hydration mismatch 방지)
  if (!mounted) {
    return (
      <button
        type="button"
        aria-label="테마 전환"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground"
      >
        <span className="h-4 w-4" />
      </button>
    );
  }

  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
      title={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <HugeiconsIcon
        icon={isDark ? Sun03Icon : Moon02Icon}
        className="h-4 w-4"
        strokeWidth={2}
      />
    </button>
  );
}
