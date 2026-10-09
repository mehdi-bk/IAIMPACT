# Architecture — BPCE Compass

One Next.js 16 application holds both the frontend and the backend (Route Handlers). There is one
banking backend, one tool interface and one voice integration. Business logic lives in `src/server`,
UI in `src/components`, and the contract between them in `src/lib/types.ts`.

## 1. Request flow (text)

```
User types ─► CompassLayer ─► POST /api/chat {conversationId, input, context}
                                   │
                                   ▼
            getPrincipal("text")  ← httpOnly cookie → sessions table (sha-256 hash)
                                   │
            runChatTurn (src/server/llm/engine.ts)
              1. redactSecrets(message)            → privacy card if anything masked
              2. <contexte_application> block      → auth state (from server), page,
                                                     selected tx/card (ownership-checked), pending action
              3. classifyIntent (parallel, small model, JSON schema) → workflow state
              4. loop ≤ 6 rounds:
                   provider.streamTurn(system, history, tools) ─► text deltas (SSE)
                   for each tool call: executeTool(name, args, principal)
                        zod validation → policy layer → SQLite
                        ─► tool_start / tool_end / card / ui events (SSE)
              5. persist history (append-only, provider-native blocks kept) + workflow
                                   │
                                   ▼
            Browser applies events: streaming text, tool chips, cards,
            navigate (router.push + highlight + sheet → "peek"), refresh SWR caches
```

## 2. Request flow (voice)

```
Mic ─► startVoice() ─► POST /api/realtime/session
                        server: instructions + tool JSON schemas (same registry)
                                + POST https://api.openai.com/v1/realtime/client_secrets
                        ◄─ { value: ephemeral key, model }
       RTCPeerConnection ─► POST https://api.openai.com/v1/realtime/calls (SDP, ephemeral key)
       data channel "oai-events":
         input_audio_buffer.* / transcription.completed  → transcript (user)
         response.output_audio_transcript.delta           → transcript (assistant)
         output_audio_buffer.started/stopped              → speaking state / orb
         response.done with function_call items ─► POST /api/realtime/tool
                                                    getPrincipal("voice") → executeTool (same registry)
                                                    ◄─ output for the model + cards + UI directives
                                          conversation.item.create(function_call_output) + response.create
```

Voice and text use the **same** `executeTool`, the same policy layer and the same session-derived
identity, so voice can't do anything text can't. The only voice-specific tools are
`confirm_pending_action`, which needs a server-checked affirmative transcript, and
`get_screen_context`, which is read-only.

Interruptions: Realtime semantic VAD detects barge-in. Over WebRTC the server cancels and truncates
the current audio response, and the UI switches back to "user speaking".

## 3. Components

| Layer | File(s) | Responsibility |
|---|---|---|
| Data | `src/server/db.ts`, `seed.ts` | `node:sqlite` schema, deterministic seed, transactional reset |
| Sessions | `src/server/auth.ts` | Opaque token in httpOnly cookie, hashed at rest, rotated on login/logout, demo-profile login only |
| Policy + repository | `src/server/bank.ts` | Every read/write takes a `Principal`; SQL filters by owner; PREPARE/CONFIRM state machine with 5-min expiry, session binding, re-validation at execution, step-up for transfers/limits |
| Tool registry | `src/server/tools/registry.ts` | 23 tools (zod schemas → JSON Schema), channel exposure (text/voice), structured results (`data` for the model, `cards` + `ui` for the app), audit log |
| Knowledge | `src/server/knowledge/kb.ts` | 9 verified public sources + 2 flagged general explanations, accent-insensitive BM25 retrieval |
| LLM | `src/server/llm/providers.ts` | Provider abstraction: Anthropic Messages (streaming, adaptive thinking, low effort, prompt caching, optional server-side refusal fallback) and OpenAI Responses (streaming) |
| Engine | `src/server/llm/engine.ts` | Turn orchestration, context block, intent classifier, workflow state, SSE events |
| Voice | `src/server/realtime.ts`, `src/lib/voice/realtime.ts` | Ephemeral secret minting; WebRTC client, event handling, tool bridge, audio levels |
| UI | `src/components/**` | Phone shell, 8 screens, Compass sheet/peek, cards, voice mode, demo panel |

