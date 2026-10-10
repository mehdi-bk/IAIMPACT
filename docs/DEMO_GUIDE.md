# Demo guide — exact steps


## First setup — DeepSeek text + OpenAI voice

The prepared `.env.local` selects DeepSeek and preserves your OpenAI configuration. Fill in `DEEPSEEK_API_KEY` locally (do not paste
keys into chat or commit them):

```dotenv
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_MODEL=deepseek-flash
OPENAI_API_KEY=your_openai_project_api_key
OPENAI_REALTIME_MODEL=gpt-realtime-2.1-mini
```

If `.env.local` is missing, copy `.env.example` first. The OpenAI key must be a
permanent project API key; an expiring Realtime session secret will not work here.
No Anthropic key is required. Keep `LLM_PROVIDER=deepseek` so text never automatically
uses OpenAI credits. Intent classification also uses DeepSeek.

From the `IAIMPACT` directory, run `npm run dev`, open <http://localhost:3000>,
and open `/demo` if the demo panel is hidden on your screen. Restart the server
whenever you edit `.env.local`.

## Acceptance checklist for this setup

| Case | Steps | Pass condition |
|---|---|---|
| DeepSeek connectivity | Click **Tester l'IA** | Result identifies `deepseek / deepseek-flash` and answers OK |
| OpenAI credentials | Click **Tester la voix** | Ephemeral key obtained for `gpt-realtime-2.1-mini`; this checks credentials, not microphone/audio |
| Actual voice | Select Camille, open mic, allow microphone, ask « Quel est mon solde ? » | Audible answer, transcript, balance card; end the voice session after the test |
| Lost card | Run Journey A below in text | Card stays ACTIVE until click, then becomes FROZEN |
| Dispute | Run Journey B below in text | 89 € operation found, summary reviewed, simulated request stored |
| Access control | Run Journey C below, in text then voice | Visitor gets no balance; Camille gets 1 245,80 € |
| Voice confirmation | Restore card, say « Bloque ma carte », then explicitly confirm when prompted | Pending action first; freeze only after confirmation |
| Voice → text | Return to text after asking for the balance | Transcript remains visible and text follow-up works |
| Text-only fallback | Temporarily blank OpenAI key and restart | DeepSeek works; voice unavailable with a text alternative |
| Missing DeepSeek | Temporarily blank DeepSeek key, leave `LLM_PROVIDER=deepseek`, restart | Text configuration error; OpenAI voice remains available, no paid text fallback |

Restore both keys and restart after the missing-key cases. Reset the demo data
between journeys. DeepSeek balance or rate limits can interrupt repeated multi-turn runs;
a 402 means check your DeepSeek balance; a 429 means stop and retry after the provider's indicated delay. A 401/403 usually
requires checking the key, project permissions, or model access. A model-not-found
error requires selecting an available model through the relevant env variable.

The existing real-model browser tests cover text journeys A/B/C and transaction
prompt injection. After entering keys, run:

```bash
npx playwright install chromium  # once, if not installed
npm run test:e2e -- tests/e2e/assistant.spec.ts
```

These tests launch a separate server on port 3100 with `data/e2e.db`, read
`.env.local`, and make real DeepSeek requests. Stop any old test server on port 3100
before rerunning with changed keys. Browser tests do not validate live microphone
quality; use the manual voice cases above. They skip if no text provider is configured.

Local verification before key entry: `npm test`, `npm run typecheck`, `npm run lint`.
The DeepSeek adapter buffers each model turn so tool-call messages can be replayed
intact; text appears at turn completion rather than token by token.

## Before going on stage (5 min)

1. `npm run dev` (or `npm run build && DEMO_MODE=true npm start` for the most stable run).
2. Open `http://localhost:3000` in Chrome, full screen, at least 1440 px wide so the phone and demo panel both show (the left pitch column appears from 1536 px).
3. In the demo panel, readiness should show **Base ● SQLite**, **IA texte ● deepseek-flash** (or your model) and **Voix ● Realtime**.
4. Click **Tester l'IA**, then **Tester la voix**. Both should show ✓.
5. Click **Tout réinitialiser**, then select **Camille**.
6. Allow the microphone for `localhost` once, before the pitch.
7. Use a wired or quiet microphone. Realtime `semantic_vad` copes with pauses, but room noise can trigger false turns.

The demo panel has one-click phrases for every journey (▶) in case typing on stage goes wrong.
Its black "Décisions du serveur" feed shows every ALLOWED / DENIED decision live, so keep it visible.

---

## Journey A — Lost card (≈ 60 s)

