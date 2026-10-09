# BPCE Compass

> « L'assistant bancaire qui comprend, guide et accompagne. »
> Prototype — AI for Impact hackathon, défi Groupe BPCE.

BPCE Compass is a mobile-first, Caisse d'Épargne-inspired banking app where the AI is
**an interaction layer for the whole app**, not a chatbot bolted onto a dashboard.
The customer explains a need (typing or speaking). Compass understands it, the **backend checks
permissions**, the app navigates to the right screen, and sensitive actions are **prepared for the
customer to confirm**. The visible banking UI changes as a result.

**Prototype de démonstration.** Every customer, account, card and transaction is fictional. No real
bank API, payment network or credential is involved. This is not an official BPCE / Caisse d'Épargne
application.

---

## Quick start

Requirements: **Node.js ≥ 22.5** (uses the built-in `node:sqlite`; tested on Node 26) and npm.

```bash
npm install
cp .env.example .env.local     # add your API key(s), see below
npm run dev                    # http://localhost:3000
```

On first start the SQLite database (`data/compass.db`) is created and seeded with deterministic demo
data. On a desktop screen you'll see the phone frame in the centre and the **demo panel** (DEMO ONLY)
on the right. On a phone, open `http://<ip>:3000`; the demo panel is at `/demo` (needs
`DEMO_ALLOW_LAN=true` from another device).

### API keys

| Variable | Required for | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | Text assistant (default provider) | Model `claude-opus-5-5` (`ANTHROPIC_MODEL`), effort `low` for chat latency |
| `OPENAI_API_KEY` | **Voice** (OpenAI Realtime) and/or text fallback | Realtime model `gpt-realtime-2.1` (`OPENAI_REALTIME_MODEL`) |

- With only `OPENAI_API_KEY`, text runs on OpenAI (`OPENAI_TEXT_MODEL`, default `gpt-6.1-sol`) and voice works.
- With only `ANTHROPIC_API_KEY`, text works; voice shows a clear "voix indisponible" fallback.
- With no key, the banking app works fully; Compass shows a configuration message (it never fakes an answer).
- API usage is billed by each provider. A Claude subscription does not include API credits.

The permanent OpenAI key never reaches the browser: the server mints a short-lived Realtime client secret.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on :3000 |
| `npm run build && npm start` | Production build / server (demo panel off unless `DEMO_MODE=true`) |
| `npm test` | Vitest: policy, authorization, engine, injection, redaction, retrieval (39 tests) |
| `npm run test:e2e` | Playwright mobile E2E (starts its own server on :3100 with `data/e2e.db`). Use `PW_CHROMIUM=/usr/bin/chromium` for a system browser, or `npx playwright install chromium` first. Real-LLM journeys are skipped when no key is configured |
| `npm run typecheck` / `npm run lint` | TypeScript / ESLint |
| `npm run db:reset` | Delete the local DB (it re-seeds on the next start). The demo panel's « Tout réinitialiser » does the same without restarting |

## Architecture at a glance

```
Browser (Next.js app, phone frame)
  ├─ Banking screens ──────────────┐  fetch /api/bank/*, /api/actions
  ├─ Compass sheet (text) ─────────┼─ POST /api/chat (SSE stream)
  └─ Voice mode (WebRTC) ──────────┼─ POST /api/realtime/session  → ephemeral key
         │ audio ⇄ OpenAI Realtime │  POST /api/realtime/tool     → tool execution
         ▼                         ▼
                      Next.js server (single backend)
      session (httpOnly cookie) → Principal { sessionHash, customerId, channel }
                 │
      Conversation engine ── LLM provider (Anthropic | OpenAI)
                 │                ▲ tool calls
      ONE tool registry (zod-validated, shared by text + voice)
                 │
      Policy layer (bank.ts): ownership by SQL, prepare → user confirm → execute
                 │
      SQLite (node:sqlite)        Verified knowledge base (11 docs, BM25)
```

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Demo journeys

1. **Carte perdue**: « J'ai perdu ma carte bancaire » → options → confirmation card → card really `FROZEN` → Cartes screen shows it.
2. **Paiement suspect**: « paiement de 89 euros que je ne reconnais pas » → transaction found → verified dispute guidance → reviewed adviser summary → simulated support request stored.
3. **Accessibilité + voix**: visitor asks for the balance by voice → refused by the backend → logs in → same question answered → simplified mode.

Step-by-step script: [docs/DEMO_GUIDE.md](docs/DEMO_GUIDE.md). Pitch script (10 min + 3 min, in French): [docs/PITCH.md](docs/PITCH.md).

## Demo login

`/connexion` is a profile selector, **not** a login form: there is no identifier, password or code
field anywhere. Profiles: **Camille Martin** (main demo customer) and **Lucas Bernard** (used to test
cross-customer isolation). The demo panel switches sessions too.

## Security model (summary)

- Identity comes only from the server session. Model-generated or client-supplied IDs never grant access; every query filters by `owner_id`.
- The LLM has **no confirm tool** in text mode. Sensitive actions are split into PREPARE (model) and CONFIRM (explicit user click; transfers and limit changes also need a simulated step-up).
- Voice can confirm only after the server checks the transcript of the customer's last utterance for an explicit « oui / je confirme ».
- Tool results that contain third-party text (transaction descriptions, documents) are wrapped as `untrusted_text`. A seeded transaction carries a prompt-injection string to demonstrate this.
- Passwords, PINs, CVVs, card numbers and SMS codes typed in the chat are masked before storage and before any provider call.
- Navigation targets come from an enum of app pages; no model-generated URL is ever opened.
- The demo panel API is loopback-only and disabled in production unless explicitly enabled.

## Limitations (honest list)

- All banking operations are **simulated** on synthetic data: no card network, no payment, no real adviser.
- Definitive card opposition is not simulated. The app shows the verified official procedure and phone number instead.
- The step-up "validation renforcée" is a simulated approval screen with no biometrics and no code.
- Voice audio goes directly from the browser to OpenAI, so it can't be redacted the way text is. The assistant is instructed to warn and never ask for secrets.
- Knowledge sources were checked manually on 2026-10-10 and can go stale. Two entries are flagged as general explanations without a verified source.
- No GDPR or regulatory compliance is claimed. Conversations are stored in local SQLite only until reset.
- Single-node prototype: SQLite, in-process sessions, no rate limiting.

## Team split (5 developers)

| Dev | Owns | Main files |
|---|---|---|
| 1 Frontend & UX | Screens, phone shell, cards | `src/components/screens`, `src/components/shell`, `src/components/bank` |
| 2 Conversational AI | Prompt, engine, providers, intent | `src/server/llm/*` |
| 3 Banking backend | DB, seed, repository, API routes | `src/server/db.ts`, `seed.ts`, `bank.ts`, `src/app/api/*` |
| 4 Security & trust | Sessions, policy, tool registry, tests | `src/server/auth.ts`, `tools/registry.ts`, `tests/` |
| 5 Voice & accessibility | Realtime, voice UI, preferences | `src/lib/voice`, `src/components/voice`, `screens/profile.tsx` |

The shared contract lives in `src/lib/types.ts` (API types, UI directives, cards). Change it first, then the implementations.

## Docs

- [Architecture](docs/ARCHITECTURE.md) · [Demo guide](docs/DEMO_GUIDE.md) · [Pitch](docs/PITCH.md) · [Test report](docs/TEST_REPORT.md) · [Open-source attribution](docs/ATTRIBUTION.md)
- Original product brief: [docs/MASTER_PROMPT.md](docs/MASTER_PROMPT.md)
