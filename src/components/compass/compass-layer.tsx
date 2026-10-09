"use client"
import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import {
  ArrowUpIcon, ChevronDownIcon, ChevronUpIcon, CircleAlertIcon, LoaderCircleIcon, LockIcon, MapPinIcon, MicIcon, RotateCcwIcon, XIcon, CheckIcon,
} from "lucide-react"
import { api, useSession } from "@/lib/api"
import { sendToCompass } from "@/lib/compass-client"
import { useCompass, type UIMessage } from "@/lib/store"
import { cn } from "@/lib/utils"
import { AssistantCardView } from "./cards"
import { CompassMark } from "./compass-mark"
import { VoiceController, VoiceMode, VoicePeek } from "@/components/voice/voice-mode"
import { savePrefs } from "@/components/screens/profile"

const PAGE_LABEL: Record<string, string> = {
  accueil: "Accueil", comptes: "Comptes", operations: "Opérations", cartes: "Cartes", virements: "Virements", profil: "Profil", connexion: "Connexion", conseiller: "Conseiller",
}

const SUGGESTIONS = [
  "J'ai perdu ma carte",
  "Consulter mon solde",
  "Comprendre une opération",
  "Parler à un conseiller",
  "Faire un virement",
  "Comprendre un crédit",
]

/** Minimal formatter: paragraphs + **bold**. Model text is never rendered as HTML. */
function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n{2,}/).map((para, i) => (
        <p key={i} className="whitespace-pre-line [&+p]:mt-2">
          {para.split(/(\*\*[^*]+\*\*)/g).map((seg, j) =>
            seg.startsWith("**") && seg.endsWith("**") ? (
              <strong key={j} className="font-extrabold">
                {seg.slice(2, -2)}
              </strong>
            ) : (
              <span key={j}>{seg}</span>
            ),
          )}
        </p>
      ))}
    </>
  )
}

function ToolChips({ m }: { m: UIMessage }) {
  if (!m.tools.length) return null
  return (
    <ul className="mb-2 flex flex-wrap gap-1.5" aria-label="Actions de Compass">
      {m.tools.map((t) => (
        <li
          key={t.id}
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold",
            t.status === "running" && "bg-surface text-muted-ink",
            t.status === "ok" && "bg-ok-soft text-ok",
            t.status === "error" && (t.code === "AUTH_REQUIRED" || t.code === "NOT_FOUND" ? "bg-brand-soft text-brand" : "bg-warn-soft text-warn"),
          )}
        >
          {t.status === "running" ? (
            <LoaderCircleIcon className="size-3 animate-spin" aria-hidden />
          ) : t.status === "ok" ? (
            <CheckIcon className="size-3" aria-hidden />
          ) : t.code === "AUTH_REQUIRED" ? (
            <LockIcon className="size-3" aria-hidden />
          ) : (
            <CircleAlertIcon className="size-3" aria-hidden />
          )}
          {t.status === "error" && t.code === "AUTH_REQUIRED" ? "Accès refusé : connexion requise" : t.status === "error" && t.code === "NOT_FOUND" ? `${t.label} : accès refusé` : t.label}
        </li>
      ))}
    </ul>
  )
}

