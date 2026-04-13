import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { URL } from "node:url";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENV_PATH = path.resolve(__dirname, "..", ".env");

loadEnvFile(ENV_PATH);

const PORT = Number(process.env.PORT || 3000);
const X_BEARER_TOKEN = process.env.X_BEARER_TOKEN;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const X_USERNAME = process.env.X_USERNAME || "Tech_glareOffl";

const KEYWORD_PATTERNS = [
  /\blowest\s*price\b/i,
  /\blow\s*price\b/i,
  /\bbest\s*price\b/i,
  /\bbottom\s*price\b/i,
  /\bprice\s*drop\b/i,
  /\bdeal\s*price\b/i,
  /\bloot\b/i,
  /\blooted\b/i,
  /\blooting\b/i
];
const DISCOUNT_TRIGGER_PATTERNS = [
  /\b(?:flat\s*)?\d{2,3}\s*%\s*off\b/i,
  /\boff\s*up\s*to\s*\d{2,3}\s*%\b/i,
  /\bup\s*to\s*\d{2,3}\s*%\s*off\b/i,
  /\bextra\s*\d{2,3}\s*%\s*off\b/i,
  /\bgrab\s*\d{2,3}\s*%\s*off\b/i,
  /\bget\s*\d{2,3}\s*%\s*off\b/i,
  /\bdiscount\s+of\s+\d{2,3}\s*%\b/i
];
const processedTweetIds = new Set();

function containsTargetKeyword(text) {
  const normalizedText = text || "";

  return (
    KEYWORD_PATTERNS.some((pattern) => pattern.test(normalizedText)) ||
    containsDiscountOffer(normalizedText)
  );
}

function containsDiscountOffer(text) {
  if (!DISCOUNT_TRIGGER_PATTERNS.some((pattern) => pattern.test(text))) {
    return false;
  }

  for (const match of text.matchAll(/(\d{2,3})\s*%\s*off\b/gi)) {
    if (Number(match[1]) > 35) {
      return true;
    }
  }

  for (const match of text.matchAll(/\boff\s*up\s*to\s*(\d{2,3})\s*%\b/gi)) {
    if (Number(match[1]) > 35) {
      return true;
    }
  }

  for (const match of text.matchAll(/\bdiscount\s+of\s+(\d{2,3})\s*%\b/gi)) {
    if (Number(match[1]) > 35) {
      return true;
    }
  }

  return false;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const envContent = fs.readFileSync(filePath, "utf8");

  for (const line of envContent.split(/\r?\n/)) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    let value = trimmedLine.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function json(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload, null, 2));
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function getStartTimeIso() {
  return new Date(Date.now() - 5 * 60 * 1000).toISOString();
}

async function fetchRecentTweets() {
  if (!X_BEARER_TOKEN) {
    throw new Error("Missing X_BEARER_TOKEN");
  }

  const url = new URL("https://api.twitter.com/2/tweets/search/recent");
  url.searchParams.set(
    "query",
    `from:${X_USERNAME} (("lowest price") OR "low price" OR "best price" OR "price drop" OR loot OR off OR discount) -is:retweet`
  );
  url.searchParams.set("max_results", "25");
  url.searchParams.set("start_time", getStartTimeIso());
  url.searchParams.set("tweet.fields", "author_id,created_at,text");
  url.searchParams.set("expansions", "author_id");
  url.searchParams.set("user.fields", "name,username");

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${X_BEARER_TOKEN}`
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`X API error ${response.status}: ${errorText}`);
  }

  return response.json();
}

function buildTweetRecords(payload) {
  const usersById = new Map(
    (payload.includes?.users || []).map((user) => [user.id, user])
  );

  return (payload.data || [])
    .filter((tweet) => containsTargetKeyword(tweet.text))
    .map((tweet) => {
      const author = usersById.get(tweet.author_id);
      return {
        id: tweet.id,
        text: tweet.text,
        createdAt: tweet.created_at,
        authorName: author?.name || "Unknown",
        authorUsername: author?.username || X_USERNAME,
        url: `https://x.com/${author?.username || X_USERNAME}/status/${tweet.id}`
      };
    });
}

async function sendToTelegram(tweet) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID");
  }

  const message = `${escapeHtml(tweet.text)}\n\n${escapeHtml(tweet.url)}`;

  const response = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: false
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Telegram API error ${response.status}: ${errorText}`);
  }
}

async function processTweets() {
  const payload = await fetchRecentTweets();
  const tweets = buildTweetRecords(payload);

  const newTweets = tweets.filter((tweet) => !processedTweetIds.has(tweet.id));

  for (const tweet of newTweets) {
    await sendToTelegram(tweet);
    processedTweetIds.add(tweet.id);
  }

  return {
    scanned: tweets.length,
    sent: newTweets.length,
    tweets: newTweets
  };
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && requestUrl.pathname === "/health") {
    return json(res, 200, { ok: true });
  }

  if (
    (req.method === "GET" || req.method === "POST") &&
    requestUrl.pathname === "/api/check-tweets"
  ) {
    try {
      const result = await processTweets();
      return json(res, 200, {
        ok: true,
        message: "Tweet check completed",
        ...result
      });
    } catch (error) {
      return json(res, 500, {
        ok: false,
        error: error.message
      });
    }
  }

  return json(res, 404, {
    ok: false,
    error: "Route not found"
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
