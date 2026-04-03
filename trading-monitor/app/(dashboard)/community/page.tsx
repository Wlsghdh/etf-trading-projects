'use client';

import { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  FavouriteIcon,
  Comment02Icon,
  SentIcon,
  Delete02Icon,
  Image02Icon,
  UserIcon,
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
  image?: string;
  ticker?: string;
  likes: string[]; // user ids who liked
  comments: Comment[];
  createdAt: string;
}

// ── LocalStorage helpers ──

const POSTS_KEY = 'community_posts';
const USER_KEY = 'community_user';

function loadPosts(): Post[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(POSTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function savePosts(posts: Post[]) {
  localStorage.setItem(POSTS_KEY, JSON.stringify(posts));
}

function getUser(): string {
  if (typeof window === 'undefined') return 'User';
  let user = localStorage.getItem(USER_KEY);
  if (!user) {
    user = `User_${Math.random().toString(36).slice(2, 6)}`;
    localStorage.setItem(USER_KEY, user);
  }
  return user;
}

// ── 시간 표시 ──
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '방금';
  if (mins < 60) return `${mins}분 전`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}시간 전`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}일 전`;
  return new Date(dateStr).toLocaleDateString('ko-KR');
}

// ── 게시물 컴포넌트 ──
function PostCard({
  post,
  currentUser,
  onLike,
  onComment,
  onDelete,
}: {
  post: Post;
  currentUser: string;
  onLike: (id: string) => void;
  onComment: (id: string, text: string) => void;
  onDelete: (id: string) => void;
}) {
  const [commentText, setCommentText] = useState('');
  const [showComments, setShowComments] = useState(false);
  const liked = post.likes.includes(currentUser);

  return (
    <Card size="sm">
      <CardContent className="space-y-3">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
              <HugeiconsIcon icon={UserIcon} className="h-4 w-4 text-primary" strokeWidth={2} />
            </div>
            <div>
              <span className="text-sm font-semibold">{post.author}</span>
              {post.ticker && (
                <Badge variant="secondary" className="ml-2 text-[10px]">${post.ticker}</Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{timeAgo(post.createdAt)}</span>
            {post.author === currentUser && (
              <button onClick={() => onDelete(post.id)} className="text-muted-foreground hover:text-red-500 transition-colors">
                <HugeiconsIcon icon={Delete02Icon} className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            )}
          </div>
        </div>

        {/* 본문 */}
        <p className="text-sm whitespace-pre-wrap">{post.content}</p>

        {/* 이미지 (URL) */}
        {post.image && (
          <div className="overflow-hidden rounded-lg border border-border">
            <img src={post.image} alt="" className="w-full max-h-80 object-cover" />
          </div>
        )}

        {/* 좋아요 + 댓글 버튼 */}
        <div className="flex items-center gap-4 border-t border-border pt-2">
          <button
            onClick={() => onLike(post.id)}
            className={`flex items-center gap-1 text-sm transition-colors ${liked ? 'text-red-500' : 'text-muted-foreground hover:text-red-500'}`}
          >
            <HugeiconsIcon icon={FavouriteIcon} className="h-4 w-4" strokeWidth={liked ? 3 : 2} />
            <span>{post.likes.length}</span>
          </button>
          <button
            onClick={() => setShowComments(!showComments)}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <HugeiconsIcon icon={Comment02Icon} className="h-4 w-4" strokeWidth={2} />
            <span>{post.comments.length}</span>
          </button>
        </div>

        {/* 댓글 영역 */}
        {showComments && (
          <div className="space-y-2 border-t border-border pt-2">
            {post.comments.map(c => (
              <div key={c.id} className="flex gap-2 text-sm">
                <span className="font-semibold shrink-0">{c.author}</span>
                <span className="text-muted-foreground">{c.content}</span>
                <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{timeAgo(c.createdAt)}</span>
              </div>
            ))}
            <div className="flex gap-2">
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
                className="flex-1 rounded border border-border bg-background px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-primary/50"
              />
              <Button
                size="icon-xs"
                disabled={!commentText.trim()}
                onClick={() => {
                  if (commentText.trim()) {
                    onComment(post.id, commentText.trim());
                    setCommentText('');
                  }
                }}
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
  const [newContent, setNewContent] = useState('');
  const [newTicker, setNewTicker] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setPosts(loadPosts());
    setUser(getUser());
  }, []);

  const createPost = () => {
    const content = newContent.trim();
    if (!content) return;

    const post: Post = {
      id: crypto.randomUUID(),
      author: user,
      content,
      ticker: newTicker.trim().toUpperCase() || undefined,
      likes: [],
      comments: [],
      createdAt: new Date().toISOString(),
    };

    const updated = [post, ...posts];
    setPosts(updated);
    savePosts(updated);
    setNewContent('');
    setNewTicker('');
  };

  const toggleLike = (postId: string) => {
    const updated = posts.map(p => {
      if (p.id !== postId) return p;
      const liked = p.likes.includes(user);
      return { ...p, likes: liked ? p.likes.filter(u => u !== user) : [...p.likes, user] };
    });
    setPosts(updated);
    savePosts(updated);
  };

  const addComment = (postId: string, text: string) => {
    const comment: Comment = {
      id: crypto.randomUUID(),
      author: user,
      content: text,
      createdAt: new Date().toISOString(),
    };
    const updated = posts.map(p =>
      p.id === postId ? { ...p, comments: [...p.comments, comment] } : p
    );
    setPosts(updated);
    savePosts(updated);
  };

  const deletePost = (postId: string) => {
    const updated = posts.filter(p => p.id !== postId);
    setPosts(updated);
    savePosts(updated);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">커뮤니티</h1>
        <Badge variant="outline" className="text-xs">
          <HugeiconsIcon icon={UserIcon} className="mr-1 h-3 w-3" strokeWidth={2} />
          {user}
        </Badge>
      </div>

      {/* 게시물 작성 */}
      <Card size="sm">
        <CardContent className="space-y-3">
          <textarea
            ref={textareaRef}
            value={newContent}
            onChange={e => setNewContent(e.target.value)}
            placeholder="종목 분석, 투자 인사이트를 공유해보세요..."
            rows={3}
            className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <input
                value={newTicker}
                onChange={e => setNewTicker(e.target.value)}
                placeholder="종목 태그 (예: AAPL)"
                className="w-32 rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary/50"
              />
            </div>
            <Button size="sm" disabled={!newContent.trim()} onClick={createPost}>
              게시
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 피드 */}
      {posts.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          <HugeiconsIcon icon={Comment02Icon} className="mx-auto mb-3 h-12 w-12 opacity-20" strokeWidth={1.5} />
          <p className="text-sm">아직 게시물이 없습니다</p>
          <p className="mt-1 text-xs">첫 게시물을 작성해보세요!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map(post => (
            <PostCard
              key={post.id}
              post={post}
              currentUser={user}
              onLike={toggleLike}
              onComment={addComment}
              onDelete={deletePost}
            />
          ))}
        </div>
      )}
    </div>
  );
}
