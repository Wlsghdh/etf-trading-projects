import { NextRequest, NextResponse } from 'next/server';

const VALID_USERNAME = 'ahnbi2';
const VALID_PASSWORD = 'bigdata';

export async function POST(request: NextRequest) {
  const { username, password } = await request.json();

  if (username === VALID_USERNAME && password === VALID_PASSWORD) {
    const response = NextResponse.json({ success: true });
    response.cookies.set('auth-token', 'authenticated', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/trading',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
    return response;
  }

  return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
}
