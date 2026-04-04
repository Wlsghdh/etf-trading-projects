import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

// Docker 볼륨 마운트 경로 또는 로컬 경로
const DATA_DIR = process.env.COMMUNITY_DATA_DIR || path.join(process.cwd(), 'data');
const POSTS_FILE = path.join(DATA_DIR, 'community-posts.json');

interface Comment {
  id: string;
  author: string;
  content: string;
  createdAt: string;
}

interface Post {
  id: string;
  author: string;
  content: string;
  image?: string;
  ticker?: string;
  likes: string[];
  comments: Comment[];
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
export async function GET() {
  const posts = await readPosts();
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
        comments: [],
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
      if (post.likes.includes(user)) {
        post.likes = post.likes.filter(u => u !== user);
      } else {
        post.likes.push(user);
      }
      await writePosts(posts);
      return NextResponse.json({ likes: post.likes });
    }

    case 'comment': {
      const { postId, user, text } = body;
      const post = posts.find(p => p.id === postId);
      if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
      const comment: Comment = {
        id: crypto.randomUUID(),
        author: user || 'Anonymous',
        content: text,
        createdAt: new Date().toISOString(),
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

    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }
}
