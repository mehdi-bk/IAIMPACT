import { Suspense } from "react"
import { LoginScreen } from "@/components/screens/login"

export default function Page() {
  return (
    <Suspense>
      <LoginScreen />
    </Suspense>
  )
}
