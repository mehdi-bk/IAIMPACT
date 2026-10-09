import { Suspense } from "react"
import { CardsScreen } from "@/components/screens/cards"

export default function Page() {
  return (
    <Suspense>
      <CardsScreen />
    </Suspense>
  )
}
