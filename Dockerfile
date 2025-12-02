# =========================================================================
# مرحله ۱: کامپایل Whisper.cpp با استفاده از CMake
# =========================================================================
FROM ubuntu:22.04 AS whisper_build

# نصب ابزارهای بیلد
RUN apt-get update && apt-get install -y \
    build-essential \
    git \
    wget \
    cmake \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /whisper_src

# کلون کردن مخزن
RUN git clone https://github.com/ggerganov/whisper.cpp .

# بیلد کردن پروژه با CMake
RUN cmake -B build -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_EXAMPLES=ON
RUN cmake --build build --config Release --target main -j

# دانلود مدل
RUN mkdir -p models \
    && wget -O models/ggml-base.bin \
    https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin

# =========================================================================
# مرحله ۲: ساخت ایمیج نهایی (Node.js + ابزارهای اجرایی)
# =========================================================================
FROM node:20-slim

# نصب وابستگی‌های سیستمی
RUN apt-get update && apt-get install -y \
    ffmpeg \
    sqlite3 \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# 🛠️ اصلاح ارور: اضافه کردن --break-system-packages
# این دستور اجازه می‌دهد yt-dlp روی پایتون سیستم نصب شود
RUN pip install --no-cache-dir yt-dlp --break-system-packages

# تنظیم دایرکتوری پروژه
WORKDIR /app

# ----------------------------------------------------
# 📂 کپی کردن فایل‌های بیلد شده از مرحله ۱
# ----------------------------------------------------

# ۱. کپی کردن فایل اجرایی Whisper
COPY --from=whisper_build /whisper_src/build/bin/main /usr/bin/whisper_main

# ۲. کپی کردن مدل دانلود شده
COPY --from=whisper_build /whisper_src/models /app/server/models

# ----------------------------------------------------
# 📂 کپی کردن فایل‌های پروژه خودتان
# ----------------------------------------------------

# کپی فایل env.
COPY ./.env /app/server/

# کپی سورس کد سرور
COPY server/package*.json ./server/
COPY server/.dockerignore ./server/
COPY server/ ./server/

# نصب پکیج‌های Node.js
WORKDIR /app/server
RUN npm ci --legacy-peer-deps
RUN npm rebuild sqlite3 --build-from-source --force

# تعریف متغیرهای محیطی
ENV MODEL_PATH=/app/server/models/ggml-base.bin \
    WHISPER_BINARY=/usr/bin/whisper_main \
    NODE_ENV=production

# پورت Hugging Face
EXPOSE 7860

# اجرای برنامه
CMD ["node", "server.js"]