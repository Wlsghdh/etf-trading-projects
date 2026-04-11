# Community 페이지

투자자들이 자유롭게 글을 쓰고 좋아요·댓글로 소통하는 커뮤니티 페이지.

## 디렉토리 역할

- **경로**: `trading-monitor/app/(dashboard)/community/`
- **URL**: `/community` (dashboard 레이웃 적용)
- **렌더링**: Client Component (`'use client'`)

## 주요 파일

| 파일 | 설명 |
|------|------|
| `page.tsx` | 커뮤니티 메인 페이지 (피드, 작성 폼, 좋아요/댓글 UI) |

## 관련 파일 (외부)

| 위치 | 설명 |
|------|------|
| `app/api/community/route.ts` | GET/POST API 라우트 (create/like/comment/delete) |
| `trading-monitor/data/community-posts.json` | 게시글 저장소 (JSON 파일) |
| `docker-compose.yml` (`trading-monitor` 서비스) | 컨테이너 정의 + 볼륨 마운트 |

## 데이터 흐름

```
page.tsx (Client)
   │  fetch
   ▼
/trading/api/community  ──►  app/api/community/route.ts
                                 │  read/write
                                 ▼
                       trading-monitor/data/community-posts.json
```

## 데이터 모델

```ts
interface Post {
  id: string;          // crypto.randomUUID()
  author: string;
  content: string;
  image?: string;      // base64 또는 URL
  ticker?: string;     // 종목 태그 (대문자)
  likes: string[];     // 좋아요 누른 user 목록
  comments: Comment[];
  createdAt: string;   // ISO 8601
}

interface Comment {
  id: string;
  author: string;
  content: string;
  createdAt: string;
}
```

## API 액션 (POST body의 `action` 필드)

| action | 필수 필드 | 설명 |
|--------|-----------|------|
| `create` | `author`, `content`, `image?`, `ticker?` | 새 게시글 작성 |
| `like` | `postId`, `user` | 좋아요 토글 |
| `comment` | `postId`, `user`, `text` | 댓글 추가 |
| `delete` | `postId`, `user` | 본인 게시글 삭제 |

## 작업 시 주의사항

- 코드 변경 후 반드시 컨테이너 재빌드: `docker compose build trading-monitor && docker compose up -d trading-monitor`
- 데이터는 JSON 파일이라 동시 쓰기 시 race condition 가능 — 대규모 트래픽 시 DB 마이그레이션 검토
- 이미지 업로드는 base64로 저장되므로 JSON 파일이 빠르게 커질 수 있음 (현재 body limit 10MB)
- API URL은 nginx reverse proxy 경로 `/trading/api/community` 사용 (직접 `/api/community` 아님)

## TODO / 개선 아이디어

- [ ] JSON 파일 → SQLite/MySQL 마이그레이션
- [ ] 이미지 별도 스토리지(S3 등) 분리
- [ ] 페이지네이션 / 무한 스크롤
- [ ] 게시글 수정 기능

