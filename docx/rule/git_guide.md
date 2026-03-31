# Git 실전 가이드 - 브랜치 작업 흐름

## 1. 브랜치 구조

```
main (배포용, 최종본 - 직접 push 절대 금지)
 └── develop (개발 통합)
      ├── feat/기능A
      ├── feat/기능B
      └── fix/버그수정
```

- **main**: 완성된 코드만 있는 곳. 서버에서 실행 중인 코드
- **develop**: 팀원들 작업이 모이는 곳. 여기서 브랜치를 만듦
- **feat/fix 브랜치**: 각자 작업하는 공간. 완성 후 develop에 merge

---

## 2. 매일 작업 흐름 (이 순서대로 하면 됨)

### ① 작업 시작 전

```bash
git checkout develop                    # develop으로 이동
git pull origin develop                 # 최신 상태로 업데이트
git checkout -b feat/새기능이름          # 새 브랜치 생성
```

### ② 작업 중 (반복)

```bash
# 파일 수정 후
git status                              # 뭐가 바뀌었는지 확인
git add 수정한파일                       # 파일 추가 (staging)
git commit -m "커밋 메시지"              # 저장
git push origin feat/새기능이름          # GitHub에 업로드
```

### ③ 기능 완성 후

1. GitHub 저장소 페이지 접속
2. "Compare & pull request" 버튼 클릭
3. **base를 `develop`으로 설정** (중요!)
4. 제목, 설명 작성 후 "Create pull request" 클릭

```
base: develop  ←  compare: feat/새기능이름
```

### ④ Merge

- PR 페이지에서 "Merge pull request" 클릭
- "Delete branch" 클릭 (원격 브랜치 삭제)

### ⑤ 정리

```bash
git checkout develop                    # develop으로 돌아감
git pull origin develop                 # merge된 내용 받기
git branch -d feat/새기능이름            # 로컬 브랜치 삭제
```

### ⑥ develop → main 배포 (안정화됐을 때만)

```bash
# GitHub에서 PR 생성: base를 main, compare를 develop으로
# Merge하면 main에 반영 → 배포 완료
```

---

## 3. 충돌(Conflict)은 언제 나는가?

| 상황 | 결과 |
|------|------|
| 다른 파일 수정 | 자동 merge, 충돌 없음 |
| 같은 파일, 다른 줄 | 자동 merge, 충돌 없음 |
| 같은 파일, 같은 줄 | **충돌** → 수동 해결 필요 |

### Git은 줄 번호가 아니라 "맥락"으로 추적

A가 20번째 줄을 수정하고, B가 그 위에 코드를 추가해서 줄이 밀려도 Git이 알아서 찾아서 merge합니다. 줄 번호가 아니라 주변 내용(context)을 기준으로 매칭하기 때문입니다.

### 충돌을 줄이는 방법

- **기능 단위로 분리**: A는 로그인, B는 대시보드 → 파일이 안 겹침
- **자주 merge**: 브랜치를 오래 두지 않고 빨리 합침
- **작은 PR**: 변경 범위가 작으면 충돌 확률도 낮음

충돌은 전체 작업의 5% 미만이고, 나더라도 해결이 어렵지 않음.

---

## 4. 브랜치의 핵심 가치

충돌 방지가 아니라 **"합치는 시점을 내가 선택할 수 있다"**는 것.

| | 브랜치 없음 | 브랜치 있음 |
|--|--|--|
| 미완성 코드 | push하면 바로 모두에게 영향 | 완성 후에만 merge |
| 실수 되돌리기 | 다른 사람 커밋이 섞여서 복잡 | 브랜치 삭제하면 끝 |
| 코드 리뷰 | 불가 | PR로 merge 전 검토 |
| 실험 | 위험함 | 부담 없이 시도 |

---

## 5. 주요 명령어 정리

### 브랜치 관련

```bash
git branch                              # 브랜치 목록 (* = 현재 위치)
git checkout 브랜치이름                   # 브랜치 이동
git checkout -b 새브랜치이름              # 새 브랜치 생성 + 이동
git branch -d 브랜치이름                  # 로컬 브랜치 삭제
git push origin --delete 브랜치이름       # 원격 브랜치 삭제
```

### 작업 관련

```bash
git status                              # 변경된 파일 목록
git diff                                # 변경된 내용 상세
git add 파일명                           # 파일 staging
git commit -m "메시지"                   # 커밋
git push origin 브랜치이름               # GitHub에 업로드
git pull origin 브랜치이름               # GitHub에서 최신 받기
```

### 실수 복구

```bash
git stash                               # 변경사항 임시 저장
git stash pop                           # 임시 저장한 것 복원
git checkout -- 파일명                   # 파일을 마지막 커밋 상태로 되돌리기
git commit --amend -m "새 메시지"        # 직전 커밋 메시지 수정
```

---

## 6. 자주 하는 실수

### "어디 브랜치에 있는지 모르겠어"
```bash
git branch          # * 표시가 현재 브랜치
```

### "다른 브랜치에서 작업해버렸어"
```bash
git stash                         # 변경사항 임시 저장
git checkout feat/내브랜치         # 올바른 브랜치로 이동
git stash pop                     # 변경사항 복원
```

### "브랜치 바꿨는데 파일이 바뀌었어"
정상입니다. 브랜치마다 파일 상태가 다르기 때문에 IDE 사이드바 파일도 해당 브랜치 상태로 바뀝니다.

---

## 7. 용어 정리

| 용어 | 설명 |
|------|------|
| **commit** | 코드 변경사항을 저장 (게임 세이브) |
| **push** | 로컬 커밋을 GitHub에 업로드 |
| **pull** | GitHub에서 최신 코드 다운로드 |
| **branch** | 독립된 작업 공간 |
| **merge** | 두 브랜치를 합치기 |
| **PR (Pull Request)** | "내 작업 합쳐주세요" 요청. Merge 전 리뷰 가능 |
| **conflict** | 같은 줄을 다르게 수정했을 때 발생. 수동 해결 필요 |
| **staging (add)** | 커밋할 파일을 선택하는 단계 |

---

## 요약

> 1. develop에서 브랜치 만들고
> 2. 작업하고 commit + push 하고
> 3. PR 만들어서 develop에 merge 하고
> 4. 안정화되면 develop → main 배포
