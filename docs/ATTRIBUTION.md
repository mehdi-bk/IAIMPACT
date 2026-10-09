# Open-source foundations and attribution

## Reused code

| Source | License | What we reused |
|---|---|---|
| [abderrahimghazali/shadcn-fintech](https://github.com/abderrahimghazali/shadcn-fintech) | MIT, © 2026 Abderrahim Ghazali (full text in `docs/THIRD_PARTY_shadcn-fintech_LICENSE.txt`) | Project scaffold and configuration (Next.js 16, Tailwind 4, shadcn `base-nova`, `tsconfig`, ESLint/PostCSS config), `src/lib/utils.ts`, the Base UI primitives in `src/components/ui/*` (button, switch, dialog, input, badge, skeleton, tabs, avatar, separator, textarea, progress, tooltip). The dashboard screens were not reused: the mobile banking screens are new |

## Studied, not copied

| Repository | What we took from it | Why we didn't import the code |
|---|---|---|
| [redis-developer/banking-agent-semantic-routing-demo](https://github.com/redis-developer/banking-agent-semantic-routing-demo) | Intent routing, slot filling and per-conversation workflow state | Requires Redis infrastructure. We use a smaller equivalent: a structured intent classifier plus a workflow state stored in SQLite |
| [frogcoder/llm-chatbot](https://github.com/frogcoder/llm-chatbot) | Separating banking operations as tools and grounding answers in documents | RBC-specific data and products. Nothing was copied |
| [assistant-ui/assistant-ui](https://github.com/assistant-ui/assistant-ui) | Chat UX patterns: streaming, tool UI, suggestions | Our responses carry custom structured events (cards, UI directives, confirmations). A purpose-built component was lower-risk under time pressure than adapting a runtime |
| [openai/openai-realtime-console](https://github.com/openai/openai-realtime-console), [openai/openai-realtime-agents](https://github.com/openai/openai-realtime-agents) | WebRTC session flow, server-minted ephemeral keys, data-channel events, function calling | Our voice client (`src/lib/voice/realtime.ts`) is written against the current documentation (`/v1/realtime/client_secrets`, `/v1/realtime/calls`) |

## Libraries (npm)

next, react, @base-ui/react, tailwindcss, tw-animate-css, class-variance-authority, clsx,
tailwind-merge, lucide-react (ISC), motion, swr, zustand, zod, @anthropic-ai/sdk, openai,
vitest, @playwright/test. Each is used under its own license (MIT unless stated otherwise).

## Content

- Banking procedures in `src/server/knowledge/kb.ts` paraphrase or quote public pages from caisse-epargne.fr and inc-conso.fr, consulted on 2026-10-10. URLs are kept with each entry.
- No Caisse d'Épargne / BPCE logo, font or proprietary asset is used. The Compass logomark and the card artwork are original. The colour palette is an approximation for prototype purposes, not official brand values.
- Fonts: Manrope (SIL Open Font License) via `next/font`.
