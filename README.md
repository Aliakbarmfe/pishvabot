# Telegram Mark Token Bot

## مراحل راه‌اندازی:

1. **ساخت دیتابیس KV در کلادفلر:**
   - به پنل Cloudflare رفته و به بخش **Workers & Pages > KV** بروید.
   - یک KV Namespace جدید با نام `USER_STORE` بسازید و ID آن را در فایل `wrangler.toml` جاگذاری کنید.

2. **تنظیم Secret برای توکن ربات:**
   - در پنل Workers پروژه خود، به بخش **Settings > Variables** بروید.
   - یک Variable از نوع **Secret** با نام `BOT_TOKEN` بسازید و توکن ربات تلگرام خود را در آن قرار دهید.

3. **اتصال به GitHub و Deployment:**
   - مخزن گیت‌هاب را به Cloudflare Pages / Workers متصل کنید تا با هر Commit به‌صورت خودکار آپلود شود.

4. **تنظیم Webhook تلگرام:**
   - آدرس Worker خود را کپی کرده و Webhook تلگرام را با لینک زیر تنظیم کنید:
   `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=<YOUR_WORKER_URL>`
