import { z } from "zod"
import { getPreferences, getPrincipal, savePreferences } from "@/server/auth"
import { body, handle } from "@/server/http"

const Prefs = z.object({
  textScale: z.union([z.literal(1), z.literal(1.15), z.literal(1.3)]).optional(),
  highContrast: z.boolean().optional(),
  simplified: z.boolean().optional(),
  reducedMotion: z.boolean().optional(),
  voice: z.enum(["marin", "cedar"]).optional(),
  notifications: z.object({ operations: z.boolean(), security: z.boolean(), advice: z.boolean() }).optional(),
})

export const PUT = handle(async (req: Request) => {
  const p = await getPrincipal()
  const update = await body(req, Prefs)
  const next = { ...getPreferences(p), ...update }
  savePreferences(p, next)
  return Response.json(next)
})
