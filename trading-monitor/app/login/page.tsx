'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async () => {
    if (!id || !pw) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/trading/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: id, password: pw }),
      });

      if (res.ok) {
        window.location.href = '/trading/';
      } else {
        setError('아이디 또는 비밀번호가 올바르지 않습니다.');
      }
    } catch {
      setError('서버 연결 실패');
    }
    setLoading(false);
  };

  const handleRegister = async () => {
    if (!id || !pw) return;
    setLoading(true);
    setError('');
    setSuccess('');

    if (pw !== pwConfirm) {
      setError('비밀번호가 일치하지 않습니다.');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/trading/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: id, password: pw, displayName: displayName || id }),
      });

      const data = await res.json();
      if (res.ok) {
        setSuccess('회원가입 완료! 로그인해주세요.');
        setMode('login');
        setPw('');
        setPwConfirm('');
        setDisplayName('');
      } else {
        setError(data.error || '회원가입 실패');
      }
    } catch {
      setError('서버 연결 실패');
    }
    setLoading(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'login') handleLogin();
    else handleRegister();
  };

  const inputClass = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 px-4">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <span className="text-lg font-bold text-primary-foreground">T</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Trading Monitor</h1>
          <p className="text-sm text-muted-foreground">AI ETF 자동매매 파이프라인</p>
        </div>

        {/* 탭 */}
        <div className="flex rounded-lg bg-muted p-1">
          <button type="button"
            onClick={() => { setMode('login'); setError(''); }}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
              mode === 'login' ? 'bg-background shadow text-foreground' : 'text-muted-foreground'
            }`}>
            로그인
          </button>
          <button type="button"
            onClick={() => { setMode('register'); setError(''); setSuccess(''); }}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
              mode === 'register' ? 'bg-background shadow text-foreground' : 'text-muted-foreground'
            }`}>
            회원가입
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">아이디</label>
            <input type="text" value={id} onChange={e => setId(e.target.value)}
              className={inputClass} placeholder={mode === 'register' ? '3~20자' : '아이디'} autoFocus />
          </div>

          {mode === 'register' && (
            <div className="space-y-2">
              <label className="text-sm font-medium">닉네임 <span className="text-muted-foreground font-normal">(선택)</span></label>
              <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
                className={inputClass} placeholder="표시될 이름" />
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">비밀번호</label>
            <input type="password" value={pw} onChange={e => setPw(e.target.value)}
              className={inputClass} placeholder={mode === 'register' ? '4자 이상' : '비밀번호'} />
          </div>

          {mode === 'register' && (
            <div className="space-y-2">
              <label className="text-sm font-medium">비밀번호 확인</label>
              <input type="password" value={pwConfirm} onChange={e => setPwConfirm(e.target.value)}
                className={inputClass} placeholder="비밀번호 재입력" />
            </div>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}
          {success && <p className="text-sm text-green-500">{success}</p>}

          <button type="submit" disabled={loading}
            className="flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
            {loading ? '처리 중...' : mode === 'login' ? '로그인' : '회원가입'}
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground">Snowballing AI ETF</p>
      </div>
    </div>
  );
}