function Message({ m, last }: { m: UIMessage; last: boolean }) {
  if (m.role === "user")
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-[20px] rounded-br-md bg-navy px-3.5 py-2.5 text-[15px] leading-snug text-white">
          {m.via === "voice" && <MicIcon className="mr-1 inline size-3.5 opacity-70" aria-label="Message vocal" />}
          {m.text}
        </p>
      </div>
    )
  const thinking = m.status === "streaming" && !m.text && !m.cards.length
  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-white" aria-hidden>
        <CompassMark className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <ToolChips m={m} />
        {thinking && (
          <span className="flex h-6 items-center gap-1" aria-label="Compass réfléchit">
            <span className="typing-dot size-1.5 rounded-full bg-navy" />
            <span className="typing-dot size-1.5 rounded-full bg-navy" />
            <span className="typing-dot size-1.5 rounded-full bg-navy" />
          </span>
        )}
        {m.text && (
          <div className="text-[15px] leading-relaxed text-navy">
            {m.via === "voice" && <MicIcon className="mr-1 inline size-3.5 text-muted-ink" aria-label="Réponse vocale" />}
            <RichText text={m.text} />
            {m.status === "streaming" && <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-brand" aria-hidden />}
          </div>
        )}
        {m.cards.length > 0 && (
          <div className="mt-2.5 flex flex-col gap-2">
            {m.cards.map((c, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }}>
                <AssistantCardView card={c} interactive={last || c.kind !== "options"} />
              </motion.div>
            ))}
          </div>
        )}
        {m.status === "error" && m.error && (
          <div role="alert" className="mt-2 flex items-start gap-2 rounded-2xl bg-brand-soft p-3 text-sm text-brand">
            <CircleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div className="flex-1">
              <p className="font-semibold">{m.error.message}</p>
              {m.error.retryable && m.error.retryInput && (
                <button type="button" onClick={() => sendToCompass({ message: m.error!.retryInput! }, { hidden: true })} className="mt-1 font-bold underline underline-offset-2">
                  Réessayer
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Welcome({ authed, firstName }: { authed: boolean; firstName?: string }) {
  return (
    <div className="flex flex-col gap-5 pt-2">
      <div className="flex flex-col gap-2">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-brand text-white shadow-[0_10px_24px_-10px_rgba(200,16,46,0.7)]">
          <CompassMark className="size-7" />
        </span>
        {authed ? (
          <p className="text-[22px] font-extrabold leading-tight tracking-tight text-navy">
            Bonjour {firstName} 👋
            <br />
            <span className="text-[17px] font-semibold text-muted-ink">Je suis Compass, votre assistant bancaire. Comment puis-je vous aider aujourd&apos;hui ?</span>
          </p>
        ) : (
          <p className="text-[22px] font-extrabold leading-tight tracking-tight text-navy">
            Bonjour 👋
            <br />
            <span className="text-[17px] font-semibold text-muted-ink">Je peux vous aider à découvrir nos services et à effectuer vos démarches bancaires.</span>
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Suggestions">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => sendToCompass({ message: s })}
            className="hc-outline min-h-14 rounded-2xl bg-surface px-3 py-2.5 text-left text-[13.5px] font-bold leading-snug text-navy transition hover:bg-line"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}

function Composer({ inputRef }: { inputRef: React.RefObject<HTMLTextAreaElement | null> }) {
  const busy = useCompass((s) => s.busy)
  const [text, setText] = useState("")
  const send = () => {
    const t = text.trim()
    if (!t || busy) return
    setText("")
    void sendToCompass({ message: t })
  }
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [text, inputRef])
  return (
    <div className="shrink-0 border-t border-line bg-white px-3 pb-[max(env(safe-area-inset-bottom),12px)] pt-2.5 lg:pb-6">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
        className="flex items-end gap-2 rounded-[26px] bg-surface p-1.5 pl-4 ring-1 ring-line focus-within:ring-2 focus-within:ring-navy"
      >
        <label htmlFor="compass-input" className="sr-only">
          Votre message à Compass
        </label>
        <textarea
          id="compass-input"
          ref={inputRef}
          rows={1}
          value={text}
          maxLength={1200}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              send()
            }
          }}
          placeholder="Écrivez votre demande…"
          className="max-h-[120px] min-h-10 flex-1 resize-none bg-transparent py-2 text-[15px] text-navy outline-none placeholder:text-muted-ink"
        />
        <button
          type="button"
          onClick={() => useCompass.getState().setVoice(true)}
          aria-label="Passer en conversation vocale"
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-navy hover:bg-white"
        >
          <MicIcon className="size-5" />
        </button>
        <button
          type="submit"
          disabled={!text.trim() || busy}
          aria-label="Envoyer"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand text-white transition disabled:bg-line disabled:text-muted-ink"
        >
          {busy ? <LoaderCircleIcon className="size-5 animate-spin" /> : <ArrowUpIcon className="size-5" />}
        </button>
      </form>
      <p className="mt-1.5 text-center text-[10.5px] text-muted-ink">Ne partagez jamais vos codes. Compass peut se tromper : vérifiez avant de confirmer.</p>
    </div>
  )
}

export function CompassLayer() {
  const sheet = useCompass((s) => s.sheet)
  const voice = useCompass((s) => s.voice)
  const messages = useCompass((s) => s.messages)
  const context = useCompass((s) => s.context)
  const busy = useCompass((s) => s.busy)
  const { data: session } = useSession()
  const scroller = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [navH, setNavH] = useState(84)

  useEffect(() => {
    const nav = document.getElementById("bottom-nav")
    if (!nav) return
    const ro = new ResizeObserver(() => setNavH(nav.offsetHeight))
    ro.observe(nav)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" })
  }, [messages])

  // Announce completed assistant replies once (not every streamed token).
  const last = messages[messages.length - 1]
  const announce = last?.role === "assistant" && last.status === "done" ? last.text : ""

  useEffect(() => {
    if (sheet === "open" && !voice) setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 250)
  }, [sheet, voice])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && useCompass.getState().sheet === "open" && !useCompass.getState().stepUp) useCompass.getState().setSheet("peek")
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  const authed = !!session?.authenticated
  const simplified = !!session?.preferences.simplified
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant")
  const visible = messages.filter((m) => !(m.role === "assistant" && m.status === "done" && !m.text && !m.cards.length && !m.tools.length))

  const newConversation = async () => {
    const id = useCompass.getState().conversationId
    if (id) await api("/api/chat/reset", { method: "POST", json: { conversationId: id } }).catch(() => null)
    useCompass.getState().resetConversation()
  }

  return (
    <>
      <VoiceController />
      <div aria-live="polite" className="sr-only">
        {announce}
      </div>
      <AnimatePresence>
        {sheet === "open" && (
          <motion.div
            key="dim"
            className="absolute inset-0 z-40 bg-navy/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => useCompass.getState().setSheet("peek")}
            aria-hidden
          />
        )}
        {sheet === "open" && (
          <motion.section
            key="sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Compass, assistant bancaire"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 34, stiffness: 320 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            dragListener={false}
            className="absolute inset-x-0 bottom-0 top-[5%] z-50 flex flex-col overflow-hidden rounded-t-[30px] bg-white shadow-[0_-20px_60px_-20px_rgba(20,35,59,0.45)] lg:top-[6.5%]"
          >
            {voice ? (
              <VoiceMode />
            ) : (
              <>
                <header className="shrink-0 border-b border-line/70 px-4 pb-2.5 pt-2">
                  <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-line" aria-hidden />
                  <div className="flex items-center gap-2">
                    <span className="flex size-9 items-center justify-center rounded-xl bg-brand text-white" aria-hidden>
                      <CompassMark className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-base font-extrabold leading-tight text-navy">Compass</h2>
                      <p className="flex items-center gap-1 truncate text-[11px] font-semibold text-muted-ink">
                        <MapPinIcon className="size-3" aria-hidden />
                        {PAGE_LABEL[context.page] ?? "Application"}
                        {context.page === "operations" && context.selectedTransactionId ? " · opération sélectionnée" : ""}
                        {" · "}
                        {authed ? "connecté" : "visiteur"}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-pressed={simplified}
                      onClick={() => savePrefs({ simplified: !simplified })}
                      className={cn("h-9 rounded-full px-3 text-xs font-extrabold transition-colors", simplified ? "bg-ok text-white" : "bg-surface text-navy hover:bg-line")}
                      title="Mode simplifié : phrases courtes, sans jargon"
                    >
                      Simplifié
                    </button>
                    <button type="button" onClick={newConversation} disabled={busy} aria-label="Nouvelle conversation" className="flex size-9 items-center justify-center rounded-full text-navy hover:bg-surface">
                      <RotateCcwIcon className="size-[18px]" />
                    </button>
                    <button type="button" onClick={() => useCompass.getState().setSheet("peek")} aria-label="Réduire Compass" className="flex size-9 items-center justify-center rounded-full text-navy hover:bg-surface">
                      <ChevronDownIcon className="size-5" />
                    </button>
                    <button type="button" onClick={() => useCompass.getState().setSheet("closed")} aria-label="Fermer Compass" className="flex size-9 items-center justify-center rounded-full text-navy hover:bg-surface">
                      <XIcon className="size-5" />
                    </button>
                  </div>
                </header>
                <div ref={scroller} className="no-scrollbar flex-1 overflow-y-auto overscroll-contain px-4 py-4" role="log" aria-label="Conversation avec Compass">
                  {visible.length === 0 ? (
                    <Welcome authed={authed} firstName={session?.customer?.firstName} />
                  ) : (
                    <div className="flex flex-col gap-4">
                      {visible.map((m) => (
                        <Message key={m.id} m={m} last={m.id === lastAssistant?.id} />
                      ))}
                    </div>
                  )}
                </div>
                <Composer inputRef={inputRef} />
              </>
            )}
          </motion.section>
        )}
        {sheet === "peek" && (
          <motion.div
            key="peek"
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            className="absolute inset-x-3 z-40"
            style={{ bottom: navH + 10 }}
          >
            {voice ? (
              <VoicePeek />
            ) : (
              <div className="flex items-center gap-2 rounded-[22px] bg-white p-2 pl-3 shadow-[0_12px_32px_-12px_rgba(20,35,59,0.5)] ring-1 ring-line">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-white" aria-hidden>
                  <CompassMark className="size-4" />
                </span>
                <button type="button" onClick={() => useCompass.getState().setSheet("open")} className="min-w-0 flex-1 text-left" aria-label="Rouvrir la conversation avec Compass">
                  <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-navy">
                    {busy && !lastAssistant?.text ? "Compass réfléchit…" : lastAssistant?.text || "Une question ? Je suis là."}
                  </p>
                </button>
                <button type="button" onClick={() => useCompass.getState().setSheet("open")} aria-label="Agrandir Compass" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface text-navy">
                  <ChevronUpIcon className="size-5" />
                </button>
                <button type="button" onClick={() => useCompass.getState().setSheet("closed")} aria-label="Fermer Compass" className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-ink hover:bg-surface">
                  <XIcon className="size-4" />
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
