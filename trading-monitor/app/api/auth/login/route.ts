import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/db';

export async function POST(request: NextRequest) {
  const { username, password } = await request.json();

  const user = authenticateUser(username, password);

  if (user) {
    const isSecure = request.headers.get('x-forwarded-proto') === 'https'
      || request.nextUrl.protocol === 'https:';

    // 쿠키에 userId도 저장 (채팅 기록용)
    const response = NextResponse.json({
      success: true,
      user: { id: user.id, username: user.username, displayName: user.display_name, role: user.role },
    });
    response.cookies.set('auth-token', 'authenticated', {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      path: '/trading',
    });
    response.cookies.set('user-id', String(user.id), {
      httpOnly: false, // 클라이언트에서 읽어야 함
      secure: isSecure,
      sameSite: 'lax',
      path: '/trading',
    });
    response.cookies.set('user-name', user.username, {
      httpOnly: false,
      secure: isSecure,
      sameSite: 'lax',
      path: '/trading',
    });
    response.cookies.set('user-role', user.role, {
      httpOnly: false,
      secure: isSecure,
      sameSite: 'lax',
      path: '/trading',
    });
    return response;
  }

  return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
}
