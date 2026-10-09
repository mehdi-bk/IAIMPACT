import { Suspense } from "react"
import { ProfileScreen } from "@/components/screens/profile"

export default function Page() {
  return (
    <Suspense>
      <ProfileScreen />
    </Suspense>
  )
}
