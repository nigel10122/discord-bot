import OpenAI from 'openai';
import puppeteer from 'puppeteer';
import crypto from 'crypto';

// Small logger
function log(level, ...args) {
  const levels = ['error','warn','info','debug'];
  const cur = process.env.LOG_LEVEL || 'info';
  if (levels.indexOf(level) <= levels.indexOf(cur)) {
    console[level === 'debug' ? 'log' : level](...args);
  }
}

// Secret redaction (privacy-first)
const SECRET_REGEXES = [
  /sk-[A-Za-z0-9]{20,}/g,                      // API-style keys
  /(?<=api[-_ ]?key[=:]\s*)[A-Za-z0-9\-_.]+/gi,
  /bearer\s+[A-Za-z0-9\-_\.=]+/gi
];
function redactSecrets(text) {
  let out = text || '';
  for (const rx of SECRET_REGEXES) out = out.replace(rx, '[REDACTED]');
  return out;
}

// Rate limiter (token bucket-ish per user)
class RateLimiter {
  constructor(maxPerMinute = 6) {
    this.max = maxPerMinute;
    this.history = new Map(); // userId -> timestamps[]
  }
  allow(userId) {
    const now = Date.now();
    const windowMs = 60_000;
    const arr = (this.history.get(userId) || []).filter(t => now - t < windowMs);
    if (arr.length >= this.max) return false;
    arr.push(now);
    this.history.set(userId, arr);
    return true;
  }
}

// Simple rolling memory per channel with char budget
class ChannelMemory {
  constructor(charBudget = 4000) {
    this.charBudget = charBudget;
    this.store = new Map(); // channelId -> [{role,content}]
  }
  push(channelId, role, content) {
    const clean = redactSecrets(content);
    const arr = this.store.get(channelId) || [];
    arr.push({ role, content: clean });
    // Trim to budget (approx by characters)
    let total = arr.reduce((n, m) => n + (m.content?.length || 0), 0);
    while (total > this.charBudget && arr.length > 1) {
      arr.shift();
      total = arr.reduce((n, m) => n + (m.content?.length || 0), 0);
    }
    this.store.set(channelId, arr);
  }
  get(channelId) {
    return this.store.get(channelId) || [];
  }
}

export function createNigiBot(config) {
  const {
    openaiApiKey,
    model = 'gpt-4o-mini',
    temperature = 0.2,
    memoryCharBudget = 4000,
    rateLimitPerMin = 6,
    puppeteerTimeoutMs = 10_000
  } = config;

  const openai = new OpenAI({ apiKey: openaiApiKey });
  const memory = new ChannelMemory(memoryCharBudget);
  const limiter = new RateLimiter(rateLimitPerMin);

  // ---- Skill: LLM Ask (with rolling memory) ----
  async function skillAsk(channelId, userId, userInput) {
    if (!limiter.allow(userId)) {
      return { response: "You're sending messages too fast. Please try again in a moment." };
    }

    const history = memory.get(channelId);
    const systemMsg = {
      role: 'system',
      content: [
        "You are nigiBot, a concise, helpful assistant for Discord.",
        "Keep answers short unless asked for detail. Use bullet points where helpful.",
        "Never echo secrets or tokens. If the user pastes secrets, warn and suggest revocation."
      ].join(' ')
    };

    const messages = [systemMsg, ...history, { role: 'user', content: userInput }];

    try {
      const resp = await openai.chat.completions.create({
        model,
        temperature,
        messages
      });
      const text = (resp.choices?.[0]?.message?.content || 'Sorry, I got no response.').trim();
      memory.push(channelId, 'user', userInput);
      memory.push(channelId, 'assistant', text);
      return { response: text };
    } catch (err) {
      log('error', 'OpenAI error:', err?.message || err);
      return { response: 'OpenAI call failed. Please try again later.' };
    }
  }

  // ---- Skill: URL Screenshot + quick summary ----
  async function skillShot(channelId, userId, url) {
    if (!/^https?:\/\//i.test(url)) {
      return { response: 'Please provide a valid URL starting with http:// or https:// .' };
    }
    if (!limiter.allow(userId)) {
      return { response: "You're sending requests too fast. Try again shortly." };
    }

    let browser;
    try {
      browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        headless: true
      });
      const page = await browser.newPage();
      page.setDefaultNavigationTimeout(Number(puppeteerTimeoutMs) || 10000);
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      const buffer = await page.screenshot({ fullPage: true });
      await browser.close();

      // Brief LLM summary of the URL (no PII, no secrets)
      const summaryPrompt = `Summarize this page in 3 bullets for a Discord audience. URL: ${url}`;
      const summary = await skillAsk(channelId, userId, summaryPrompt);

      const filename = `shot-${crypto.randomUUID().slice(0,8)}.png`;
      return {
        response: `Here’s the page and a quick summary:\n${summary.response}`,
        file: { attachment: buffer, name: filename }
      };
    } catch (err) {
      try { if (browser) await browser.close(); } catch {}
      log('error', 'Puppeteer error:', err?.message || err);
      return { response: 'Failed to capture screenshot. The site may block bots or took too long.' };
    }
  }

  return {
    handleAsk: (channelId, userId, q) => skillAsk(channelId, userId, q),
    handleShot: (channelId, userId, url) => skillShot(channelId, userId, url)
  };
}