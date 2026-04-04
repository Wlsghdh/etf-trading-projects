'use client';

import { useEffect, useState, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  FavouriteIcon,
  Comment02Icon,
  SentIcon,
  Delete02Icon,
  UserIcon,
  PencilEdit02Icon,
  Cancel01Icon,
  Image02Icon,
} from '@hugeicons/core-free-icons';

// ── Types ──

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
  image?: string; // base64 data URL or external URL
  ticker?: string;
  likes: string[];
  comments: Comment[];
  createdAt: string;
}

// ── Storage ──

const POSTS_KEY = 'community_posts';
const USER_KEY = 'community_user';

function loadPosts(): Post[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(POSTS_KEY) || '[]'); } catch { return []; }
}
function savePosts(posts: Post[]) { localStorage.setItem(POSTS_KEY, JSON.stringify(posts)); }
function getUser(): string {
  if (typeof window === 'undefined') return 'User';
  let u = localStorage.getItem(USER_KEY);
  if (!u) { u = `User_${Math.random().toString(36).slice(2, 6)}`; localStorage.setItem(USER_KEY, u); }
  return u;
}

function timeAgo(d: string): string {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}일 전`;
  return new Date(d).toLocaleDateString('ko-KR');
}

// ── 게시글 작성 모달 ──
function WriteModal({ user, onPost, onClose }: {
  user: string;
  onPost: (post: Post) => void;
  onClose: () => void;
}) {
  const [content, setContent] = useState('');
  const [ticker, setTicker] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert('5MB 이하 이미지만 첨부 가능합니다.'); return; }
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const submit = () => {
    if (!content.trim()) return;
    onPost({
      id: crypto.randomUUID(),
      author: user,
      content: content.trim(),
      image: image || undefined,
      ticker: ticker.trim().toUpperCase() || undefined,
      likes: [],
      comments: [],
      createdAt: new Date().toISOString(),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">게시글 작성</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <HugeiconsIcon icon={Cancel01Icon} className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>

        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="종목 분석, 투자 인사이트를 공유해보세요..."
          rows={4}
          autoFocus
          className="mb-3 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
        />

        {/* 이미지 미리보기 */}
        {image && (
          <div className="relative mb-3">
            <img src={image} alt="" className="max-h-48 w-full rounded-lg border border-border object-cover" />
            <button
              onClick={() => setImage(null)}
              className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
            >
              <HugeiconsIcon icon={Cancel01Icon} className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
        )}

        <div className="flex items-center gap-2">
          {/* 사진 첨부 */}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <HugeiconsIcon icon={Image02Icon} className="mr-1 h-3.5 w-3.5" strokeWidth={2} />
            사진
          </Button>

          {/* 종목 태그 */}
          <input
            value={ticker}
            onChange={e => setTicker(e.target.value)}
            placeholder="종목 태그"
            className="w-24 rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary/50"
          />

          <Button className="ml-auto" size="sm" disabled={!content.trim()} onClick={submit}>
            게시
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── 게시글 카드 ──
function PostCard({ post, user, onLike, onComment, onDelete }: {
  post: Post; user: string;
  onLike: (id: string) => void;
  onComment: (id: string, text: string) => void;
  onDelete: (id: string) => void;
}) {
  const [commentText, setCommentText] = useState('');
  const [showComments, setShowComments] = useState(false);
  const liked = post.likes.includes(user);

  return (
    <Card size="sm">
      <CardContent className="space-y-3">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
              <HugeiconsIcon icon={UserIcon} className="h-4 w-4 text-primary" strokeWidth={2} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{post.author}</span>
                {post.ticker && <Badge variant="secondary" className="text-[10px]">${post.ticker}</Badge>}
              </div>
              <span className="text-[11px] text-muted-foreground">{timeAgo(post.createdAt)}</span>
            </div>
          </div>
          {post.author === user && (
            <button onClick={() => onDelete(post.id)} className="text-muted-foreground hover:text-red-500 transition-colors">
              <HugeiconsIcon icon={Delete02Icon} className="h-4 w-4" strokeWidth={2} />
            </button>
          )}
        </div>

        {/* 본문 */}
        <p className="text-sm whitespace-pre-wrap leading-relaxed">{post.content}</p>

        {/* 이미지 */}
        {post.image && (
          <div className="overflow-hidden rounded-lg border border-border">
            <img src={post.image} alt="" className="w-full max-h-96 object-cover" />
          </div>
        )}

        {/* 좋아요 + 댓글 */}
        <div className="flex items-center gap-5 border-t border-border pt-2.5">
          <button
            onClick={() => onLike(post.id)}
            className={`flex items-center gap-1.5 text-sm transition-colors ${liked ? 'text-red-500' : 'text-muted-foreground hover:text-red-500'}`}
          >
            <HugeiconsIcon icon={FavouriteIcon} className="h-5 w-5" strokeWidth={liked ? 3 : 2} />
            <span>{post.likes.length > 0 ? post.likes.length : ''}</span>
          </button>
          <button
            onClick={() => setShowComments(!showComments)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <HugeiconsIcon icon={Comment02Icon} className="h-5 w-5" strokeWidth={2} />
            <span>{post.comments.length > 0 ? post.comments.length : ''}</span>
          </button>
        </div>

        {/* 댓글 */}
        {showComments && (
          <div className="space-y-2 border-t border-border pt-2">
            {post.comments.length === 0 && (
              <p className="text-xs text-muted-foreground">댓글이 없습니다</p>
            )}
            {post.comments.map(c => (
              <div key={c.id} className="flex gap-2 text-sm">
                <span className="shrink-0 font-semibold">{c.author}</span>
                <span className="flex-1">{c.content}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">{timeAgo(c.createdAt)}</span>
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <input
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && commentText.trim()) {
                    onComment(post.id, commentText.trim());
                    setCommentText('');
                  }
                }}
                placeholder="댓글 입력..."
                className="flex-1 rounded border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary/50"
              />
              <Button
                size="icon-xs"
                disabled={!commentText.trim()}
                onClick={() => { if (commentText.trim()) { onComment(post.id, commentText.trim()); setCommentText(''); } }}
              >
                <HugeiconsIcon icon={SentIcon} className="h-3 w-3" strokeWidth={2} />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── 메인 ──
export default function CommunityPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [user, setUser] = useState('User');
  const [showWrite, setShowWrite] = useState(false);

  useEffect(() => {
    setPosts(loadPosts());
    setUser(getUser());
  }, []);

  const addPost = (post: Post) => {
    const updated = [post, ...posts];
    setPosts(updated);
    savePosts(updated);
  };

  const toggleLike = (id: string) => {
    const updated = posts.map(p => {
      if (p.id !== id) return p;
      const liked = p.likes.includes(user);
      return { ...p, likes: liked ? p.likes.filter(u => u !== user) : [...p.likes, user] };
    });
    setPosts(updated);
    savePosts(updated);
  };

  const addComment = (id: string, text: string) => {
    const c: Comment = { id: crypto.randomUUID(), author: user, content: text, createdAt: new Date().toISOString() };
    const updated = posts.map(p => p.id === id ? { ...p, comments: [...p.comments, c] } : p);
    setPosts(updated);
    savePosts(updated);
  };

  const deletePost = (id: string) => {
    const updated = posts.filter(p => p.id !== id);
    setPosts(updated);
    savePosts(updated);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">커뮤니티</h1>
          <p className="text-xs text-muted-foreground">종목 분석과 투자 인사이트를 공유하세요</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-xs">
            <HugeiconsIcon icon={UserIcon} className="mr-1 h-3 w-3" strokeWidth={2} />
            {user}
          </Badge>
          <Button size="sm" onClick={() => setShowWrite(true)}>
            <HugeiconsIcon icon={PencilEdit02Icon} className="mr-1 h-3.5 w-3.5" strokeWidth={2} />
            게시글 쓰기
          </Button>
        </div>
      </div>

      {/* 작성 모달 */}
      {showWrite && <WriteModal user={user} onPost={addPost} onClose={() => setShowWrite(false)} />}

      {/* 피드 */}
      {posts.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground">
          <HugeiconsIcon icon={Comment02Icon} className="mx-auto mb-3 h-14 w-14 opacity-20" strokeWidth={1.5} />
          <p className="text-sm font-medium">아직 게시물이 없습니다</p>
          <p className="mt-1 text-xs">오른쪽 상단의 &quot;게시글 쓰기&quot;로 첫 게시물을 작성해보세요!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map(post => (
            <PostCard key={post.id} post={post} user={user} onLike={toggleLike} onComment={addComment} onDelete={deletePost} />
          ))}
        </div>
      )}
    </div>
  );
}
