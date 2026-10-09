import "server-only"

// The demo control panel is a rehearsal tool, never a banking admin surface:
// disabled in production unless DEMO_MODE=true, and loopback-only unless
// DEMO_ALLOW_LAN=true. It does not trust (or need) the customer session.
export function demoAllowed(req: Request): boolean {
  const mode = process.env.DEMO_MODE
  const enabled = mode === "true" || (process.env.NODE_ENV !== "production" && mode !== "false")
  if (!enabled) return false
  if (process.env.DEMO_ALLOW_LAN === "true") return true
  const host = (req.headers.get("host") ?? "").toLowerCase()
  const hostname = host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0]
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(hostname)
  const fwd = req.headers.get("x-forwarded-for")
  const fwdLocal = !fwd || fwd.split(",").every((ip) => ["127.0.0.1", "::1", "localhost"].includes(ip.trim()))
  return local && fwdLocal
}
