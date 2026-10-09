import { describe, expect, it } from "vitest"
import { KNOWLEDGE, searchKnowledge } from "@/server/knowledge/kb"
import { redactSecrets } from "@/server/llm/redact"

describe("knowledge retrieval", () => {
  it.each([
    ["j'ai perdu ma carte, comment faire opposition", "ce-opposition"],
    ["comment augmenter le plafond de ma carte", "ce-plafonds"],
    ["je veux contester un paiement que je ne reconnais pas", "inc-contestation"],
    ["mot de passe oublié", "ce-acces-compte"],
    ["délai d'un virement instantané", "ce-virements"],
  ])("%s -> %s", (q, id) => {
    expect(searchKnowledge(q)[0]?.doc.id).toBe(id)
  })

  it("returns nothing for unrelated questions (no fabricated source)", () => {
    expect(searchKnowledge("recette de la tarte tatin")).toHaveLength(0)
  })

  it("every verified source has an https URL; unverified ones have none", () => {
    for (const d of KNOWLEDGE) {
      if (d.verified) expect(d.url).toMatch(/^https:\/\//)
      else expect(d.url).toBeNull()
    }
  })
})

describe("secret redaction", () => {
  it.each([
    ["Mon code secret est 1234", "code secret"],
    ["le code reçu par SMS : 845210", "code de validation"],
    ["mot de passe: Soleil2024!", "mot de passe"],
    ["CVV 123", "cryptogramme"],
    ["ma carte 4970 1234 5678 9012", "numéro de carte"],
  ])("%s", (input, kind) => {
    const r = redactSecrets(input)
    expect(r.redactions).toContain(kind)
    expect(r.text).not.toMatch(/\d{3,}/)
  })

  it("leaves ordinary amounts alone", () => {
    expect(redactSecrets("Je vois un paiement de 89 euros le 8 octobre").redactions).toHaveLength(0)
  })
})