## 4. Tool registry

| Tool | Access | Effect |
|---|---|---|
| `get_authenticated_customer` | public | Session state (from server) |
| `get_accounts`, `get_account_balance` | customer | Balance cards |
| `get_transactions` (text, ±10 % amount, category, period, direction), `get_transaction_details` | customer | Lists/detail; descriptions wrapped as `untrusted_text` |
| `open_transaction_details`, `navigate_to_page` | customer/public | UI directive to an **enum** page + highlight |
| `get_cards`, `get_card_status` | customer | Masked numbers only |
| `prepare_card_freeze`, `prepare_card_unfreeze`, `prepare_card_limit_change`, `prepare_transfer` | customer | Creates a PENDING action and a confirmation card. Executes nothing |
| `cancel_pending_action` | customer | Cancels own pending action |
| `confirm_pending_action` | customer, **voice only** | Executes only if the last user transcript is an explicit yes |
| `get_beneficiaries` | customer | Name + IBAN tail |
| `calculate_spending_summary` | customer | Totals computed by the server, fair same-days comparison |
| `search_banking_knowledge`, `get_public_banking_procedure` | public | Verified sources + source card |
| `prepare_human_handoff` | customer | Draft summary; customer edits/confirms/cancels via UI |
| `suggest_actions` | text | Quick-reply buttons (they only send text) |
| `set_accessibility_preferences` | public | Simplified mode, text size, contrast |
| `get_screen_context` | voice | What is on screen (validated) |

Confirmation (`confirm_card_freeze`, `confirm_simulated_transfer`, …) is implemented by
`confirmAction()` and reached **only** through `POST /api/actions {op:"confirm"}` (a user click)
or the voice-guarded tool. The text model never sees a confirm tool.

## 5. Data model (SQLite)

`customers` (display name, language, accessibility preferences, demo profile) · `accounts`
(owner, type, balance in cents, status) · `transactions` · `cards` (masked number, status
ACTIVE/FROZEN/OPPOSED, limits, options) · `beneficiaries` · `sessions` (hashed token, customer or
NULL, expiry, visitor preferences) · `conversations` (session-scoped, context, workflow, messages)
· `pending_actions` (customer, session, type, target, params, status, expiry, result) ·
`support_handoffs` (customer, category, user-approved summary, status) · `audit_log` (decisions
shown live in the demo panel).

Money is stored as integer cents and displayed with `Intl.NumberFormat("fr-FR")`: `1 245,80 €`.

## 6. Workflow state

Kept per conversation: `intent` (17 intents from the brief + ACCESSIBILITY, from the parallel
classifier), `stage` (understanding → collecting_information → awaiting_confirmation /
auth_required / handoff_review → completed/answered), `missingInformation`, `sensitive`,
`authenticated` (from the session), `pendingActionId`, `escalationRecommended`, `lastPage`. The
classifier can't grant permissions. It only feeds state and the demo panel.

## 7. UI contract

`UiDirective` = `navigate {page ∈ APP_PAGES, highlight ∈ HIGHLIGHTS, transactionId?, cardId?}` or
`refresh {keys}`. The frontend checks nothing about authorization. It only interprets directives
that the server already validated: transaction and card IDs are ownership-checked before a directive
is emitted. When the assistant navigates, the sheet collapses to a "peek" bar so the customer sees
the app respond.

## 8. Model choices

- Text: `claude-opus-5-5` with adaptive thinking and `effort: "low"` for conversational latency. The stable system prompt and tools are cached, and per-turn context goes in messages. Assistant turns are replayed with their native content blocks (append-only history). Anthropic's server-side refusal fallback (beta) is on and retried without it if the account lacks the beta.
- Classifier: `claude-haiku-4-5`, or the same OpenAI text model, with a JSON-schema output.
- Voice: `gpt-realtime-2.1` over WebRTC, `semantic_vad`, transcription `gpt-4o-mini-transcribe` (fr), voice `marin` or `cedar` (user preference).
- All IDs can be overridden by environment variable (see `.env.example`).
