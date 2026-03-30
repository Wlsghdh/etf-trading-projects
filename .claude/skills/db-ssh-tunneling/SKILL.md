---
name: db-ssh-tunneling
description: |
  사용자가 SSH 터널 설정, 원격 MySQL 연결, Docker에서의 DB 접근 방법에 대해 질문하면
  이 스킬을 호출하라. DB 연결 오류 디버깅, 터널 상태 확인, docker-compose DB 설정
  변경 시에도 이 스킬을 참조하라.
  Triggers: SSH tunnel, 원격 DB, MySQL 연결, host.docker.internal, 포트 포워딩,
  Connection refused, DB 연결 실패.
---

# SSH Tunneling for Remote Database Access

## Overview
원격 서버의 MySQL 데이터베이스에 SSH 터널을 통해 안전하게 접근하는 방법을 설명합니다. 이 프로젝트에서는 Docker 컨테이너가 호스트의 SSH 터널을 통해 원격 DB에 접근합니다.

## Connection Architecture
```
[Docker Container (FastAPI)]
         ↓
    host.docker.internal:3306
         ↓
[Host Machine - SSH Tunnel]
    localhost:3306 → remote:5100
         ↓
[Remote Server (ahnbi2.suwon.ac.kr)]
    MySQL on port 5100
```

## SSH Configuration

### 1. SSH Config 설정 (~/.ssh/config)
```
Host ahnbi2
    HostName ahnbi2.suwon.ac.kr
    User ahnbi2
    IdentityFile ~/.ssh/id_rsa
    ServerAliveInterval 60
    ServerAliveCountMax 3
```

### 2. SSH 키 인증 설정
```bash
# 키 생성 (없는 경우)
ssh-keygen -t rsa -b 4096

# 원격 서버에 키 복사
ssh-copy-id ahnbi2@ahnbi2.suwon.ac.kr
```

## SSH Tunnel Commands

### 터널 시작
```bash
# 기본 명령어
ssh -f -N -L 3306:127.0.0.1:5100 ahnbi2@ahnbi2.suwon.ac.kr

# 옵션 설명:
# -f : 백그라운드 실행
# -N : 원격 명령 실행 안함 (터널만)
# -L : 로컬 포트 포워딩
# 3306:127.0.0.1:5100 : 로컬 3306 → 원격 127.0.0.1:5100

# 안정성 옵션 추가
ssh -f -N -L 3306:127.0.0.1:5100 ahnbi2@ahnbi2.suwon.ac.kr \
    -o ServerAliveInterval=60 \
    -o ServerAliveCountMax=3
```

### 터널 상태 확인
```bash
# 프로세스 확인
pgrep -f "ssh.*3306:127.0.0.1:5100"

# 포트 리스닝 확인
lsof -i :3306

# netstat으로 확인
netstat -an | grep 3306
```

### 터널 종료
```bash
# PID로 종료
pkill -f "ssh.*3306:127.0.0.1:5100"

# 또는 특정 PID 종료
kill $(pgrep -f "ssh.*3306:127.0.0.1:5100")
```

## Docker Integration

### docker-compose.yml 설정
```yaml
services:
  ml-service:
    build:
      context: ./ml-service
      dockerfile: Dockerfile
    container_name: etf-ml-service
    ports:
      - "8000:8000"
    environment:
      # host.docker.internal로 호스트의 터널에 접근
      - REMOTE_DB_URL=mysql+pymysql://ahnbi2:bigdata@host.docker.internal:3306/etf2_db
      - LOCAL_DB_PATH=/app/data/predictions.db
    extra_hosts:
      # Linux에서 host.docker.internal 지원
      - "host.docker.internal:host-gateway"
    volumes:
      - ./data:/app/data
```

### 핵심 포인트
- **host.docker.internal**: Docker 컨테이너에서 호스트 머신에 접근하는 특수 DNS
- **extra_hosts**: Linux에서 host.docker.internal을 사용하기 위해 필요
- 호스트에서 SSH 터널이 3306 포트를 리스닝하면, 컨테이너는 `host.docker.internal:3306`으로 접근

## Python SQLAlchemy Connection

