FROM python:3.12-slim

WORKDIR /app

# Install system dependencies for Playwright
RUN apt-get update && apt-get install -y \
    curl wget gnupg \
    libglib2.0-0 libnss3 libnspr4 libdbus-1-3 \
    libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
    libxrandr2 libgbm1 libpango-1.0-0 libcairo2 \
    libasound2 libatspi2.0-0 \
    fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

# Install Poetry
RUN pip install --no-cache-dir poetry
RUN poetry config virtualenvs.create false

# Install dependencies
COPY pyproject.toml poetry.lock* ./
RUN poetry install --no-interaction --no-ansi --no-root --only main

# Install Playwright browsers
RUN playwright install chromium

COPY config/ ./config/
COPY app/ ./app/
COPY scripts/ ./scripts/
COPY tests/ ./tests/

RUN mkdir -p /app/logs /app/downloads

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8001/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
