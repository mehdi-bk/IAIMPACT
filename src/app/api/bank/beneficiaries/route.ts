import { getPrincipal } from "@/server/auth"
import { listBeneficiaries } from "@/server/bank"
import { handle } from "@/server/http"

export const GET = handle(async () => Response.json({ beneficiaries: listBeneficiaries(await getPrincipal()) }))
