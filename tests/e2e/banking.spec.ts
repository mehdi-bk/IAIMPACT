import { expect, test } from "@playwright/test"
import { money, resetAndLogin } from "./helpers"

test.describe("authentication-aware application", () => {
  test("visitor sees public mode and private screens are locked", async ({ page }) => {
    await resetAndLogin(page, null)
    await page.goto("/")
    await expect(page.getByText("Mode visiteur")).toBeVisible()
    await page.goto("/comptes")
    await expect(page.getByRole("heading", { name: "Connexion requise" })).toBeVisible()
    const r = await page.request.get("/api/bank/accounts")
    expect(r.status()).toBe(401)
  })

  test("demo login selector (no credential field) unlocks the customer space", async ({ page }) => {
    await resetAndLogin(page, null)
    await page.goto("/connexion")
    await expect(page.locator("input[type=password]")).toHaveCount(0)
    await page.getByRole("button", { name: /Camille Martin/ }).click()
    await expect(page.getByText("Bonjour Camille")).toBeVisible()
    await expect(page.getByText(money("1 245,80 €")).first()).toBeVisible()
    await expect(page.getByText(money("8 650,00 €")).first()).toBeVisible()
  })

  test("customer A cannot reach customer B's resources through the API", async ({ page }) => {
    await resetAndLogin(page, "camille")
    expect((await page.request.get("/api/bank/transactions?id=tx_luc_89")).status()).toBe(404)
    const prep = await page.request.post("/api/actions", { data: { op: "prepare", type: "CARD_FREEZE", targetId: "card_luc_mc" } })
    expect(prep.status()).toBe(404)
  })
})

test.describe("cards", () => {
  test("freeze requires confirmation, persists, and is reflected everywhere", async ({ page }) => {
    await resetAndLogin(page, "camille")
    await page.goto("/cartes")
    await page.getByRole("button", { name: /Verrouiller temporairement/ }).click()
    const dialog = page.getByRole("dialog", { name: /Verrouiller temporairement la carte/ })
    await expect(dialog).toBeVisible()
    // Not confirmed yet: backend state unchanged.
    expect((await (await page.request.get("/api/bank/cards")).json()).cards[0].status).toBe("ACTIVE")
    await dialog.getByRole("button", { name: "Confirmer" }).click()
    await expect(page.getByText("Carte temporairement verrouillée").first()).toBeVisible()
    await page.reload()
    await expect(page.getByRole("button", { name: /Déverrouiller la carte/ })).toBeVisible()
    await page.goto("/")
    await expect(page.getByText("Temporairement verrouillée")).toBeVisible()
  })

  test("cancelling leaves the card active", async ({ page }) => {
    await resetAndLogin(page, "camille")
    await page.goto("/cartes")
    await page.getByRole("button", { name: /Verrouiller temporairement/ }).click()
    await page.getByRole("dialog").getByRole("button", { name: "Annuler" }).click()
    await expect(page.getByText("Demande annulée")).toBeVisible()
    expect((await (await page.request.get("/api/bank/cards")).json()).cards[0].status).toBe("ACTIVE")
  })
})

test.describe("transfers (simulated)", () => {
  test("review -> confirm -> simulated step-up -> balance updated", async ({ page }) => {
    await resetAndLogin(page, "camille")
    await page.goto("/virements")
    await page.getByText("Sophie Martin").click()
    await page.getByPlaceholder("0,00").fill("50")
    await page.getByRole("button", { name: "Vérifier le virement" }).click()
    await expect(page.getByRole("heading", { name: "Vérifiez votre virement" })).toBeVisible()
    await page.getByRole("button", { name: "Confirmer le virement" }).click()
    await page.getByRole("button", { name: "Valider sur cet appareil" }).click()
    await expect(page.getByText(/Virement simulé de 50,00/)).toBeVisible({ timeout: 10_000 })
    await page.goto("/comptes")
    await expect(page.getByText(money("1 195,80 €")).first()).toBeVisible()
  })

  test("insufficient funds are refused with a clear message", async ({ page }) => {
    await resetAndLogin(page, "camille")
    await page.goto("/virements")
    await page.getByText("Thomas Durand").click()
    await page.getByPlaceholder("0,00").fill("5000")
    await page.getByRole("button", { name: "Vérifier le virement" }).click()
    await expect(page.getByRole("alert").filter({ hasText: "Solde insuffisant" })).toBeVisible()
  })
})

test.describe("operations", () => {
  test("search, filter and open details", async ({ page }) => {
    await resetAndLogin(page, "camille")
    await page.goto("/operations")
    await page.getByPlaceholder(/Rechercher/).fill("netflix")
    await expect(page.getByRole("button", { name: /^Netflix/ }).first()).toBeVisible()
    await page.getByPlaceholder(/Rechercher/).fill("")
    await page.goto("/operations?tx=tx_cam_inconnu")
    const d = page.getByRole("dialog", { name: "Détail de l'opération" })
    await expect(d).toContainText("CB PAIEMENT EN LIGNE REF 4471-XK")
    await expect(d).toContainText(money("-89,00 €"))
  })
})

test.describe("accessibility", () => {
  test("text size and contrast preferences apply to the document", async ({ page }) => {
    await resetAndLogin(page, "camille")
    await page.goto("/profil")
    await page.getByRole("radio", { name: /130/ }).click()
    await expect.poll(() => page.evaluate(() => document.documentElement.style.fontSize)).toBe("20.8px")
    await page.getByRole("switch", { name: "Contraste élevé" }).click()
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.contrast)).toBe("high")
  })

  test("keyboard: skip link and bottom navigation are reachable", async ({ page }) => {
    await resetAndLogin(page, "camille")
    await page.goto("/")
    await page.keyboard.press("Tab")
    await expect(page.getByRole("link", { name: "Aller au contenu" })).toBeFocused()
    await page.getByRole("link", { name: "Cartes", exact: true }).focus()
    await page.keyboard.press("Enter")
    await expect(page).toHaveURL(/\/cartes/)
  })

  test("microphone denied: helpful text fallback", async ({ page }) => {
    await resetAndLogin(page, "camille")
    await page.goto("/")
    await page.evaluate(() => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("denied", "NotAllowedError"))
    })
    await page.getByRole("button", { name: /Parler à Compass/ }).click()
    await expect(page.getByRole("alert").filter({ hasText: "Accès au micro refusé" })).toBeVisible()
    await page.getByRole("button", { name: "Continuer par écrit" }).click()
    await expect(page.getByLabel("Votre message à Compass")).toBeVisible()
  })
})

test.describe("demo panel protection", () => {
  test("demo routes refuse non-local hosts", async ({ page }) => {
    const r = await page.request.post("/api/demo", { data: { op: "reset_all" }, headers: { Host: "bank.example.com" } })
    expect(r.status()).toBe(403)
    const r2 = await page.request.get("/api/demo", { headers: { "X-Forwarded-For": "203.0.113.9" } })
    expect(r2.status()).toBe(403)
  })
})
