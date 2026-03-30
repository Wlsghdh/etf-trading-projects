# Git 규칙 - 우리 프로젝트 규칙

> 이 문서는 우리 프로젝트에서 Git을 어떻게 사용하는지 규칙을 정리한 것이다.
> Git이 뭔지 모르겠으면 `git_guide.md`를 먼저 읽어라.

---

## 1. 브랜치 구조

```
main (배포용 - 직접 수정 절대 금지)
 │
 └── develop (개발 통합 - 모든 PR은 여기로)
      │
      ├── feat/xxx    (새 기능 브랜치)
      ├── fix/xxx     (버그 수정 브랜치)
      └── ...
```

- **main**: 실제 서버에서 돌아가는 코드. 절대 직접 push 금지.
- **develop**: 팀원들의 작업이 모이는 곳. PR로만 합친다.
- **feat/xxx, fix/xxx**: 각자 작업하는 브랜치. 여기서만 코딩한다.

---

## 2. 브랜치 이름 규칙

| 접두사 | 용도 | 예시 |
|--------|------|------|
| `feat/` | 새 기능 개발 | `feat/scenario-strategy` |
| `fix/` | 버그 수정 | `fix/scraper-timeframe` |
| `hotfix/` | 긴급 수정 | `hotfix/login-crash` |
| `docs/` | 문서 작업 | `docs/api-guide` |

- 영어 소문자 + 하이픈(`-`)만 사용
- 한글, 공백, 대문자 사용 금지

---

## 3. 커밋 메시지 규칙

```
<타입>: <설명>
```

| 타입 | 의미 | 예시 |
|------|------|------|
| `feat` | 새 기능 추가 | `feat: 5단계 시나리오 엔진 추가` |
| `fix` | 버그 수정 | `fix: 타임프레임 매핑 버그 수정` |
| `refactor` | 리팩토링 | `refactor: LLM 프로바이더 구조 개선` |
| `docs` | 문서 수정 | `docs: API 가이드 작성` |
| `style` | 코드 스타일 (기능 변화 없음) | `style: 들여쓰기 정리` |
| `test` | 테스트 추가/수정 | `test: 시나리오 엔진 단위 테스트 추가` |
| `chore` | 설정, 빌드 등 | `chore: Docker 설정 업데이트` |

### 좋은 예 vs 나쁜 예

```bash
# 좋은 예
git commit -m "feat: Monte Carlo 기반 중간 경로 그래프 생성 로직 추가"
git commit -m "fix: SHAP 피처 중요도 계산 시 NaN 처리"

# 나쁜 예
git commit -m "수정"
git commit -m "ㅋㅋ됨"
git commit -m "update"
git commit -m "asdf"
```

---

## 4. 매일 작업 흐름

### 작업 시작 (아침)

```bash
# ① 내 브랜치로 이동
git checkout feat/내브랜치

# ② 다른 팀원의 최신 변경사항 받기
git pull origin develop

# ③ 충돌 있으면 해결 후
git add .
git commit -m "fix: develop 머지 충돌 해결"
```

### 작업 완료 (저녁)

```bash
# ① 수정한 파일 확인
git status

# ② 수정한 파일만 추가 (파일명 직접 지정)
git add 수정한파일1 수정한파일2

# ③ 커밋
git commit -m "feat: 오늘 한 작업 설명"

# ④ 내 브랜치에 push
git push origin feat/내브랜치
```

### PR (Pull Request) 생성

1. GitHub 웹사이트 접속
2. "Compare & pull request" 버튼 클릭
3. **base: `develop`** ← **compare: `feat/내브랜치`** 확인
4. 제목: 커밋 메시지와 동일한 형식
5. 설명: 무엇을 했는지, 왜 했는지 간단히
6. "Create pull request" 클릭
7. **PM이 리뷰 후 머지** (본인이 직접 머지 금지)

---

## 5. PR 규칙

| 항목 | 규칙 |
|------|------|
| PR 대상 | 항상 `develop` 브랜치로 |
| 리뷰어 | PM이 모든 PR 리뷰 |
| 머지 방식 | **Squash and merge** |
| 본인 머지 | **금지** (PM만 머지) |
| PR 크기 | 가능하면 작게 (한 기능 단위) |
| 테스트 | PR 전에 로컬에서 동작 확인 |

---

## 6. 충돌 방지 규칙

### 파일 소유권

**각 팀원은 자기 담당 폴더/파일만 수정한다.**

다른 팀원의 파일을 수정해야 할 경우:
1. 해당 팀원에게 먼저 알리기
2. 또는 PM에게 요청

### 공통 파일 수정

아래 파일은 **PM(또는 PM 승인 후)만 수정**:
- `docker-compose.yml`
- `requirements.txt` / `package.json`
- `.env` 파일들
- 인프라 설정 파일

패키지 추가가 필요하면 PM에게 요청.

---

## 7. 긴급 상황 대응

### 내 브랜치에서 실수했을 때

```bash
# 마지막 커밋 취소 (코드는 유지)
git reset --soft HEAD~1

# 특정 파일 변경사항 되돌리기 (주의: 수정 내용 사라짐)
git checkout -- 파일명
```

### 충돌 해결이 안 될 때

```bash
# 머지 취소하고 원래 상태로
git merge --abort

# PM 또는 양진우에게 도움 요청
```

### 잘못된 브랜치에서 작업했을 때

```bash
# 변경사항을 임시 저장
git stash

# 올바른 브랜치로 이동
git checkout feat/내브랜치

# 임시 저장한 변경사항 복원
git stash pop
```

---

## 8. 금지 사항

| 금지 항목 | 이유 |
|-----------|------|
| `main`에 직접 push | 서비스 장애 위험 |
| `develop`에 직접 push | PR 리뷰 우회 |
| `git push --force` | 다른 팀원 작업 덮어쓰기 |
| 다른 팀원 파일 무단 수정 | 충돌 발생 |
| 본인 PR 본인 머지 | 코드 리뷰 우회 |
| `.env`, 비밀키 커밋 | 보안 사고 |
| `git add .` 남용 | 불필요한 파일 포함 위험 |

---

## 9. PM 워크플로우

### PR 머지 (수시)

1. GitHub에서 PR 확인
2. **Files changed** 탭에서 코드 리뷰
3. 문제 없으면 → **Squash and merge** 클릭
4. 문제 있으면 → 코멘트 남기고 **Request changes**

### 배포 (주 1회 또는 필요 시)

```bash
git checkout main
git pull origin main
git merge develop
git push origin main
```
