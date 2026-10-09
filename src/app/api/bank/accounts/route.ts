import { getPrincipal } from "@/server/auth"
import { listAccounts } from "@/server/bank"
import { handle } from "@/server/http"

export const GET = handle(async () => Response.json({ accounts: listAccounts(await getPrincipal()) }))
