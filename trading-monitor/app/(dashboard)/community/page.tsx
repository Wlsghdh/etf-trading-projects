'use client';

import { useEffect, useState, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
  ThumbsUpIcon,
  ThumbsDownIcon,
  ArrowTurnBackwardIcon,
  Alert02Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
} from '@hugeicons/core-free-icons';

// ── Types ──

type SortMode = 'latest' | 'popular' | 'comments';

interface Comment {
  id: string;
  author: string;
  content: string;
  createdAt: string;
  parentId?: string;
  mentions?: string[];
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
  reports: { user: string; reason: string; createdAt: string }[];
  hidden?: boolean;
  createdAt: string;
}

// ── API ──

const API = '/trading/api/community';

async function apiGetPosts(sort: SortMode = 'latest'): Promise<Post[]> {
  const res = await fetch(`${API}?sort=${sort}`, { cache: 'no-store' });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.posts || []).map((p: Partial<Post>) => ({
    ...p,
    dislikes: p.dislikes || [],
    reports: p.reports || [],
  }));
}

async function apiCreatePost(author: string, content: string, image?: string, ticker?: string): Promise<Post | null> {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'create', author, content, image, ticker }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const post = data.post;
  return { ...post, dislikes: post.dislikes || [], reports: post.reports || [] };
}

async function apiLike(postId: string, user: string) {
  await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'like', postId, user }),
  });
}

async function apiDislike(postId: string, user: string) {
  await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'dislike', postId, user }),
  });
}

async function apiComment(postId: string, user: string, text: string, parentId?: string) {
  await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'comment', postId, user, text, parentId }),
  });
}

async function apiDelete(postId: string, user: string) {
  await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete', postId, user }),
  });
}

async function apiReport(postId: string, user: string, reason: string) {
  await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'report', postId, user, reason }),
  });
}

// ── User (로그인 쿠키 기반) ──

