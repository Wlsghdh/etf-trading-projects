import { NextRequest, NextResponse } from 'next/server';
import { getChatSessions, getChatSession } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = parseInt(searchParams.get('userId') || '0');
  const sessionId = searchParams.get('sessionId');

  if (!userId) {
    return NextResponse.json({ error: 'userId 필수' }, { status: 400 });
  }

  if (sessionId) {
    const messages = getChatSession(userId, sessionId);
    return NextResponse.json({ messages });
  }

  const sessions = getChatSessions(userId);
  return NextResponse.json({ sessions });
}
