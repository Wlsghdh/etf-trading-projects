import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const DATA_DIR = process.env.COMMUNITY_DATA_DIR || path.join(process.cwd(), 'data');
const CACHE_FILE = path.join(DATA_DIR, 'news-cache.json');
const VOTES_FILE = path.join(DATA_DIR, 'news-votes.json');
const CACHE_TTL = 60 * 60 * 1000; // 1시간

// ── Types ──

interface NewsItem {
  id: string;
  title: string;
  link: string;
  source: string;
  pubDate: string;
  symbol?: string; // 관련 종목 (검색 시)
}

interface NewsCache {
  items: NewsItem[];
  fetchedAt: number;
  query?: string;
}

interface VoteData {
  [newsId: string]: {
    good: string[]; // user IDs
    bad: string[];
  };
}

// ── Helpers ──

async function ensureDir() {
  try { await fs.mkdir(DATA_DIR, { recursive: true }); } catch {}
}

async function readVotes(): Promise<VoteData> {
  await ensureDir();
  try {
    const raw = await fs.readFile(VOTES_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeVotes(votes: VoteData) {
  await ensureDir();
  await fs.writeFile(VOTES_FILE, JSON.stringify(votes, null, 2), 'utf-8');
}

async function readCache(query: string): Promise<NewsCache | null> {
  await ensureDir();
  try {
    const raw = await fs.readFile(CACHE_FILE, 'utf-8');
    const caches: Record<string, NewsCache> = JSON.parse(raw);
    const cache = caches[query];
    if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
      return cache;
    }
    return null;
  } catch {
    return null;
  }
}

async function writeCache(query: string, cache: NewsCache) {
  await ensureDir();
  let caches: Record<string, NewsCache> = {};
  try {
    const raw = await fs.readFile(CACHE_FILE, 'utf-8');
    caches = JSON.parse(raw);
  } catch {}
  caches[query] = cache;
  // 오래된 캐시 정리 (24시간 이상)
  for (const key of Object.keys(caches)) {
    if (Date.now() - caches[key].fetchedAt > 24 * 60 * 60 * 1000) {
      delete caches[key];
    }
  }
  await fs.writeFile(CACHE_FILE, JSON.stringify(caches, null, 2), 'utf-8');
}

// ── RSS 파싱 (Google News) ──

function parseRSSItems(xml: string, symbol?: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  let index = 0;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];

    const title = extractTag(itemXml, 'title');
    const link = extractTag(itemXml, 'link');
    const pubDate = extractTag(itemXml, 'pubDate');
    const source = extractTag(itemXml, 'source') || 'Google News';
    // Google News RSS에서 guid 추출
    const guid = extractTag(itemXml, 'guid');

    if (title) {
      const parts = title.split(' - ');
      const cleanTitle = parts.length > 1 ? parts.slice(0, -1).join(' - ') : title;
      const newsSource = parts.length > 1 ? parts[parts.length - 1] : source;

      // ID: guid > title hash (link는 모두 동일 URL이라 사용 불가)
      const idSource = guid || `${cleanTitle}_${index}`;
      const id = Buffer.from(idSource).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);

      items.push({
        id,
        title: decodeHTMLEntities(cleanTitle),
        link: link || guid || '#',
        source: decodeHTMLEntities(newsSource),
        pubDate: pubDate || new Date().toISOString(),
        symbol: symbol || undefined,
      });
      index++;
    }
  }

  return items.slice(0, 20);
}

function extractTag(xml: string, tag: string): string {
  // CDATA 처리
  const cdataRegex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`);
  const cdataMatch = xml.match(cdataRegex);
  if (cdataMatch) return cdataMatch[1].trim();

  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`);
  const match = xml.match(regex);
  return match ? match[1].trim() : '';
}

function decodeHTMLEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
}

async function fetchNews(query: string, symbol?: string): Promise<NewsItem[]> {
  // 캐시 확인
  const cached = await readCache(query);
  if (cached) return cached.items;

  try {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://news.google.com/rss/search?q=${encodedQuery}&hl=en-US&gl=US&ceid=US:en`;

    const resp = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

    if (!resp.ok) throw new Error(`RSS fetch failed: ${resp.status}`);
    const xml = await resp.text();
    const items = parseRSSItems(xml, symbol);

    // 캐시 저장
    await writeCache(query, { items, fetchedAt: Date.now(), query });
    return items;
  } catch (error) {
    console.error('[News] RSS 조회 실패:', error);
    return [];
  }
}

// ── GET: 뉴스 목록 + 투표 현황 ──

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol') || '';
  const category = searchParams.get('category') || 'market'; // market, symbol

  let query: string;
  if (symbol) {
    query = `${symbol} stock price today`;
  } else if (category === 'market') {
    query = 'stock market today when:1d';
  } else {
    query = 'stock market news today when:1d';
  }

  const [items, votes] = await Promise.all([
    fetchNews(query, symbol || undefined),
    readVotes(),
  ]);

  // 뉴스 + 투표 병합
  const newsWithVotes = items.map(item => {
    const v = votes[item.id] || { good: [], bad: [] };
    return {
      ...item,
      goodCount: v.good.length,
      badCount: v.bad.length,
      goodUsers: v.good,
      badUsers: v.bad,
    };
  });

  return NextResponse.json({ news: newsWithVotes });
}

// ── POST: 투표 ──

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action, newsId, user } = body;

  if (!newsId || !user) {
    return NextResponse.json({ error: 'newsId와 user가 필요합니다' }, { status: 400 });
  }

  const votes = await readVotes();

  if (!votes[newsId]) {
    votes[newsId] = { good: [], bad: [] };
  }

  const v = votes[newsId];

  if (action === 'good') {
    // 이미 good이면 취소, bad였으면 전환
    if (v.good.includes(user)) {
      v.good = v.good.filter(u => u !== user);
    } else {
      v.bad = v.bad.filter(u => u !== user);
      v.good.push(user);
    }
  } else if (action === 'bad') {
    if (v.bad.includes(user)) {
      v.bad = v.bad.filter(u => u !== user);
    } else {
      v.good = v.good.filter(u => u !== user);
      v.bad.push(user);
    }
  } else {
    return NextResponse.json({ error: 'action은 good 또는 bad여야 합니다' }, { status: 400 });
  }

  await writeVotes(votes);

  return NextResponse.json({
    goodCount: v.good.length,
    badCount: v.bad.length,
    goodUsers: v.good,
    badUsers: v.bad,
  });
}
