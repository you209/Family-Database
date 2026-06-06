ARG BUILD_FROM
FROM ${BUILD_FROM}

# System dependencies
RUN apk add --no-cache \
    nodejs npm \
    gcc g++ musl-dev \
    libffi-dev openssl-dev \
    jpeg-dev zlib-dev \
    ffmpeg \
    tesseract-ocr \
  || (apt-get update && apt-get install -y --no-install-recommends \
    nodejs npm gcc g++ \
    libffi-dev libssl-dev \
    libjpeg-dev zlib1g-dev \
    ffmpeg tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*)

WORKDIR /app

# Python deps
COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Build frontend
COPY frontend/ /app/frontend/
RUN cd /app/frontend && npm install --silent && npm run build

# Backend
COPY backend/ /app/backend/
COPY VERSION /app/VERSION

# Add-on run script
COPY hassio/run.sh /run.sh
RUN chmod +x /run.sh

CMD ["/run.sh"]
