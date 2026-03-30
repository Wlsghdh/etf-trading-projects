# Trading Monitor 서버 실행 가이드

## 접속 주소

| 환경 | URL |
|------|-----|
| 로컬 | http://localhost:3002/trading/ |
| 네트워크 | http://223.195.111.26:3002/trading/ |

> **주의**: basePath가 `/trading`이므로 반드시 `/trading/` 경로를 포함해야 합니다.

---

## 서버 실행 방법

### 1. 일반 실행 (포그라운드)

```bash
cd /home/jjh0709/git/etf-trading-project/trading-monitor
npm run dev
```

터미널을 닫으면 서버도 종료됩니다.

### 2. 백그라운드 실행 (nohup)

```bash
cd /home/jjh0709/git/etf-trading-project/trading-monitor
nohup npm run dev > /tmp/trading-monitor.log 2>&1 &
echo $!  # PID 확인
```

- 터미널을 닫아도 서버가 유지됩니다
- 로그 확인: `tail -f /tmp/trading-monitor.log`
- 서버 종료: `kill $(lsof -ti:3002)`

### 3. 프로덕션 빌드 후 실행

```bash
cd /home/jjh0709/git/etf-trading-project/trading-monitor

# 빌드
npm run build

# 백그라운드 실행
nohup npm run start > /tmp/trading-monitor.log 2>&1 &
```

프로덕션 모드가 더 빠르고 안정적입니다.

---

## 서버 관리 명령어

```bash
# 서버 상태 확인
lsof -i:3002

# 서버 종료
kill $(lsof -ti:3002)

# 강제 종료
fuser -k 3002/tcp

# 로그 실시간 확인
tail -f /tmp/trading-monitor.log
```

---

## 페이지 목록

| 경로 | 페이지 |
|------|--------|
| `/trading/` | 대시보드 |
| `/trading/calendar` | 달력 |
| `/trading/portfolio` | 포트폴리오 (종목 클릭 → 차트) |
| `/trading/settings` | 설정 |
| `/trading/admin` | 관리자 (로그 뷰어) |
