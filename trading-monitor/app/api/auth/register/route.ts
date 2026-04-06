import { NextRequest, NextResponse } from 'next/server';
import { getDB, hashPassword } from '@/lib/db';

export async function POST(request: NextRequest) {
  const { username, password, displayName } = await request.json();

  if (!username || !password) {
    return NextResponse.json({ error: '아이디와 비밀번호를 입력하세요.' }, { status: 400 });
  }
  if (username.length < 3 || username.length > 20) {
    return NextResponse.json({ error: '아이디는 3~20자여야 합니다.' }, { status: 400 });
  }
  if (password.length < 4) {
    return NextResponse.json({ error: '비밀번호는 4자 이상이어야 합니다.' }, { status: 400 });
  }

  const db = getDB();

  // 중복 체크
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return NextResponse.json({ error: '이미 사용 중인 아이디입니다.' }, { status: 409 });
  }

  // 생성 (일반 유저 role='user')
  const hash = hashPassword(password);
  const result = db.prepare(
    'INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)'
  ).run(username, hash, displayName || username, 'user');

  return NextResponse.json({
    success: true,
    user: { id: result.lastInsertRowid, username, displayName: displayName || username, role: 'user' },
  });
}
