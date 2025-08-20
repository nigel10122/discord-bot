# nigiBot — privacy‑first Discord assistant

**nigiBot** is an open‑source, ops‑ready Discord bot with a small, *pluggable skills framework*:
- `/ask` — LLM answers with rolling, privacy‑filtered memory
- `/shot` — capture a webpage screenshot + 3‑bullet summary
- Keyword: mention “nigibot …” and it replies

## Why it's different
- **Privacy by design:** secret redaction + bounded memory per channel
- **Ops ready:** healthcheck endpoint, rate limiting, Dockerfile, CI
- **Extensible:** add a new skill in ~15 lines

## Quick start
1. Invite the bot with your OAuth2 URL (see README).
2. Try `/ask q: help me write a welcome message`.
3. Try `/shot url:https://example.com`.

### Links
- **Source & Releases:** (your GitHub repo URL)
- **Privacy Policy:** /privacy.md
- **Terms:** /terms.md
- **Support:** (Discord support server invite or email)