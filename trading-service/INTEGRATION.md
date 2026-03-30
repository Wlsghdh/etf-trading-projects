# trading-service 통합 가이드

## 1. 디렉토리 복사

```bash
cp -r /home/ahnbi2/trading-service /home/jjh0709/git/etf-trading-project/trading-service
```

## 2. docker-compose.yml 수정

`nginx` 서비스 앞에 아래 블록 추가:

```yaml
  trading-service:
    build:
      context: ./trading-service
      dockerfile: Dockerfile
    container_name: etf-trading-service
    expose:
      - "8002"
    environment:
      - ML_SERVICE_URL=http://ml-service:8000
      - LOCAL_DB_PATH=/app/data/trading.db
      - TRADING_MODE=paper
      - KIS_APP_KEY=${KIS_APP_KEY}
      - KIS_APP_SECRET=${KIS_APP_SECRET}
      - KIS_ACCOUNT_NUMBER=${KIS_ACCOUNT_NUMBER}
      - LOG_LEVEL=INFO
    volumes:
      - ./trading-service/data:/app/data
    depends_on:
      - ml-service
    restart: unless-stopped
    networks:
      - etf-network
```

nginx의 `depends_on`에 `trading-service` 추가:

```yaml
  nginx:
    depends_on:
      - web-dashboard
      - ml-service
      - auto-monitoring
      - scraper-service
      - trading-service    # 추가
```

## 3. nginx/nginx.conf 수정

`upstream` 블록 추가 (다른 upstream 블록 뒤에):

```nginx
    upstream trading-service {
        server trading-service:8002;
    }
```

`location` 블록 추가 (`location /api/scraper/` 앞에):

```nginx
        # Trading Service API
        location /api/trading/ {
            proxy_pass http://trading-service/api/trading/;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
```

## 4. 환경변수 (.env)

프로젝트 루트 `.env`에 추가:

```
KIS_APP_KEY=your_app_key
KIS_APP_SECRET=your_app_secret
KIS_ACCOUNT_NUMBER=00000000-00
```

## 5. 실행

```bash
docker compose up -d --build trading-service
```

## 6. 검증

```bash
# 헬스체크
curl http://localhost:8002/health

# nginx 경유
curl http://localhost/api/trading/status

# 수동 매매 실행 (테스트)
curl -X POST http://localhost:8002/api/trading/execute
```
