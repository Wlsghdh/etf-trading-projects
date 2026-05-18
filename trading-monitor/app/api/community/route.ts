import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;
// 이미지 업로드 위해 body 크기 제한 늘림 (10MB)
export const runtime = 'nodejs';

// Docker 볼륨 마운트 경로 또는 로컬 경로
const DATA_DIR = process.env.COMMUNITY_DATA_DIR || path.join(process.cwd(), 'data');
const POSTS_FILE = path.join(DATA_DIR, 'community-posts.json');

interface Comment {
  id: string;
  author: string;
  content: string;
  createdAt: string;
  parentId?: string;
  mentions?: string[];
}

interface Report {
  user: string;
  reason: string;
  createdAt: string;
}

interface Post {
  id: string;
  author: string;
  content: string;
  image?: string;
  ticker?: string;
  likes: string[];
  dislikes: string[];
  comments: Comment[];
  reports: Report[];
  hidden?: boolean;
  createdAt: string;
}

async function ensureDir() {
  try { await fs.mkdir(DATA_DIR, { recursive: true }); } catch {}
}

async function readPosts(): Promise<Post[]> {
  await ensureDir();
  try {
    const raw = await fs.readFile(POSTS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writePosts(posts: Post[]) {
  await ensureDir();
  await fs.writeFile(POSTS_FILE, JSON.stringify(posts, null, 2), 'utf-8');
}

// GET: 게시글 목록
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sort = searchParams.get('sort') || 'latest';
  const showHidden = searchParams.get('showHidden') === 'true';

  let posts = await readPosts();

  // Filter out hidden posts unless explicitly requested
  if (!showHidden) {
    posts = posts.filter(p => !p.hidden);
  }

  // Sort
  switch (sort) {
    case 'popular':
      posts.sort((a, b) => {
        const scoreA = (a.likes?.length || 0) - (a.dislikes?.length || 0);
        const scoreB = (b.likes?.length || 0) - (b.dislikes?.length || 0);
        return scoreB - scoreA;
      });
      break;
    case 'comments':
      posts.sort((a, b) => (b.comments?.length || 0) - (a.comments?.length || 0));
      break;
    case 'latest':
    default:
      posts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      break;
  }

  return NextResponse.json({ posts });
}

// POST: 게시글 작성 / 좋아요 / 댓글 / 삭제
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action } = body;

  const posts = await readPosts();

  switch (action) {
    case 'create': {
      const { author, content, image, ticker } = body;
      if (!content?.trim()) {
        return NextResponse.json({ error: '내용을 입력하세요' }, { status: 400 });
      }
      const post: Post = {
        id: crypto.randomUUID(),
        author: author || 'Anonymous',
        content: content.trim(),
        image: image || undefined,
        ticker: ticker?.trim().toUpperCase() || undefined,
        likes: [],
        dislikes: [],
        comments: [],
        reports: [],
        createdAt: new Date().toISOString(),
      };
      posts.unshift(post);
      await writePosts(posts);
      return NextResponse.json({ post });
    }

    case 'like': {
      const { postId, user } = body;
      const post = posts.find(p => p.id === postId);
      if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
      if (!post.dislikes) post.dislikes = [];
      if (post.likes.includes(user)) {
        post.likes = post.likes.filter(u => u !== user);
      } else {
        post.likes.push(user);
        // Mutual exclusion: remove dislike if exists
        post.dislikes = post.dislikes.filter(u => u !== user);
      }
      await writePosts(posts);
      return NextResponse.json({ likes: post.likes, dislikes: post.dislikes });
    }

    case 'dislike': {
      const { postId, user } = body;
      const post = posts.find(p => p.id === postId);
      if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
      if (!post.dislikes) post.dislikes = [];
      if (post.dislikes.includes(user)) {
        post.dislikes = post.dislikes.filter(u => u !== user);
      } else {
        post.dislikes.push(user);
        // Mutual exclusion: remove like if exists
        post.likes = post.likes.filter(u => u !== user);
      }
      await writePosts(posts);
      return NextResponse.json({ likes: post.likes, dislikes: post.dislikes });
    }

    case 'comment': {
      const { postId, user, text, parentId } = body;
      const post = posts.find(p => p.id === postId);
      if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
      // Validate parentId if provided
      if (parentId && !post.comments.find(c => c.id === parentId)) {
        return NextResponse.json({ error: 'Parent comment not found' }, { status: 404 });
      }
      // Extract @mentions from text
      const mentionMatches = text?.match(/@(\w+)/g);
      const mentions = mentionMatches ? mentionMatches.map((m: string) => m.slice(1)) : undefined;
      const comment: Comment = {
        id: crypto.randomUUID(),
        author: user || 'Anonymous',
        content: text,
        createdAt: new Date().toISOString(),
        parentId: parentId || undefined,
        mentions: mentions && mentions.length > 0 ? mentions : undefined,
      };
      post.comments.push(comment);
      await writePosts(posts);
      return NextResponse.json({ comment });
    }

    case 'delete': {
      const { postId, user } = body;
      const idx = posts.findIndex(p => p.id === postId && p.author === user);
      if (idx === -1) return NextResponse.json({ error: 'Not found or not authorized' }, { status: 404 });
      posts.splice(idx, 1);
      await writePosts(posts);
      return NextResponse.json({ success: true });
    }

    case 'report': {
      const { postId, user, reason } = body;
      const post = posts.find(p => p.id === postId);
      if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
      if (!reason?.trim()) {
        return NextResponse.json({ error: '신고 사유를 입력하세요' }, { status: 400 });
      }
      if (!post.reports) post.reports = [];
      // Prevent duplicate reports from same user
      if (post.reports.find(r => r.user === user)) {
        return NextResponse.json({ error: '이미 신고한 게시글입니다' }, { status: 400 });
      }
      post.reports.push({
        user,
        reason: reason.trim(),
        createdAt: new Date().toISOString(),
      });
      // Auto-hide if 5+ reports
      if (post.reports.length >= 5) {
        post.hidden = true;
      }
      await writePosts(posts);
      return NextResponse.json({ reports: post.reports.length, hidden: post.hidden || false });
    }

    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }
}