### database.py 예제
```python
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# 원격 DB (SSH 터널 경유)
REMOTE_DB_URL = os.getenv(
    "REMOTE_DB_URL",
    "mysql+pymysql://ahnbi2:bigdata@host.docker.internal:3306/etf2_db"
)

remote_engine = create_engine(
    REMOTE_DB_URL,
    pool_pre_ping=True,  # 연결 상태 확인
    pool_recycle=3600,   # 1시간마다 연결 갱신
    echo=False
)

RemoteSessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=remote_engine
)

def get_remote_db():
    db = RemoteSessionLocal()
    try:
        yield db
    finally:
        db.close()
```

## Automation Scripts

### start.sh - 터널 자동 시작
```bash
#!/bin/bash

# SSH 터널 확인 및 시작
if ! pgrep -f "ssh.*3306:127.0.0.1:5100" > /dev/null; then
    echo "Starting SSH tunnel..."
    ssh -f -N -L 3306:127.0.0.1:5100 ahnbi2@ahnbi2.suwon.ac.kr \
        -o ServerAliveInterval=60 \
        -o ServerAliveCountMax=3
    sleep 2
fi

# 터널 확인
if pgrep -f "ssh.*3306:127.0.0.1:5100" > /dev/null; then
    echo "SSH tunnel is running"
else
    echo "ERROR: SSH tunnel failed to start"
    exit 1
fi
```

### Cron 환경에서의 SSH 터널
Cron에서 실행할 때는 SSH 에이전트와 키 접근이 제한될 수 있습니다:

```bash
#!/bin/bash
# cron 스크립트 상단에 추가

# SSH 에이전트 설정 (필요시)
eval $(ssh-agent -s)
ssh-add ~/.ssh/id_rsa

# 또는 패스프레이즈 없는 키 사용 권장
```

## Troubleshooting

### 1. "Connection refused" 에러
```bash
# 터널이 실행 중인지 확인
pgrep -f "ssh.*3306"

# 포트가 사용 중인지 확인
lsof -i :3306

# 터널 재시작
pkill -f "ssh.*3306"
ssh -f -N -L 3306:127.0.0.1:5100 ahnbi2@ahnbi2.suwon.ac.kr
```

### 2. "bind: Address already in use"
```bash
# 3306 포트를 사용하는 프로세스 확인
lsof -i :3306

# 해당 프로세스 종료
kill <PID>

# 또는 다른 로컬 포트 사용
ssh -f -N -L 3307:127.0.0.1:5100 ahnbi2@ahnbi2.suwon.ac.kr
```

### 3. SSH 연결 끊김
```bash
# ServerAlive 옵션 사용
ssh -f -N -L 3306:127.0.0.1:5100 ahnbi2@ahnbi2.suwon.ac.kr \
    -o ServerAliveInterval=60 \
    -o ServerAliveCountMax=3

# ~/.ssh/config에 영구 설정
Host ahnbi2
    ServerAliveInterval 60
    ServerAliveCountMax 3
```

### 4. Docker에서 호스트 연결 실패
```bash
# Docker 컨테이너 내부에서 테스트
docker exec -it etf-ml-service bash
apt-get update && apt-get install -y mysql-client
mysql -h host.docker.internal -P 3306 -u ahnbi2 -p

# extra_hosts 설정 확인
docker inspect etf-ml-service | grep -A5 "ExtraHosts"
```

## Security Considerations

1. **SSH 키 관리**
   - 패스프레이즈 없는 키는 자동화에 편리하지만 보안 위험
   - 키 파일 권한: `chmod 600 ~/.ssh/id_rsa`

2. **포트 노출 최소화**
   - SSH 터널은 localhost에만 바인딩됨 (외부 접근 불가)
   - Docker의 extra_hosts는 컨테이너 내부에서만 유효

3. **연결 정보 관리**
   - DB 비밀번호는 환경 변수로 관리
   - `.env` 파일은 `.gitignore`에 추가

## Quick Reference

| 작업 | 명령어 |
|------|--------|
| 터널 시작 | `ssh -f -N -L 3306:127.0.0.1:5100 ahnbi2@ahnbi2.suwon.ac.kr` |
| 터널 확인 | `pgrep -f "ssh.*3306"` |
| 터널 종료 | `pkill -f "ssh.*3306"` |
| 포트 확인 | `lsof -i :3306` |
| Docker 접속 | `host.docker.internal:3306` |
