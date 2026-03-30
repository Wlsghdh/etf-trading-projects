# PM / 팀 리더 역할 정의

## 담당자
- **이름**: (PM)
- **역할**: 프로젝트 매니저 + 인프라 엔지니어 + PR 관리자

---

## 담당 기능

| # | 기능 | 설명 |
|---|------|------|
| 1 | 멀티 AI 통합 플랫폼 | ChatGPT, Claude, Gemini, 금융특화AI 통합 |
| 3 | AI 종목 스크리닝 자동화 | 1000+종목 자동 스캔, 맞춤 후보 제시 |
| - | 인프라 관리 | Docker, 서버, 배포 (양진우와 공동) |
| - | PR 관리 | 모든 PR 리뷰 & 머지 |

---

## 담당 브랜치

| 브랜치 | 작업 내용 |
|--------|-----------|
| `feat/multi-ai-platform` | AI Gateway 서비스, 멀티AI 채팅 UI |
| `feat/screening-ui` | 종목 스크리닝 필터 UI |

---

## 담당 파일/폴더

```
docker-compose.yml                # 인프라 설정 (양진우와 공동)
trading-service/                  # 트레이딩 서비스
ai-gateway-service/               # 신규 - AI Gateway 서비스
trading-monitor/components/screening/  # 신규 - 스크리닝 UI
```

---

## PM 고유 업무

### 1. PR 관리
- 모든 PR 리뷰 & 머지 (Squash and merge)
- 코드 품질 확인, 충돌 해결
- 문제 있으면 코멘트로 수정 요청

### 2. 인프라 관리
- Docker Compose 설정 유지
- 서버 배포 (develop → main)
- 환경변수, 비밀키 관리

### 3. 공통 파일 관리
- `docker-compose.yml` 수정은 PM만
- `requirements.txt`, `package.json` 패키지 추가는 PM만
- 팀원이 패키지 필요 시 PM에게 요청

### 4. 팀원 관리

| 팀원 | 역할 | 비고 |
|------|------|------|
| 임대윤 | 시나리오 + 중간 그래프 | ML 엔지니어 |
| 최인훈 | 설명가능성 + 회귀 예측 | ML 엔지니어 |
| 박성문 | 데이터 수집 + 버그 수정 | 데이터 엔지니어 |
| 양진우 | Docker/Git 관리 + 커뮤니티 | PM 보조 (DevOps) |

---

## Sprint별 작업 계획

### Sprint 1 (Week 1-2)
- [ ] GitHub 인증 수정 및 전체 push
- [ ] develop 브랜치 생성 + 팀원 브랜치 분배
- [ ] 팀원 온보딩 (Git 사용법 교육)
- [ ] 박성문 데이터 수집 업무 인수인계
- [ ] 양진우 Docker 환경 인수인계

### Sprint 2 (Week 3-4)
- [ ] AI Gateway 서비스 프로젝트 구조 생성
- [ ] OpenAI, Anthropic, Google AI API 연동
- [ ] 멀티AI 채팅 UI (모델 선택, 응답 비교)
- [ ] 종목 스크리닝 필터 UI

### Sprint 3 (Week 5-6)
- [ ] 멀티AI 응답 종합 분석 기능
- [ ] 스크리닝 자동화 (사용자 조건 기반 알림)
- [ ] 전체 시스템 통합 테스트

### Sprint 4 (Week 7-8)
- [ ] 버그 수정 및 성능 최적화
- [ ] 배포 및 문서화
