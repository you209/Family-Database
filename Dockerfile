FROM python:3.11-slim

WORKDIR /app

# System deps for face AI and image processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    libopenblas-dev libglib2.0-0 libsm6 libxext6 libxrender-dev \
    tesseract-ocr ffmpeg curl \
    && rm -rf /var/lib/apt/lists/*

# Node for frontend build
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && rm -rf /var/lib/apt/lists/*

# Python deps
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Frontend build
COPY frontend/ ./frontend/
RUN cd frontend && npm install && npm run build

# Backend
COPY backend/ ./backend/

# Data dirs
RUN mkdir -p /app/data /app/media/originals /app/media/thumbnails

EXPOSE 5050
WORKDIR /app/backend
CMD ["python", "app.py"]
