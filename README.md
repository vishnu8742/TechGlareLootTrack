# TechGlareLoots

Small Node.js API that checks posts from `Tech_glareOffl` from the last 10 minutes and forwards matches to Telegram.

## Routes

- `GET /health`
- `GET /api/check-tweets`
- `POST /api/check-tweets`

## Matching rule

Posts are checked only from `Tech_glareOffl` and matched against keyword families such as:

- `lowest price`
- `low price`
- `best price`
- `price drop`
- `loot`
- discount-style posts like `40% OFF`, `50 % OFF`, `Flat 60% Off`, `Up to 70% OFF`

`OFF` posts are forwarded only when the discount is greater than `35%`.

## Setup

1. Use Node.js 18 or newer.
2. Copy `.env.example` to `.env`.
3. Fill these values:

- `X_BEARER_TOKEN`
- `X_USERNAME` (optional, defaults to `Tech_glareOffl`)
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

## Run

```bash
node src/server.js
```

Or:

```bash
npm start
```

## Example call

```bash
curl -X POST http://localhost:3000/api/check-tweets
```

You can trigger this endpoint every few minutes using cron, a server scheduler, or any external job runner.

## Troubleshooting

If the app says an env var is missing:

- Make sure the file is named `.env`
- Make sure `.env` is in the project root
- Restart the server after updating `.env`
