"use client"
import { useState } from "react"
import { motion } from "motion/react"
import { CircleCheckIcon, FingerprintIcon } from "lucide-react"
import { useCompass } from "@/lib/store"
import { Sheet } from "./sheet"

/**
 * SIMULATED strong customer authentication (step-up). No biometric or code is
 * captured: the user explicitly approves on this device. Clearly labelled.
 */
export function StepUpDialog() {
  const stepUp = useCompass((s) => s.stepUp)
  return <StepUpBody key={stepUp?.actionId ?? "none"} />
}

function StepUpBody() {
  const stepUp = useCompass((s) => s.stepUp)
  const [phase, setPhase] = useState<"ask" | "checking" | "ok">("ask")

  const finish = (ok: boolean) => {
    stepUp?.resolve(ok)
    useCompass.setState({ stepUp: null })
  }

  const approve = () => {
    setPhase("checking")
    setTimeout(() => setPhase("ok"), 900)
    setTimeout(() => finish(true), 1500)
  }

  return (
    <Sheet open={!!stepUp} onClose={() => finish(false)} title="Validation renforcée" description="Simulation — aucun code ni donnée biométrique n'est collecté." z="z-[80]">
      <div className="flex flex-col items-center gap-4 pb-2 text-center">
        <motion.div
          animate={phase === "checking" ? { scale: [1, 1.08, 1] } : { scale: 1 }}
          transition={{ repeat: phase === "checking" ? Infinity : 0, duration: 0.9 }}
          className={`flex size-24 items-center justify-center rounded-full ${phase === "ok" ? "bg-ok-soft text-ok" : "bg-brand-soft text-brand"}`}
        >
          {phase === "ok" ? <CircleCheckIcon className="size-12" /> : <FingerprintIcon className="size-12" />}
        </motion.div>
        <p className="text-base font-bold text-navy">{stepUp?.title}</p>
        <p className="text-sm text-muted-ink" aria-live="polite">
          {phase === "ask" && "Confirmez qu'il s'agit bien de vous sur cet appareil."}
          {phase === "checking" && "Vérification en cours…"}
          {phase === "ok" && "Identité confirmée (simulation)."}
        </p>
        <button
          type="button"
          data-autofocus
          disabled={phase !== "ask"}
          onClick={approve}
          className="mt-2 h-12 w-full rounded-2xl bg-navy text-base font-bold text-white transition hover:bg-navy-2 disabled:opacity-60"
        >
          Valider sur cet appareil
        </button>
        <button type="button" disabled={phase !== "ask"} onClick={() => finish(false)} className="h-11 w-full rounded-2xl text-sm font-bold text-navy hover:bg-surface">
          Annuler
        </button>
      </div>
    </Sheet>
  )
}
