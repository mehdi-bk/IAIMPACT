import { Suspense } from "react"
import { TransfersScreen } from "@/components/screens/transfers"

export default function Page() {
  return (
    <Suspense>
      <TransfersScreen />
    </Suspense>
  )
}