| # | Do | Expected |
|---|---|---|
| 1 | Session **Camille**. Tap the red **Compass** button | Sheet opens: « Bonjour Camille 👋 Je suis Compass… » + 6 suggestions |
| 2 | Type « J'ai perdu ma carte bancaire. » | Short answer explaining temporary lock vs. opposition, buttons **[Verrouiller ma carte] [Procédure d'opposition]**. Intent `CARD_LOST` in the panel |
| 3 | Tap **Verrouiller ma carte** | Chips « Consultation de vos cartes ✓ », « Préparation du verrouillage ✓ ». A **confirmation card** appears (Carte Visa •••• 4821). Panel: `prepare.CARD_FREEZE ALLOWED … en attente de confirmation` |
| 4 | Point out that the card is still ACTIVE (panel: « carte de Camille ACTIVE ») | Nothing changes without consent |
| 5 | Tap **Confirmer** | Card: « Carte •••• 4821 temporairement verrouillée. » Panel: `confirm.CARD_FREEZE ALLOWED` and card state **FROZEN**. Compass acknowledges and opens **Cartes** with the lock button highlighted. The card visual shows « Carte temporairement verrouillée » |
| 6 | (optional) Tap **Déverrouiller la carte** → Confirmer | Back to Active |

**Voice variant**: tap the mic, say « Bloque ma carte s'il te plaît », wait for the confirmation
card, then say « Oui, je confirme ». The server checks the transcript before executing.

## Journey B — Unrecognised payment (≈ 90 s)

| # | Do | Expected |
|---|---|---|
| 1 | **Restaurer op. 89 €** (panel) if you ran it before | Clean state |
| 2 | « Je vois un paiement de 89 euros que je ne reconnais pas. » | Transaction card: Paiement inconnu, −89,00 €, date, libellé `CB PAIEMENT EN LIGNE REF 4471-XK`, Débitée. No fraud verdict, no invented merchant. Buttons **[Voir les détails] [Comprendre la contestation] [Contacter un conseiller]** |
| 3 | **Comprendre la contestation** | Verified answer (13 months, report quickly) + **Sources** card (INC, Caisse d'Épargne) with ✓ « vérifiée le 10/10/2026 » |
| 4 | « Je voudrais parler à un conseiller. » | **Résumé pour votre conseiller** card: client, motif, opération (89,00 € …), situation, actions, demande |
| 5 | **Modifier** → change a word → **Enregistrer** (optional), then **Confirmer le partage** | « Demande de démonstration enregistrée ». Compass says honestly that no real adviser receives it |
| 6 | Bottom nav **Accueil** → **Contacter un conseiller** | « Mes demandes » shows the request with status **Enregistrée (démo)** |

Context bonus: open **Opérations**, tap the 89 € line, then **Demander à Compass**
(« C'est quoi ce paiement ? »). Compass already knows which transaction is meant.

## Journey C — Accessibility + authentication (≈ 90 s)

| # | Do | Expected |
|---|---|---|
| 1 | Panel: **Visiteur**. Home shows « Mode visiteur » | |
| 2 | Tap the **mic** in « Que puis-je faire pour vous ? » | Immersive voice screen, orb driven by live audio, « Je vous écoute », live transcript |
| 3 | Say « Bonjour, je voudrais savoir combien il me reste sur mon compte. » | Compass explains that you need to log in. Panel: `get_account_balance DENIED Session visiteur`. No amount is spoken |
| 4 | Panel: **Camille** (voice keeps running) | Compass is told the session changed |
| 5 | Repeat the question | Balance tool ALLOWED, spoken answer « 1 245,80 € », balance card in the transcript |
| 6 | Say « Parle-moi plus simplement » (or tap **Simplifié** in the text sheet) | Simplified mode on (stored server-side) |
| 7 | « Je ne comprends pas mes dépenses. » | Short, plain explanation + spending card computed by the server |
| 8 | Tap the keyboard icon (**Revenir au texte**) | The written conversation contains the voice transcript, so you can carry on by typing |

If the mic is refused or voice is unavailable, the voice screen says so and offers **Continuer par
écrit**. Every journey also works in text.

## Reset between runs

Demo panel → **Tout réinitialiser** (restores all data, cancels pending actions, clears conversations
and the audit feed). To restore single pieces, use **Restaurer la carte** or **Restaurer op. 89 €**.

## Fallback plan

- **LLM down / no network**: the app stays fully usable (cards, transfers, freeze from the Cartes screen). Compass shows « momentanément indisponible » and never fakes an answer. Show Journey A from the Cartes screen and the backend trace.
- **Voice down**: do Journey C in text: same tools, same permissions.
- **Backup recording**: record the three journeys with screen capture before the pitch and keep the file on the desktop. A recording made by the team is the only backup; the prototype doesn't produce one by itself.
