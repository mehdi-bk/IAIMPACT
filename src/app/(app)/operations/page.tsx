import { Suspense } from "react"
import { OperationsScreen } from "@/components/screens/operations"

export default function Page() {
  return (
    <Suspense>
      <OperationsScreen />
    </Suspense>
  )
}
