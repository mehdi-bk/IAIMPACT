"use client"
import { useEffect, useRef } from "react"
import { ChevronDownIcon, ChevronUpIcon, KeyboardIcon, MicIcon, MicOffIcon, PhoneOffIcon, RotateCcwIcon } from "lucide-react"
import { useSession } from "@/lib/api"
import { useCompass } from "@/lib/store"
import { levels, notifyVoice, setMuted, startVoice, stopVoice, useVoice, voiceActive, type VoiceStatus } from "@/lib/voice/realtime"
import { cn } from "@/lib/utils"
import { AssistantCardView } from "@/components/compass/cards"
import { CompassMark } from "@/components/compass/compass-mark"

const LABEL: Record<VoiceStatus, string> = {
  idle: "Prêt",
  connecting: "Connexion sécurisée…",
  listening: "Je vous écoute",
  user_speaking: "Je vous écoute…",
  thinking: "Compass réfléchit…",
  speaking: "Compass vous répond",
  error: "Voix indisponible",
}

/** Starts/stops the realtime session as voice mode is toggled; reports auth changes. */
export function VoiceController() {
  const voice = useCompass((s) => s.voice)
  const { data: session } = useSession()
  const authed = session?.authenticated
  const prevAuthed = useRef(authed)

  useEffect(() => {
    if (voice && !voiceActive() && useVoice.getState().status !== "error") void startVoice()
    if (!voice) {
      if (voiceActive()) stopVoice()
      else if (useVoice.getState().status === "error") useVoice.setState({ status: "idle", error: null })
    }
  }, [voice])

  useEffect(() => {
    if (prevAuthed.current !== undefined && authed !== prevAuthed.current && voiceActive()) {
      notifyVoice(
        authed
          ? `<evenement_application>Le client vient de se connecter (vérifié par le serveur, prénom ${session?.customer?.firstName}). Ses données sont désormais accessibles via les outils.</evenement_application> Dis simplement qu'il est bien connecté et que tu l'écoutes.`
          : "<evenement_application>Le client s'est déconnecté. Plus aucune donnée personnelle n'est accessible.</evenement_application> Dis-le en une phrase.",
      )
    }
    prevAuthed.current = authed
  }, [authed, session?.customer?.firstName])
  return null
}

