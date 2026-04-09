'use client';

import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

/**
 * 현재 테마를 반환하는 커스텀 훅.
 *
 * `<html class="dark">` 의 존재 여부로 테마를 판단하고,
 * MutationObserver를 사용해 클래스 변경을 실시간 감지한다.
 *
 * 사용 예:
 *   const theme = useTheme();
 *   useEffect(() => { ...위젯 재로드... }, [theme]);
 *
 * SSR 안전: 마운트 전에는 'dark'를 반환 (FOUC 방지 인라인 스크립트의 기본값과 일치)
 */
export function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    const root = document.documentElement;

    const compute = (): Theme => (root.classList.contains('dark') ? 'dark' : 'light');

    // 초기 동기화
    setTheme(compute());

    // <html> 의 class 변경 감지
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'class') {
          setTheme(compute());
          break;
        }
      }
    });
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });

    return () => observer.disconnect();
  }, []);

  return theme;
}
