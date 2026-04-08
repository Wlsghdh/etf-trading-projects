import { NextRequest, NextResponse } from 'next/server';
import { saveChatMessage, getChatSession } from '@/lib/db';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type AIModel = 'chatgpt' | 'gemini' | 'claude';

const SYSTEM_PROMPT = `당신은 미국 ETF/주식 분석 전문가입니다. 한국어로 답변하세요.
사용자가 제공하는 실시간 데이터를 기반으로 분석하세요.
간결하고 핵심적인 인사이트를 제공하세요.`;

function friendlyError(model: string, err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('429') || msg.includes('quota'))
    return `[${model}] 크레딧이 부족합니다. API 결제 후 이용 가능합니다.`;
  if (msg.includes('401') || msg.includes('Incorrect API'))
    return `[${model}] API 키가 올바르지 않습니다. .env를 확인하세요.`;
  if (msg.includes('credit balance is too low'))
    return `[${model}] 크레딧이 부족합니다. 결제 페이지에서 충전해주세요.`;
  if (msg.includes('invalid_api_key'))
    return `[${model}] API 키가 유효하지 않습니다.`;
  return `[${model}] 오류: ${msg.length > 100 ? msg.slice(0, 100) + '...' : msg}`;
}

async function callChatGPT(messages: { role: string; content: string }[], context: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return '[ChatGPT] API 키 미설정. .env에 OPENAI_API_KEY를 추가하세요.';

  const openai = new OpenAI({ apiKey: key });
  const resp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT + (context ? '\n\n[데이터]\n' + context : '') },
      ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ],
    max_tokens: 1000,
    temperature: 0.7,
  });
  return resp.choices[0]?.message?.content || '응답 없음';
}

async function callGemini(messages: { role: string; content: string }[], context: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return '[Gemini] API 키 미설정. .env에 GEMINI_API_KEY를 추가하세요.';

  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  // systemInstruction은 Content 객체 형태로 전달
  const history = messages.slice(0, -1).map(m => ({
    role: m.role === 'user' ? 'user' as const : 'model' as const,
    parts: [{ text: m.content }],
  }));

  // history가 model로 시작하면 안됨 - 필터링
  const cleanHistory = history.length > 0 && history[0].role === 'model'
    ? history.slice(1)
    : history;

  const systemText = SYSTEM_PROMPT + (context ? '\n\n[데이터]\n' + context : '');

  const chat = model.startChat({
    history: cleanHistory,
    systemInstruction: { role: 'user', parts: [{ text: systemText }] },
  });

  const lastMsg = messages[messages.length - 1];
  const result = await chat.sendMessage(lastMsg.content);
  return result.response.text() || '응답 없음';
}

async function callClaude(messages: { role: string; content: string }[], context: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return '[Claude] API 키 미설정. .env에 ANTHROPIC_API_KEY를 추가하세요.';

  const client = new Anthropic({ apiKey: key });

  // messages가 assistant로 시작하면 안됨 - user로 시작하도록 보장
  const cleanMsgs = messages.filter(m => m.role === 'user' || m.role === 'assistant');
  const safeMsgs = cleanMsgs.length > 0 && cleanMsgs[0].role === 'assistant'
    ? cleanMsgs.slice(1)
    : cleanMsgs;

  if (safeMsgs.length === 0) {
    return '[Claude] 메시지가 비어있습니다.';
  }

  const resp = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    system: SYSTEM_PROMPT + (context ? '\n\n[데이터]\n' + context : ''),
    messages: safeMsgs.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
  });
  const block = resp.content[0];
  return block.type === 'text' ? block.text : '응답 없음';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { model, message, symbol, analysisContext, userId, sessionId } = body as {
      model: AIModel;
      message: string;
      symbol?: string;
      analysisContext?: string;
      userId: number;
      sessionId: string;
    };

    if (!message || !model || !userId || !sessionId) {
      return NextResponse.json({ error: 'message, model, userId, sessionId 필수' }, { status: 400 });
    }

    // 이전 대화 기록 로드
    const prevMessages = getChatSession(userId, sessionId) as {
      role: string; content: string; model: string;
    }[];

    // 사용자 메시지 저장
    saveChatMessage(userId, sessionId, 'user', model, message, symbol);

    const context = analysisContext || '';

    // 대화 히스토리 (최근 10개, 해당 모델 대화만)
    const chatHistory = prevMessages
      .filter(m => m.model === model || m.role === 'user')
      .slice(-10)
      .map(m => ({ role: m.role, content: m.content }));
    chatHistory.push({ role: 'user', content: message });

    // AI 호출
    let response: string;
    try {
      switch (model) {
        case 'chatgpt': response = await callChatGPT(chatHistory, context); break;
        case 'gemini': response = await callGemini(chatHistory, context); break;
        case 'claude': response = await callClaude(chatHistory, context); break;
        default: response = 'Unknown model';
      }
    } catch (err) {
      response = friendlyError(model, err);
    }

    // AI 응답 저장
    saveChatMessage(userId, sessionId, 'assistant', model, response, symbol);

    return NextResponse.json({ response, model });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}