/** Orb driven by real audio levels: inner = Compass speaking, ring = customer voice. */
function Orb({ size = 168 }: { size?: number }) {
  const inner = useRef<HTMLDivElement>(null)
  const ring = useRef<HTMLDivElement>(null)
  const status = useVoice((s) => s.status)
  useEffect(() => {
    let raf = 0
    const loop = () => {
      const o = levels.output
      const i = levels.input
      if (inner.current) inner.current.style.transform = `scale(${1 + o * 0.45})`
      if (ring.current) {
        ring.current.style.transform = `scale(${1 + i * 0.55})`
        ring.current.style.opacity = String(0.25 + i * 0.75)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }} aria-hidden>
      <div ref={ring} className="absolute inset-0 rounded-full border-2 border-white/40 transition-transform duration-75" />
      <div
        className={cn(
          "absolute inset-[14%] rounded-full blur-2xl transition-colors duration-500",
          status === "speaking" ? "bg-brand/70" : status === "thinking" ? "bg-[#4a6fb3]/60" : "bg-white/15",
        )}
      />
      <div
        ref={inner}
        className={cn(
          "relative flex items-center justify-center rounded-full shadow-[0_0_60px_-10px_rgba(200,16,46,0.8)] transition-colors duration-500",
          status === "speaking" ? "bg-brand" : "bg-[#22365a]",
        )}
        style={{ width: size * 0.56, height: size * 0.56 }}
      >
        <CompassMark className={cn("size-1/2 text-white", status === "thinking" && "animate-spin [animation-duration:2.4s]")} />
      </div>
    </div>
  )
}

export function VoiceMode() {
  const { status, error, muted, model } = useVoice()
  const messages = useCompass((s) => s.messages)
  const scroller = useRef<HTMLDivElement>(null)
  const voiceMsgs = messages.filter((m) => m.via === "voice")
  const lastCards = [...voiceMsgs].reverse().find((m) => m.role === "assistant" && m.cards.some((c) => c.kind !== "options"))?.cards ?? []

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" })
  }, [messages])

  const backToText = () => {
    stopVoice()
    useCompass.getState().setVoice(false)
  }

  return (
    <div className="flex h-full flex-col bg-[radial-gradient(120%_80%_at_50%_0%,#22365a_0%,#14233b_55%,#0d1728_100%)] text-white" aria-label="Conversation vocale avec Compass">
      <header className="flex shrink-0 items-center gap-2 px-4 pb-1 pt-3">
        <div className="flex-1">
          <h2 className="text-base font-extrabold">Conversation vocale</h2>
          <p className="text-[11px] font-semibold text-white/60">{model ? `OpenAI Realtime · ${model}` : "OpenAI Realtime"} · transcription affichée</p>
        </div>
        <button type="button" onClick={() => useCompass.getState().setSheet("peek")} aria-label="Réduire et voir l'application" className="flex size-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
          <ChevronDownIcon className="size-5" />
        </button>
      </header>

      <div className="flex shrink-0 flex-col items-center gap-3 pb-2 pt-4">
        <Orb />
        <p className="text-lg font-bold" role="status" aria-live="polite">
          {muted && status !== "error" ? "Micro coupé" : LABEL[status]}
        </p>
      </div>

      {status === "error" ? (
        <div className="flex flex-1 flex-col items-center justify-start gap-4 px-6 pt-4 text-center">
          <p role="alert" className="rounded-2xl bg-white/10 p-4 text-sm font-semibold">
            {error}
          </p>
          <button type="button" onClick={backToText} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white font-bold text-navy">
            <KeyboardIcon className="size-5" aria-hidden /> Continuer par écrit
          </button>
          <button type="button" onClick={() => void startVoice()} className="flex h-11 items-center gap-2 text-sm font-bold text-white/80">
            <RotateCcwIcon className="size-4" aria-hidden /> Réessayer
          </button>
        </div>
      ) : (
        <div ref={scroller} className="no-scrollbar flex flex-1 flex-col gap-2.5 overflow-y-auto px-5 py-2" role="log" aria-label="Transcription">
          {voiceMsgs.slice(-8).map((m) =>
            m.text ? (
              <p key={m.id} className={cn("text-[15px] leading-snug", m.role === "user" ? "self-end rounded-2xl rounded-br-md bg-white/12 px-3 py-2 text-white/90" : "text-white")}>
                {m.text}
              </p>
            ) : null,
          )}
          {lastCards.length > 0 && (
            <div className="mt-1 flex flex-col gap-2 text-navy">
              {lastCards
                .filter((c) => c.kind !== "options")
                .slice(-2)
                .map((c, i) => (
                  <AssistantCardView key={i} card={c} />
                ))}
            </div>
          )}
        </div>
      )}

      <footer className="flex shrink-0 items-center justify-center gap-5 px-6 pb-[max(env(safe-area-inset-bottom),20px)] pt-3 lg:pb-8">
        <button
          type="button"
          onClick={() => setMuted(!muted)}
          disabled={status === "error" || status === "connecting"}
          aria-pressed={muted}
          aria-label={muted ? "Réactiver le micro" : "Couper le micro"}
          className={cn("flex size-14 items-center justify-center rounded-full transition disabled:opacity-40", muted ? "bg-white text-navy" : "bg-white/12 text-white hover:bg-white/20")}
        >
          {muted ? <MicOffIcon className="size-6" /> : <MicIcon className="size-6" />}
        </button>
        <button type="button" onClick={backToText} aria-label="Terminer la conversation vocale" className="flex size-16 items-center justify-center rounded-full bg-brand text-white shadow-lg hover:bg-brand-strong">
          <PhoneOffIcon className="size-7" />
        </button>
        <button type="button" onClick={backToText} aria-label="Revenir à la conversation écrite" className="flex size-14 items-center justify-center rounded-full bg-white/12 text-white hover:bg-white/20">
          <KeyboardIcon className="size-6" />
        </button>
      </footer>
    </div>
  )
}

export function VoicePeek() {
  const { status, muted } = useVoice()
  const last = useCompass((s) => [...s.messages].reverse().find((m) => m.via === "voice" && m.role === "assistant" && m.text))
  return (
    <div className="flex items-center gap-2 rounded-[22px] bg-navy p-2 pl-2.5 text-white shadow-[0_12px_32px_-12px_rgba(20,35,59,0.7)]">
      <div className="shrink-0">
        <Orb size={44} />
      </div>
      <button type="button" onClick={() => useCompass.getState().setSheet("open")} className="min-w-0 flex-1 text-left" aria-label="Rouvrir la conversation vocale">
        <p className="text-[11px] font-bold uppercase tracking-wide text-white/60">{muted ? "Micro coupé" : LABEL[status]}</p>
        <p className="line-clamp-1 text-[13px] font-semibold">{last?.text ?? "Parlez, je vous écoute."}</p>
      </button>
      <button type="button" onClick={() => useCompass.getState().setSheet("open")} aria-label="Agrandir" className="flex size-9 items-center justify-center rounded-full bg-white/10">
        <ChevronUpIcon className="size-5" />
      </button>
      <button
        type="button"
        onClick={() => {
          stopVoice()
          useCompass.getState().setVoice(false)
        }}
        aria-label="Terminer la conversation vocale"
        className="flex size-9 items-center justify-center rounded-full bg-brand"
      >
        <PhoneOffIcon className="size-4" />
      </button>
    </div>
  )
}