function getUser(): string {
  if (typeof document === 'undefined') return 'User';
  const match = document.cookie.match(/(^| )user-name=([^;]+)/);
  return match ? decodeURIComponent(match[2]) : 'User';
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

function getUserRole(): string {
  if (typeof document === 'undefined') return 'user';
  const match = document.cookie.match(/(^| )user-role=([^;]+)/);
  return match ? decodeURIComponent(match[2]) : 'user';
}

/** Render comment text with @mentions highlighted */
function renderMentions(text: string) {
  const parts = text.split(/(@\w+)/g);
  return parts.map((part, i) =>
    part.startsWith('@') ? (
      <span key={i} className="font-semibold text-blue-500">{part}</span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

// ── 정렬 탭 ──
const SORT_TABS: { key: SortMode; label: string }[] = [
  { key: 'latest', label: '최신순' },
  { key: 'popular', label: '인기순' },
  { key: 'comments', label: '댓글 많은 순' },
];

// ── 게시글 작성 모달 ──
function WriteModal({ user, onPost, onClose }: {
  user: string;
  onPost: (content: string, image?: string, ticker?: string) => void;
  onClose: () => void;
}) {
  const [content, setContent] = useState('');
  const [ticker, setTicker] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert('5MB 이하 이미지만 첨부 가능합니다.'); return; }
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const submit = async () => {
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    await onPost(content.trim(), image || undefined, ticker.trim().toUpperCase() || undefined);
    setSubmitting(false);
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

        {image && (
          <div className="relative mb-3">
            <img src={image} alt="" className="max-h-48 w-full rounded-lg border border-border object-cover" />
            <button onClick={() => setImage(null)} className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80">
              <HugeiconsIcon icon={Cancel01Icon} className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <HugeiconsIcon icon={Image02Icon} className="mr-1 h-3.5 w-3.5" strokeWidth={2} />
            사진
          </Button>
          <input
            value={ticker}
            onChange={e => setTicker(e.target.value)}
            placeholder="종목 태그"
            className="w-24 rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary/50"
          />
          <Button className="ml-auto" size="sm" disabled={!content.trim() || submitting} onClick={submit}>
            {submitting ? '게시 중...' : '게시'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── 댓글 아이템 (재귀 nested replies) ──
function CommentItem({ comment, allComments, user, postId, onComment }: {
  comment: Comment;
  allComments: Comment[];
  user: string;
  postId: string;
  onComment: (id: string, text: string, parentId?: string) => void;
}) {
  const [replyText, setReplyText] = useState('');
  const [showReply, setShowReply] = useState(false);
  const replies = allComments.filter(c => c.parentId === comment.id);

  const handleReply = () => {
    setShowReply(true);
    setReplyText(`@${comment.author} `);
  };

  const submitReply = () => {
    if (!replyText.trim()) return;
    onComment(postId, replyText.trim(), comment.id);
    setReplyText('');
    setShowReply(false);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2 text-sm">
        <span className="shrink-0 font-semibold">{comment.author}</span>
        <span className="flex-1">{renderMentions(comment.content)}</span>
        <span className="shrink-0 text-[10px] text-muted-foreground">{timeAgo(comment.createdAt)}</span>
      </div>
      <div className="flex items-center gap-3 pl-0">
        <button onClick={handleReply} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
          <HugeiconsIcon icon={ArrowTurnBackwardIcon} className="h-3 w-3" strokeWidth={2} />
          답글
        </button>
        {replies.length > 0 && (
          <span className="text-[11px] text-muted-foreground">답글 {replies.length}개</span>
        )}
      </div>
      {showReply && (
        <div className="flex gap-2 pt-1 pl-4">
          <input
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submitReply(); }}
            autoFocus
            placeholder="답글 입력..."
            className="flex-1 rounded border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary/50"
          />
          <Button size="icon-xs" disabled={!replyText.trim()} onClick={submitReply}>
            <HugeiconsIcon icon={SentIcon} className="h-3 w-3" strokeWidth={2} />
          </Button>
          <button onClick={() => setShowReply(false)} className="text-xs text-muted-foreground hover:text-foreground">취소</button>
        </div>
      )}
      {replies.length > 0 && (
        <div className="ml-5 space-y-1.5 border-l-2 border-border pl-3">
          {replies.map(r => (
            <CommentItem key={r.id} comment={r} allComments={allComments} user={user} postId={postId} onComment={onComment} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── 게시글 카드 ──
function PostCard({ post, user, userRole, onLike, onDislike, onComment, onDelete, onReport }: {
  post: Post; user: string; userRole: string;
  onLike: (id: string) => void;
  onDislike: (id: string) => void;
  onComment: (id: string, text: string, parentId?: string) => void;
  onDelete: (id: string) => void;
  onReport: (id: string) => void;
}) {
  const [commentText, setCommentText] = useState('');
  const [showComments, setShowComments] = useState(false);
  const upvoted = post.likes.includes(user);
  const downvoted = post.dislikes.includes(user);
  const netScore = post.likes.length - post.dislikes.length;
  const topLevelComments = post.comments.filter(c => !c.parentId);

  return (
    <Card size="sm">
      <CardContent className="space-y-3">
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
          <div className="flex items-center gap-2">
            {post.author !== user && (
              <button
                onClick={() => onReport(post.id)}
                className="text-muted-foreground hover:text-orange-500 transition-colors"
                title="신고"
              >
                <HugeiconsIcon icon={Alert02Icon} className="h-4 w-4" strokeWidth={2} />
              </button>
            )}
            {userRole === 'admin' && post.reports.length > 0 && (
              <Badge variant="destructive" className="text-[10px]">신고 {post.reports.length}</Badge>
            )}
            {post.author === user && (
              <button onClick={() => onDelete(post.id)} className="text-muted-foreground hover:text-red-500 transition-colors">
                <HugeiconsIcon icon={Delete02Icon} className="h-4 w-4" strokeWidth={2} />
              </button>
            )}
          </div>
        </div>

        <p className="text-sm whitespace-pre-wrap leading-relaxed">{post.content}</p>

        {post.image && (
          <div className="overflow-hidden rounded-lg border border-border">
            <img src={post.image} alt="" className="w-full max-h-96 object-cover" />
          </div>
        )}

        <div className="flex items-center gap-5 border-t border-border pt-2.5">
          {/* Upvote / Downvote */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => onLike(post.id)}
              className={`flex items-center gap-1 text-sm transition-colors ${upvoted ? 'text-green-500' : 'text-muted-foreground hover:text-green-500'}`}
            >
              <HugeiconsIcon icon={ThumbsUpIcon} className="h-5 w-5" strokeWidth={upvoted ? 3 : 2} />
            </button>
            <span className={`min-w-[1.5rem] text-center text-sm font-medium ${netScore > 0 ? 'text-green-500' : netScore < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
              {netScore !== 0 ? netScore : ''}
            </span>
            <button
              onClick={() => onDislike(post.id)}
              className={`flex items-center gap-1 text-sm transition-colors ${downvoted ? 'text-red-500' : 'text-muted-foreground hover:text-red-500'}`}
            >
              <HugeiconsIcon icon={ThumbsDownIcon} className="h-5 w-5" strokeWidth={downvoted ? 3 : 2} />
            </button>
          </div>
          <button
            onClick={() => setShowComments(!showComments)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <HugeiconsIcon icon={Comment02Icon} className="h-5 w-5" strokeWidth={2} />
            <span>{post.comments.length > 0 ? post.comments.length : ''}</span>
          </button>
        </div>

        {showComments && (
          <div className="space-y-2 border-t border-border pt-2">
            {topLevelComments.length === 0 && <p className="text-xs text-muted-foreground">댓글이 없습니다</p>}
            {topLevelComments.map(c => (
              <CommentItem key={c.id} comment={c} allComments={post.comments} user={user} postId={post.id} onComment={onComment} />
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
  const [userRole, setUserRole] = useState('user');
  const [showWrite, setShowWrite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortMode>('latest');

  const loadData = async (sortMode: SortMode = sort) => {
    const p = await apiGetPosts(sortMode);
    setPosts(p);
    setLoading(false);
  };

  useEffect(() => {
    setUser(getUser());
    setUserRole(getUserRole());
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSortChange = (newSort: SortMode) => {
    setSort(newSort);
    setLoading(true);
    loadData(newSort);
  };

  const handlePost = async (content: string, image?: string, ticker?: string) => {
    const post = await apiCreatePost(user, content, image, ticker);
    if (post) setPosts(prev => [post, ...prev]);
  };

  const handleLike = async (id: string) => {
    // Optimistic update: toggle like, remove dislike if active
    setPosts(prev => prev.map(p => {
      if (p.id !== id) return p;
      const liked = p.likes.includes(user);
      return {
        ...p,
        likes: liked ? p.likes.filter(u => u !== user) : [...p.likes, user],
        dislikes: p.dislikes.filter(u => u !== user), // remove dislike
      };
    }));
    await apiLike(id, user);
  };

  const handleDislike = async (id: string) => {
    // Optimistic update: toggle dislike, remove like if active
    setPosts(prev => prev.map(p => {
      if (p.id !== id) return p;
      const disliked = p.dislikes.includes(user);
      return {
        ...p,
        dislikes: disliked ? p.dislikes.filter(u => u !== user) : [...p.dislikes, user],
        likes: p.likes.filter(u => u !== user), // remove like
      };
    }));
    await apiDislike(id, user);
  };

  const handleComment = async (id: string, text: string, parentId?: string) => {
    const tempComment: Comment = { id: `temp-${Date.now()}`, author: user, content: text, createdAt: new Date().toISOString(), parentId };
    setPosts(prev => prev.map(p => p.id === id ? { ...p, comments: [...p.comments, tempComment] } : p));
    await apiComment(id, user, text, parentId);
    loadData(); // 서버 데이터 동기화
  };

  const handleDelete = async (id: string) => {
    setPosts(prev => prev.filter(p => p.id !== id));
    await apiDelete(id, user);
  };

  const handleReport = async (id: string) => {
    if (!confirm('이 게시물을 신고하시겠습니까?')) return;
    // Optimistic update
    setPosts(prev => prev.map(p => {
      if (p.id !== id) return p;
      if (p.reports.some(r => r.user === user)) return p; // already reported
      return { ...p, reports: [...p.reports, { user, reason: '사용자 신고', createdAt: new Date().toISOString() }] };
    }));
    await apiReport(id, user, '사용자 신고');
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
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

      {/* 정렬 탭 */}
      <div className="flex gap-1 rounded-lg border border-border bg-muted/30 p-1">
        {SORT_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => handleSortChange(tab.key)}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              sort === tab.key
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {showWrite && <WriteModal user={user} onPost={handlePost} onClose={() => setShowWrite(false)} />}

      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : posts.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground">
          <HugeiconsIcon icon={Comment02Icon} className="mx-auto mb-3 h-14 w-14 opacity-20" strokeWidth={1.5} />
          <p className="text-sm font-medium">아직 게시물이 없습니다</p>
          <p className="mt-1 text-xs">오른쪽 상단의 &quot;게시글 쓰기&quot;로 첫 게시물을 작성해보세요!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map(post => (
            <PostCard
              key={post.id}
              post={post}
              user={user}
              userRole={userRole}
              onLike={handleLike}
              onDislike={handleDislike}
              onComment={handleComment}
              onDelete={handleDelete}
              onReport={handleReport}
            />
          ))}
        </div>
      )}
    </div>
  );
}
