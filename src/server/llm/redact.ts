// Detects authentication secrets typed into the chat and masks them BEFORE the
// text is stored or sent to any model provider.

export type Redaction = "numéro de carte" | "code secret" | "mot de passe" | "cryptogramme" | "code de validation"

const RULES: { kind: Redaction; re: RegExp; replace: string }[] = [
  // 13–19 digits possibly separated by spaces or dashes (card numbers)
  { kind: "numéro de carte", re: /\b(?:\d[ -]?){12,18}\d\b/g, replace: "[numéro de carte masqué]" },
  { kind: "cryptogramme", re: /\b(cvv|cvc|cryptogramme)(\s*(visuel)?\s*(est|:|=)?\s*)\d{3,4}\b/gi, replace: "$1$2[masqué]" },
  { kind: "code de validation", re: /\b(code\s+(?:re[çc]u|sms|de\s+validation|otp|unique|sécur'?pass)[^\d]{0,20})\d{4,8}\b/gi, replace: "$1[masqué]" },
  { kind: "code secret", re: /\b((?:code(?:\s+(?:secret|pin|confidentiel|carte|d'accès))?|pin)(?:\s+(?:est|c'est|:|=))?\s*:?\s*)\d{4,8}\b/gi, replace: "$1[masqué]" },
  { kind: "mot de passe", re: /\b((?:mot\s+de\s+passe|mdp|password)(?:\s+(?:est|c'est|:|=))?\s*:?\s*)\S{4,}/gi, replace: "$1[masqué]" },
]

export function redactSecrets(input: string): { text: string; redactions: Redaction[] } {
  let text = input
  const found = new Set<Redaction>()
  for (const r of RULES) {
    const next = text.replace(r.re, r.replace)
    if (next !== text) found.add(r.kind)
    text = next
  }
  return { text, redactions: [...found] }
}
