FROM python:3.12-slim

WORKDIR /app

# System dependencies + timezone
RUN apt-get update && apt-get install -y \
    curl tzdata \
    && rm -rf /var/lib/apt/lists/*

ENV TZ=Asia/Seoul
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# Poetry + dependencies
RUN pip install --no-cache-dir poetry
RUN poetry config virtualenvs.create false

COPY pyproject.toml poetry.lock* ./
RUN poetry install --no-interaction --no-ansi --no-root --only main

# Application code
COPY app/ ./app/

# Data directory for SQLite
RUN mkdir -p /app/data

EXPOSE 8002

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8002/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8002"]
