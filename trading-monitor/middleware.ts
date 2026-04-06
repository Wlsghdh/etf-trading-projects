import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// admin 전용 경로 (일반 유저 접근 불가)
const ADMIN_PATHS = [
  '/scraping',
  '/preprocessing',
  '/model',
  '/pipeline',
  '/order-logs',
  '/db-viewer',
  '/admin',
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const path = pathname.replace(/^\/trading/, '') || '/';

  // 로그인/회원가입 + 정적 리소스 제외
  if (
    path === '/login' ||
    path === '/api/auth/login' ||
    path === '/api/auth/logout' ||
    path === '/api/auth/register' ||
    path.startsWith('/_next/') ||
    path === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  // 인증 토큰 확인
  const authToken = request.cookies.get('auth-token');
  if (!authToken || authToken.value !== 'authenticated') {
    if (path.startsWith('/api/')) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }
    const loginUrl = new URL('/trading/login', request.url);
    loginUrl.searchParams.set('from', path);
    return NextResponse.redirect(loginUrl);
  }

  // 역할 기반 접근 제어
  const userRole = request.cookies.get('user-role')?.value || 'user';
  if (userRole !== 'admin') {
    const isAdminPath = ADMIN_PATHS.some(p => path === p || path.startsWith(p + '/'));
    if (isAdminPath) {
      if (path.startsWith('/api/')) {
        return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
      }
      return NextResponse.redirect(new URL('/trading/', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
