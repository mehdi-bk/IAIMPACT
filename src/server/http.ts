import "server-only"
import { z } from "zod"
import { PolicyError } from "./bank"

const STATUS: Record<string, number> = {
  AUTH_REQUIRED: 401,
  NOT_FOUND: 404,
  INVALID: 400,
  CONFLICT: 409,
  EXPIRED: 410,
  STEP_UP_REQUIRED: 403,
  INSUFFICIENT_FUNDS: 422,
}

/** Wraps a route handler: PolicyError -> safe JSON error, anything else -> generic 500. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args)
    } catch (e) {
      if (e instanceof PolicyError) return Response.json({ error: { code: e.code, message: e.message } }, { status: STATUS[e.code] ?? 400 })
      if (e instanceof z.ZodError) return Response.json({ error: { code: "INVALID", message: "Requête invalide." } }, { status: 400 })
      console.error("[api]", e instanceof Error ? e.message : e)
      return Response.json({ error: { code: "INTERNAL", message: "Service momentanément indisponible. Aucune action n'a été effectuée." } }, { status: 500 })
    }
  }
}

export async function body<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  let json: unknown
  try {
    json = await req.json()
  } catch {
    throw new PolicyError("INVALID", "Corps de requête invalide.")
  }
  return schema.parse(json)
}
