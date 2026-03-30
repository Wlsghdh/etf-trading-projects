import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';

export async function requireAuth() {
  const cookieStore = await cookies();
  const authToken = cookieStore.get('auth-token');
  if (!authToken || authToken.value !== 'authenticated') {
    redirect('/login');
  }
}

export async function requireApiAuth(): Promise<NextResponse | null> {
  const cookieStore = await cookies();
  const authToken = cookieStore.get('auth-token');
  if (!authToken || authToken.value !== 'authenticated') {
    return NextResponse.json({ error: '인증이 필요합니다. 로그인 해주세요.' }, { status: 401 });
  }
  return null;
}
