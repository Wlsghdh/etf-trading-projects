import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // basePath '/trading' 제거 후의 경로로 판단
  // Next.js middleware에서 pathname은 basePath 포함
  const path = pathname.replace(/^\/trading/, '') || '/';

  // 로그인 관련 + 정적 리소스 제외
  if (
    path === '/login' ||
    path === '/api/auth/login' ||
    path === '/api/auth/logout' ||
    path.startsWith('/_next/') ||
    path === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  // 인증 토큰 확인
  const authToken = request.cookies.get('auth-token');
  if (!authToken || authToken.value !== 'authenticated') {
    // API 요청이면 401
    if (path.startsWith('/api/')) {
      return NextResponse.json(
        { error: '인증이 필요합니다. 로그인 해주세요.' },
        { status: 401 }
      );
    }
    // 페이지 요청이면 로그인으로 리다이렉트
    return NextResponse.redirect(new URL('/trading/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
