📌 YouTube Farsi Subtitle

تولید زیرنویس فارسی برای ویدیوهای یوتیوب با استفاده از:

yt-dlp برای دانلود فایل صوتی

Whisper.cpp برای تبدیل گفتار به متن

مدل ترجمه هوش مصنوعی برای تبدیل متن انگلیسی → فارسی

API Server (Python) برای ارائه سرویس به اکستنشن کروم

🚀 ویژگی‌ها

دانلود خودکار صوت از هر ویدئوی یوتیوب

تبدیل گفتار به متن با Whisper.cpp

ترجمه سریع به فارسی

خروجی SRT استاندارد

مناسب برای استفاده:

اکستنشن کروم

API شخصی

ابزارهای دانلود زیرنویس

🛠 نصب و اجرا

1. کلون پروژه
   git clone https://github.com/Alikley/youtube-farsi-subtitle
   cd youtube-farsi-subtitle

2. نصب وابستگی‌ها
   pip install -r requirements.txt

3. دانلود مدل Whisper
   bash download_whisper_model.sh

4. اجرا
   python server.py

سرور به صورت پیش‌فرض روی پورت 8000 اجرا می‌شود.

📡 APIها
🎧 1) دریافت متن خام (Transcribe)
POST /v1/transcribe

Body:

{
"youtube_url": "https://youtube.com/watch?v=XXXX"
}

🌍 2) ترجمه متن
POST /v1/translate

Body:

{
"text": "Hello world"
}

🎬 3) خروجی SRT آماده
POST /v1/subtitle

Body:

{
"youtube_url": "...",
"lang": "fa"
}

🐳 اجرای Docker
docker build -t farsi-subtitle .
docker run -p 8000:8000 farsi-subtitle

🤝 مشارکت

Pull Request همیشه خوش‌آمده!
لطفاً قبل از شروع، فایل CONTRIBUTING.md را بخوانید.

📜 لایسنس

این پروژه تحت لایسنس AGPL-3.0 منتشر شده.
هر استفاده SaaS یا سروری الزاماً باید سورس را منتشر کند.
