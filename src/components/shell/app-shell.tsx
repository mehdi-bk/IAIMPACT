"use client"
import { useEffect, useRef } from "react"
import { usePathname, useRouter } from "next/navigation"
import { MotionConfig } from "motion/react"
import { useSession } from "@/lib/api"
import { useCompass } from "@/lib/store"
import { BottomNav } from "./bottom-nav"
import { StatusBar } from "./status-bar"
import { Toaster } from "./toast"
import { StepUpDialog } from "./step-up-dialog"
import { CompassLayer } from "@/components/compass/compass-layer"
import { DemoPanel } from "@/components/demo/demo-panel"
import { BrandColumn } from "./brand-column"

/** Applies accessibility preferences (server-stored) to the whole document. */
function PreferencesApplier() {
  const { data } = useSession()
  const prefs = data?.preferences
  useEffect(() => {
    if (!prefs) return
    const root = document.documentElement
    root.style.fontSize = `${16 * prefs.textScale}px`
    root.dataset.contrast = prefs.highContrast ? "high" : "normal"
    const systemReduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    root.dataset.motion = prefs.reducedMotion || systemReduce ? "reduce" : "full"
  }, [prefs])
  return null
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const mainRef = useRef<HTMLElement>(null)
  const { data } = useSession()
  const reduce = data?.preferences.reducedMotion

  useEffect(() => {
    useCompass.setState({ navigate: (href: string) => router.push(href, { scroll: false }) })
  }, [router])

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [pathname])

  return (
    <MotionConfig reducedMotion={reduce ? "always" : "user"}>
      <PreferencesApplier />
      <div className="stage-bg flex min-h-[100dvh] items-stretch justify-center lg:items-center lg:gap-8 lg:px-6 lg:py-5">
        <BrandColumn />
        {/* Phone: full screen on mobile, framed device on desktop */}
        <div className="relative w-full lg:w-auto">
          <div className="relative mx-auto h-[100dvh] w-full overflow-hidden bg-white lg:h-[min(844px,calc(100dvh-40px))] lg:w-[390px] lg:rounded-[54px] lg:shadow-[0_0_0_11px_#0d1524,0_0_0_13px_#2a3446,0_40px_80px_-20px_rgba(20,35,59,0.45)]">
            <div id="app-viewport" className="relative flex h-full flex-col overflow-hidden bg-white">
              <a
                href="#main"
                className="sr-only z-[90] rounded-lg bg-navy px-3 py-2 text-white focus:not-sr-only focus:absolute focus:left-3 focus:top-3"
              >
                Aller au contenu
              </a>
              <StatusBar />
              <main id="main" ref={mainRef} tabIndex={-1} className="no-scrollbar relative flex-1 overflow-y-auto overscroll-contain bg-surface outline-none">
                {children}
              </main>
              <BottomNav />
              <CompassLayer />
              <StepUpDialog />
              <Toaster />
            </div>
          </div>
        </div>
        <DemoPanel />
      </div>
    </MotionConfig>
  )
}
