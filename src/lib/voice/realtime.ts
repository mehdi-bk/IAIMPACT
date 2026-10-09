"use client"
import { create } from "zustand"
import { applyDirective, updateActionEverywhere, voiceBridge } from "@/lib/compass-client"
import { refresh } from "@/lib/api"
import { uid, useCompass, type UIMessage } from "@/lib/store"
import type { AssistantCard, PendingAction, UiDirective } from "@/lib/types"

// ============================================================================
// Browser side of OpenAI Realtime speech-to-speech over WebRTC.
//  1. ask our server for a short-lived client secret (the API key stays server-side)
//  2. SDP offer -> https://api.openai.com/v1/realtime/calls -> answer
//  3. events on the "oai-events" data channel
//  4. every function call is executed by OUR backend (/api/realtime/tool)
//     with the session principal: voice has no more power than text.
// ============================================================================

export type VoiceStatus = "idle" | "connecting" | "listening" | "user_speaking" | "thinking" | "speaking" | "error"

interface VoiceState {
  status: VoiceStatus
  error: string | null
  muted: boolean
  model: string | null
  startedAt: number | null
}

export const useVoice = create<VoiceState>(() => ({ status: "idle", error: null, muted: false, model: null, startedAt: null }))

/** Live audio levels (0..1), read by the visualizer in a rAF loop (no React re-render). */
export const levels = { input: 0, output: 0 }

class MicDeniedError extends Error {}

let pc: RTCPeerConnection | null = null
let dc: RTCDataChannel | null = null
let mic: MediaStream | null = null
let audioEl: HTMLAudioElement | null = null
let audioCtx: AudioContext | null = null
let rafId = 0
let lastUserTranscript = ""
let pendingUserItem: string | null = null
const transcriptWaiters: ((t: string) => void)[] = []
const assistantMsgByItem = new Map<string, string>() // realtime item_id -> UIMessage id
const userMsgByItem = new Map<string, string>()
let lastAssistantMsgId: string | null = null
let handledResponses = new Set<string>()

function addMessage(m: Omit<UIMessage, "id">): string {
  const id = uid()
  useCompass.setState((s) => ({ messages: [...s.messages, { ...m, id }] }))
  return id
}
function patch(id: string, fn: (m: UIMessage) => UIMessage) {
  useCompass.setState((s) => ({ messages: s.messages.map((m) => (m.id === id ? fn(m) : m)) }))
}
function attachCards(cards: AssistantCard[]) {
  if (!cards.length) return
  if (!lastAssistantMsgId) lastAssistantMsgId = addMessage({ role: "assistant", text: "", cards: [], tools: [], status: "done", via: "voice" })
  const id = lastAssistantMsgId
  patch(id, (m) => ({ ...m, cards: [...m.cards, ...cards] }))
}

function send(event: Record<string, unknown>) {
  if (dc?.readyState === "open") dc.send(JSON.stringify(event))
}

function systemNote(text: string, respond = true) {
  send({ type: "conversation.item.create", item: { type: "message", role: "system", content: [{ type: "input_text", text }] } })
  if (respond) send({ type: "response.create" })
}

function analyse(stream: MediaStream, key: "input" | "output") {
  if (!audioCtx) return
  const src = audioCtx.createMediaStreamSource(stream)
  const an = audioCtx.createAnalyser()
  an.fftSize = 512
  src.connect(an)
  const buf = new Uint8Array(an.fftSize)
  const tick = () => {
    an.getByteTimeDomainData(buf)
    let sum = 0
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128
      sum += v * v
    }
    const rms = Math.sqrt(sum / buf.length)
    levels[key] = levels[key] * 0.7 + Math.min(1, rms * 4) * 0.3
  }
  return tick
}

function waitForTranscript(timeoutMs: number): Promise<string> {
  if (!pendingUserItem) return Promise.resolve(lastUserTranscript)
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(lastUserTranscript), timeoutMs)
    transcriptWaiters.push((s) => {
      clearTimeout(t)
      resolve(s)
    })
  })
}

