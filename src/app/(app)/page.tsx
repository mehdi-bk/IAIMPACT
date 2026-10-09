import { Suspense } from "react"
import { HomeScreen } from "@/components/screens/home"

export default function Page() {
  return (
    <Suspense>
      <HomeScreen />
    </Suspense>
  )
}
