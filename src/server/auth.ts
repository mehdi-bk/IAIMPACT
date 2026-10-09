import "server-only"
import { cookies } from "next/headers"
import { createHash, randomBytes } from "node:crypto"
import { db, nowIso } from "./db"
import { DEFAULT_PREFERENCES } from "./seed"
import type { Preferences, SessionInfo } from "@/lib/types"

// Simulated customer sessions. Identity ALWAYS comes from this server-side
// session (opaque httpOnly cookie -> hashed lookup), never from the client or
// from the LLM. The "login" is a clearly labelled demo profile selector: no
// password, PIN or real credential is ever collected.

export const SESSION_COOKIE = "compass_sid"
const SESSION_TTL_MS = 8 * 60 * 60 * 1000

export interface Principal {
  sessionHash: string
  customerId: string | null
  channel: "text" | "voice" | "ui"
}

const hash = (token: string) => createHash("sha256").update(token).digest("hex")

export function createSessionToken(customerId: string | null = null): string {
  const token = randomBytes(32).toString("base64url")
  const now = Date.now()
  db()
    .prepare("INSERT INTO sessions (id_hash, customer_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(hash(token), customerId, new Date(now).toISOString(), new Date(now + SESSION_TTL_MS).toISOString())
  return token
}

/** Returns the session for a raw token, or null if unknown/expired. */
export function lookupSession(token: string | undefined | null): { sessionHash: string; customerId: string | null } | null {
  if (!token || token.length < 20 || token.length > 100) return null
  const row = db()
    .prepare("SELECT id_hash, customer_id, expires_at FROM sessions WHERE id_hash = ?")
    .get(hash(token)) as { id_hash: string; customer_id: string | null; expires_at: string } | undefined
  if (!row) return null
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db().prepare("DELETE FROM sessions WHERE id_hash = ?").run(row.id_hash)
    return null
  }
  return { sessionHash: row.id_hash, customerId: row.customer_id }
}

async function setCookie(token: string) {
  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.COMPASS_INSECURE_COOKIES !== "true",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  })
}

/** Current principal for a Route Handler. Creates a visitor session if needed. */
export async function getPrincipal(channel: Principal["channel"] = "ui"): Promise<Principal> {
  const jar = await cookies()
  const existing = lookupSession(jar.get(SESSION_COOKIE)?.value)
  if (existing) return { ...existing, channel }
  const token = createSessionToken(null)
  await setCookie(token)
  return { sessionHash: hash(token), customerId: null, channel }
}

/**
 * Demo login: only profiles present in the database can be selected.
 * The session token is rotated on every privilege change (anti-fixation).
 */
export async function demoLogin(profile: string): Promise<boolean> {
  const row = db().prepare("SELECT id FROM customers WHERE demo_profile = ?").get(profile) as { id: string } | undefined
  if (!row) return false
  const jar = await cookies()
  const old = lookupSession(jar.get(SESSION_COOKIE)?.value)
  const token = createSessionToken(row.id)
  if (old) {
    // A visitor conversation holds no private data: keep it so the customer can
    // simply repeat their question after logging in. Never carried the other way.
    if (!old.customerId) {
      db().prepare("UPDATE conversations SET session_hash = ?, customer_id = ? WHERE session_hash = ?").run(hash(token), row.id, old.sessionHash)
    } else {
      db().prepare("DELETE FROM conversations WHERE session_hash = ?").run(old.sessionHash)
    }
    db().prepare("DELETE FROM sessions WHERE id_hash = ?").run(old.sessionHash)
  }
  await setCookie(token)
  return true
}

export async function logout(): Promise<void> {
  const jar = await cookies()
  const old = lookupSession(jar.get(SESSION_COOKIE)?.value)
  if (old) {
    db().prepare("DELETE FROM conversations WHERE session_hash = ?").run(old.sessionHash)
    db().prepare("UPDATE pending_actions SET status = 'CANCELLED' WHERE session_hash = ? AND status = 'PENDING'").run(old.sessionHash)
    db().prepare("DELETE FROM sessions WHERE id_hash = ?").run(old.sessionHash)
  }
  await setCookie(createSessionToken(null))
}

export function getPreferences(p: Principal): Preferences {
  if (p.customerId) {
    const row = db().prepare("SELECT preferences FROM customers WHERE id = ?").get(p.customerId) as { preferences: string } | undefined
    if (row) return { ...DEFAULT_PREFERENCES, ...JSON.parse(row.preferences) }
  }
  const row = db().prepare("SELECT visitor_prefs FROM sessions WHERE id_hash = ?").get(p.sessionHash) as { visitor_prefs: string | null } | undefined
  return row?.visitor_prefs ? { ...DEFAULT_PREFERENCES, ...JSON.parse(row.visitor_prefs) } : DEFAULT_PREFERENCES
}

export function savePreferences(p: Principal, prefs: Preferences) {
  const json = JSON.stringify(prefs)
  if (p.customerId) db().prepare("UPDATE customers SET preferences = ? WHERE id = ?").run(json, p.customerId)
  else db().prepare("UPDATE sessions SET visitor_prefs = ? WHERE id_hash = ?").run(json, p.sessionHash)
}

export function sessionInfo(p: Principal): SessionInfo {
  const profiles = db()
    .prepare("SELECT demo_profile AS id, display_name AS displayName, demo_description AS description FROM customers ORDER BY id")
    .all() as unknown as SessionInfo["demoProfiles"]
  let customer: SessionInfo["customer"] = null
  if (p.customerId) {
    const row = db().prepare("SELECT id, display_name, first_name FROM customers WHERE id = ?").get(p.customerId) as
      | { id: string; display_name: string; first_name: string }
      | undefined
    if (row) {
      const initials = row.display_name.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase()
      customer = { id: row.id, displayName: row.display_name, firstName: row.first_name, initials }
    }
  }
  return { authenticated: !!customer, customer, preferences: getPreferences(p), demoProfiles: profiles }
}

export function audit(p: Pick<Principal, "sessionHash" | "channel"> | null, kind: string, name: string, decision: string, detail: string) {
  db()
    .prepare("INSERT INTO audit_log (at, session_hash, channel, kind, name, decision, detail) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(nowIso(), p?.sessionHash ?? null, p?.channel ?? "ui", kind, name, decision, detail.slice(0, 400))
}