async function runTool(name: string, args: string, callId: string) {
  const toolId = uid()
  if (!lastAssistantMsgId) lastAssistantMsgId = addMessage({ role: "assistant", text: "", cards: [], tools: [], status: "done", via: "voice" })
  const msgId = lastAssistantMsgId
  patch(msgId, (m) => ({ ...m, tools: [...m.tools, { id: toolId, name, label: "Vérification…", status: "running" }] }))
  const transcript = name === "confirm_pending_action" ? await waitForTranscript(2500) : lastUserTranscript
  let output = JSON.stringify({ error: { code: "INTERNAL", message: "Service indisponible, aucune action effectuée." } })
  try {
    const res = await fetch("/api/realtime/tool", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, arguments: args, lastUserTranscript: transcript, context: useCompass.getState().context }),
    })
    const r = (await res.json()) as { ok: boolean; label: string; output: string; cards: AssistantCard[]; ui: UiDirective[]; code: string | null }
    output = r.output ?? output
    patch(msgId, (m) => ({ ...m, tools: m.tools.map((t) => (t.id === toolId ? { ...t, label: r.label, status: r.ok ? "ok" : "error", code: r.code ?? undefined } : t)) }))
    attachCards(r.cards ?? [])
    for (const c of r.cards ?? []) if (c.kind === "confirmation") updateActionEverywhere(c.action)
    for (const d of r.ui ?? []) applyDirective(d)
    if (r.ok) refresh(["cards", "accounts", "transactions", "handoffs", "session"])
  } catch {
    patch(msgId, (m) => ({ ...m, tools: m.tools.map((t) => (t.id === toolId ? { ...t, status: "error" } : t)) }))
  }
  send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: callId, output } })
}

async function onEvent(ev: Record<string, unknown> & { type: string }) {
  switch (ev.type) {
    case "session.created":
    case "session.updated":
      if (useVoice.getState().status === "connecting") useVoice.setState({ status: "listening" })
      break
    case "input_audio_buffer.speech_started":
      useVoice.setState({ status: "user_speaking" })
      break
    case "input_audio_buffer.speech_stopped":
      useVoice.setState({ status: "thinking" })
      break
    case "input_audio_buffer.committed": {
      // Placeholder keeps the transcript in speaking order even if the
      // transcription arrives after the assistant starts answering.
      pendingUserItem = (ev.item_id as string) ?? null
      if (pendingUserItem) userMsgByItem.set(pendingUserItem, addMessage({ role: "user", text: "…", cards: [], tools: [], status: "streaming", via: "voice" }))
      lastAssistantMsgId = null
      break
    }
    case "conversation.item.input_audio_transcription.completed": {
      const text = String(ev.transcript ?? "").trim()
      lastUserTranscript = text
      if (pendingUserItem === ev.item_id) pendingUserItem = null
      transcriptWaiters.splice(0).forEach((w) => w(text))
      const placeholder = userMsgByItem.get(String(ev.item_id))
      if (placeholder) {
        if (text) patch(placeholder, (m) => ({ ...m, text, status: "done" }))
        else useCompass.setState((s) => ({ messages: s.messages.filter((m) => m.id !== placeholder) }))
      } else if (text) addMessage({ role: "user", text, cards: [], tools: [], status: "done", via: "voice" })
      break
    }
    case "response.output_audio_transcript.delta": {
      const itemId = String(ev.item_id)
      let id = assistantMsgByItem.get(itemId)
      if (!id) {
        id = lastAssistantMsgId && !useCompass.getState().messages.find((m) => m.id === lastAssistantMsgId)?.text
          ? lastAssistantMsgId
          : addMessage({ role: "assistant", text: "", cards: [], tools: [], status: "streaming", via: "voice" })
        assistantMsgByItem.set(itemId, id)
        lastAssistantMsgId = id
      }
      const delta = String(ev.delta ?? "")
      patch(id, (m) => ({ ...m, text: m.text + delta, status: "streaming" }))
      break
    }
    case "response.output_audio_transcript.done": {
      const id = assistantMsgByItem.get(String(ev.item_id))
      if (id) patch(id, (m) => ({ ...m, status: "done" }))
      break
    }
    case "output_audio_buffer.started":
      useVoice.setState({ status: "speaking" })
      break
    case "output_audio_buffer.stopped":
    case "output_audio_buffer.cleared":
      useVoice.setState({ status: "listening" })
      break
    case "response.done": {
      const response = ev.response as { id: string; status?: string; output?: { type: string; name?: string; arguments?: string; call_id?: string }[] }
      if (!response || handledResponses.has(response.id)) break
      handledResponses.add(response.id)
      const calls = (response.output ?? []).filter((o) => o.type === "function_call")
      if (calls.length) {
        useVoice.setState({ status: "thinking" })
        for (const c of calls) await runTool(c.name ?? "", c.arguments ?? "{}", c.call_id ?? "")
        send({ type: "response.create" })
      } else if (useVoice.getState().status === "thinking") {
        useVoice.setState({ status: "listening" })
      }
      break
    }
    case "error": {
      const err = ev.error as { message?: string; code?: string } | undefined
      console.warn("[realtime] error event:", err?.code, err?.message)
      break
    }
  }
}

