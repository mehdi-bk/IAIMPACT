import { Suspense } from "react"
import { AdviserScreen } from "@/components/screens/adviser"

export default function Page() {
  return (
    <Suspense>
      <AdviserScreen />
    </Suspense>
  )
}
