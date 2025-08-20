# nigiBot — privacy‑first Discord assistant

**nigiBot** is an open‑source, ops‑ready Discord bot with a tiny *pluggable skills* framework:
- **/ask** — LLM answers with rolling, privacy‑filtered memory
- **/shot** — Capture a webpage screenshot + 3‑bullet summary
- **Keyword:** mention `nigibot ...` and it replies

## Why it’s different
- **Privacy by design:** secret redaction + bounded memory per channel
- **Ops‑ready:** healthcheck endpoint, rate limiting, Dockerfile, CI
- **Extensible:** add a new skill in ~15 lines

## Quick start
1. Create a Discord Application + Bot, copy token.
2. Copy `.env.example` → `.env` and fill values (`DISCORD_TOKEN`, `OPENAI_API_KEY`, `DISCORD_CLIENT_ID`, optional `DISCORD_GUILD_ID`).
3. Install & run:
   ```bash
   npm i
   npm start