export async function startVoice() {
  if (pc) return
  useVoice.setState({ status: "connecting", error: null, muted: false, startedAt: Date.now() })
  handledResponses = new Set()
  lastAssistantMsgId = null
  try {
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    } catch {
      throw new MicDeniedError()
    }
    const res = await fetch("/api/realtime/session", { method: "POST" })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data?.value) throw new Error(data?.error?.message ?? "Le service vocal est momentanément indisponible.")
    useVoice.setState({ model: data.model })

    audioCtx = new AudioContext()
    pc = new RTCPeerConnection()
    audioEl = document.createElement("audio")
    audioEl.autoplay = true
    const ticks: (() => void)[] = []
    const inTick = analyse(mic, "input")
    if (inTick) ticks.push(inTick)
    pc.ontrack = (e) => {
      audioEl!.srcObject = e.streams[0]
      const outTick = analyse(e.streams[0], "output")
      if (outTick) ticks.push(outTick)
    }
    const loop = () => {
      ticks.forEach((t) => t())
      rafId = requestAnimationFrame(loop)
    }
    rafId = requestAnimationFrame(loop)
    pc.addTrack(mic.getAudioTracks()[0], mic)
    pc.onconnectionstatechange = () => {
      if (pc && (pc.connectionState === "failed" || pc.connectionState === "disconnected")) {
        stopVoice("La connexion vocale a été interrompue. Vous pouvez continuer par écrit.")
      }
    }

    dc = pc.createDataChannel("oai-events")
    dc.onmessage = (m) => {
      try {
        void onEvent(JSON.parse(m.data))
      } catch {
        /* ignore malformed */
      }
    }
    dc.onopen = () => {
      useVoice.setState({ status: "listening" })
      // Carry over the written conversation so the voice continues it naturally.
      const recent = useCompass
        .getState()
        .messages.filter((m) => m.text && m.via !== "voice")
        .slice(-6)
        .map((m) => `${m.role === "user" ? "Client" : "Compass"} : ${m.text.slice(0, 400)}`)
      if (recent.length) systemNote(`Échanges écrits précédents (contexte, ne pas relire à voix haute) :\n${recent.join("\n")}`, false)
      systemNote("La conversation vocale commence. Salue brièvement le client en une phrase et demande comment l'aider.")
    }

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    const sdpRes = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      body: offer.sdp,
      headers: { Authorization: `Bearer ${data.value}`, "Content-Type": "application/sdp" },
    })
    if (!sdpRes.ok) throw new Error("Connexion au service vocal impossible.")
    await pc.setRemoteDescription({ type: "answer", sdp: await sdpRes.text() })

    voiceBridge.onActionResult = (a: PendingAction) => {
      systemNote(
        a.status === "EXECUTED"
          ? `<evenement_application>Le client a confirmé en touchant le bouton. Résultat vérifié par le serveur : ${a.result?.message}</evenement_application> Annonce-le en une phrase.`
          : "<evenement_application>Le client a annulé l'action. Rien n'a été modifié.</evenement_application> Accuse réception en une phrase.",
      )
    }
    voiceBridge.onHandoffResult = (status: string) => {
      systemNote(
        status === "SUBMITTED_DEMO"
          ? "<evenement_application>Le client a confirmé le partage du résumé. Demande de démonstration enregistrée, aucun conseiller réel ne la reçoit.</evenement_application> Dis-le honnêtement en une phrase."
          : "<evenement_application>Le client a annulé la demande conseiller.</evenement_application> Accuse réception.",
      )
    }
  } catch (e) {
    const message =
      e instanceof MicDeniedError
        ? "Accès au micro refusé. Autorisez le micro dans votre navigateur, ou continuez par écrit : toutes les démarches sont disponibles."
        : e instanceof Error
          ? `${e.message} Vous pouvez continuer par écrit.`
          : "La voix est indisponible. Vous pouvez continuer par écrit."
    stopVoice(message)
  }
}

export function stopVoice(error: string | null = null) {
  cancelAnimationFrame(rafId)
  dc?.close()
  pc?.getSenders().forEach((s) => s.track?.stop())
  pc?.close()
  mic?.getTracks().forEach((t) => t.stop())
  void audioCtx?.close().catch(() => null)
  if (audioEl) audioEl.srcObject = null
  pc = null
  dc = null
  mic = null
  audioCtx = null
  audioEl = null
  levels.input = 0
  levels.output = 0
  voiceBridge.onActionResult = undefined
  voiceBridge.onHandoffResult = undefined
  useCompass.setState((s) => ({ messages: s.messages.map((m) => (m.status === "streaming" && m.via === "voice" ? { ...m, status: "done" } : m)) }))
  useVoice.setState({ status: error ? "error" : "idle", error, muted: false, startedAt: null })
}

export function setMuted(muted: boolean) {
  mic?.getAudioTracks().forEach((t) => (t.enabled = !muted))
  useVoice.setState({ muted })
}

export function notifyVoice(text: string) {
  if (pc) systemNote(text)
}

export const voiceActive = () => !!pc
