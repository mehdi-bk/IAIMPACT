import { z } from "zod"
import { demoLogin, getPrincipal, logout, sessionInfo } from "@/server/auth"
import { PolicyError } from "@/server/bank"
import { body, handle } from "@/server/http"

export const GET = handle(async () => Response.json(sessionInfo(await getPrincipal())))

// Demo login: selects a fictional profile. No credential is ever accepted.
export const POST = handle(async (req: Request) => {
  const { profile } = await body(req, z.object({ profile: z.string().max(30) }))
  const ok = await demoLogin(profile)
  if (!ok) throw new PolicyError("NOT_FOUND", "Profil de démonstration inconnu.")
  return Response.json(sessionInfo(await getPrincipal()))
})

export const DELETE = handle(async () => {
  await logout()
  return Response.json(sessionInfo(await getPrincipal()))
})
