FROM node:20-slim

RUN apt-get update && apt-get install -y \
    build-essential g++ make libc6-dev \
    sqlite3 ffmpeg python3 python3-venv python3-pip wget \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /venv
ENV PATH="/venv/bin:$PATH"

RUN pip install --no-cache-dir yt-dlp

WORKDIR /app

COPY package*.json ./
RUN npm ci --legacy-peer-deps

COPY . .

RUN npm rebuild sqlite3 --build-from-source --force

EXPOSE 3000
CMD ["npm", "start"]
