# Multi-stage build: compile the SPA, then serve it from the API image.
# Built from the repository root so both source trees are in context.

FROM node:22-alpine AS frontend-build
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --no-audit --no-fund 2>/dev/null || npm install --no-audit --no-fund
COPY frontend/tsconfig.json frontend/vite.config.ts frontend/tailwind.config.js \
     frontend/postcss.config.js frontend/index.html ./
COPY frontend/src ./src
# Served as-is: the players' media cache worker and the phone remote's icons.
COPY frontend/public ./public
RUN npm run build


FROM python:3.12-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY backend/requirements.txt ./
ARG WITH_MQTT=false
RUN pip install --no-cache-dir -r requirements.txt \
    && if [ "$WITH_MQTT" = "true" ]; then pip install --no-cache-dir aiomqtt==2.3.0; fi

COPY backend/app ./app
COPY backend/simulator ./simulator
COPY backend/alembic ./alembic
COPY backend/alembic.ini ./alembic.ini
COPY --from=frontend-build /frontend/dist ./static

RUN useradd --create-home --uid 10001 appuser \
    && mkdir -p /app/data \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4).status == 200 else 1)"

# No access log: players and the camera put their (long-lived) token in the
# URL of media and live-feed requests, and it would be written to the log.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--no-access-log"]
