# Community 페이지

투자자들이 자유롭게 글을 쓰고 추천/비추천·댓글·대댓글·신고로 소통하는 커뮤니티 페이지.

## 디렉토리 역할

- **경로**: `trading-monitor/app/(dashboard)/community/`
- **URL**: `/community` (dashboard 레이아웃 적용)
- **렌더링**: Client Component (`'use client'`)

## 주요 파일

| 파일 | 설명 |
|------|------|
| `page.tsx` | 커뮤니티 메인 페이지 (피드, 정렬, 추천/비추천, 대댓글, 신고 UI) |

## 관련 파일 (외부)

| 위치 | 설명 |
|------|------|
| `app/api/community/route.ts` | GET/POST API 라우트 (create/like/dislike/comment/report/delete) |
| `trading-monitor/data/community-posts.json` | 게시글 저장소 (JSON 파일) |
| `docker-compose.yml` (`trading-monitor` 서비스) | 컨테이너 정의 + 볼륨 마운트 |

## 기능 목록

| 기능 | 상태 | 설명 |
|------|------|------|
| 게시글 CRUD | ✅ | 작성, 조회, 삭제 (본인만) |
| 이미지 첨부 | ✅ | base64 인코딩, 5MB 제한 |
| 종목 태그 | ✅ | 선택사항, 대문자 자동 변환 |
| 정렬 | ✅ | 최신순 / 인기순 / 댓글 많은 순 |
| 추천/비추천 | ✅ | 상호 배타 (추천하면 비추천 해제) |
| 대댓글 | ✅ | parentId 기반 트리 구조 |
| @멘션 | ✅ | 댓글에서 @username 자동 추출, 파란색 하이라이트 |
| 닉네임 | ✅ | 로그인 시 user-name 쿠키 기반 |
| 신고 | ✅ | 5회 이상 신고 시 자동 숨김 |

## 데이터 모델

```ts
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

interface Comment {
  id: string;
  author: string;
  content: string;
  parentId?: string;    // null = 최상위 댓글
  mentions?: string[];  // @멘션 대상 목록
  createdAt: string;
}

interface Report {
  user: string;
  reason: string;
  createdAt: string;
}
```

## API 액션

| action | 필수 필드 | 설명 |
|--------|-----------|------|
| `create` | `author`, `content`, `image?`, `ticker?` | 새 게시글 작성 |
| `like` | `postId`, `user` | 추천 토글 (비추천 자동 해제) |
| `dislike` | `postId`, `user` | 비추천 토글 (추천 자동 해제) |
| `comment` | `postId`, `user`, `text`, `parentId?` | 댓글/대댓글 추가 |
| `report` | `postId`, `user`, `reason?` | 게시글 신고 (5회 시 숨김) |
| `delete` | `postId`, `user` | 본인 게시글 삭제 |

## GET 파라미터

| 파라미터 | 값 | 설명 |
|----------|-----|------|
| `sort` | `latest` (기본), `popular`, `comments` | 정렬 기준 |
| `showHidden` | `true` | 숨김 게시물 포함 (관리자용) |

## 작업 시 주의사항

- 코드 변경 후 반드시 컨테이너 재빌드: `docker compose build trading-monitor && docker compose up -d trading-monitor`
- JSON 파일 기반이라 동시 쓰기 시 race condition 가능
- 이미지는 base64로 저장되므로 JSON 크기 주의 (body limit 10MB)
- API URL: nginx 경유 `/trading/api/community`

## TODO / 개선 아이디어

- [ ] JSON → SQLite/MySQL 마이그레이션
- [ ] 이미지 S3 분리
- [ ] 페이지네이션 / 무한 스크롤
- [ ] 게시글 수정 기능
- [ ] 알림 시스템 (@멘션 시 알림)
