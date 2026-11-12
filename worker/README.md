# FRAGZONE Telegram Support Worker

## What it does
- /start — welcome and commands
- /new — create a support ticket
- /my — list the user's ticket IDs
- /cancel — cancel ticket creation
- Admin: /reply TICKET_ID message
- Admin: /close TICKET_ID

## Cloudflare setup
1. Create a Telegram bot with @BotFather and copy its token.
2. Create a Cloudflare Worker and paste worker/telegram-support.js.
3. Add a KV namespace and bind it as `TICKETS`.
4. Add Worker secrets/variables: `BOT_TOKEN`, `WEBHOOK_SECRET` (random long secret), `ADMIN_CHAT_ID` (your Telegram numeric chat ID).
5. Deploy the Worker.
6. Set the Telegram webhook (replace placeholders):
   `https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://<WORKER_HOST>/telegram&secret_token=<WEBHOOK_SECRET>`

Keep BOT_TOKEN and WEBHOOK_SECRET private. Do not put them in website code or GitHub.
