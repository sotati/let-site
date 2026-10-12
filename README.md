# Human Oracle

Human Oracle is a deliberately small anti-overthinking tool. One anonymous human answers another human's short YES/NO question; the asker then records how that answer felt and whether it clarified what they want.

Production: [human-oracle-app.vercel.app](https://human-oracle-app.vercel.app)

## Product loop

`DECIDE → ASK → WAIT → REVEAL → REACT → DECIDE`

- No accounts, profiles, comments, messages, or demographic targeting.
- Only the first answer counts, and devices cannot answer their own questions.
- Questions expire after 24 hours.
- Anonymous local device IDs support continuity without authentication.
- Approximate IP location is rounded before temporary storage, used only to derive distance, and removed when the question is answered or expires.
- Lightweight moderation blocks high-risk and identifying content.

## Local development

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and provide an Upstash Redis REST URL and token. In Vercel, the Upstash Marketplace integration injects these values automatically.

## Checks

```bash
npm run typecheck
npm run lint
npm run build
```

The backend uses Upstash Redis over HTTP, which is safe for Vercel's serverless runtime. Atomic Lua scripts enforce first-answer-wins, question credits, duplicate prevention, and expirations.

## Analytics events

An anonymous Redis event stream records session starts, question views, submissions, answers, reveal views, and reactions. Combined with reaction records, this supports the primary metric: the percentage of completed sessions where the asker says they now know what they want.
