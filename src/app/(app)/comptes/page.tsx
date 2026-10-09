import { Suspense } from "react"
import { AccountsScreen } from "@/components/screens/accounts"

export default function Page() {
  return (
    <Suspense>
      <AccountsScreen />
    </Suspense>
  )
}
