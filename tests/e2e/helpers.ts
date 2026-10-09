import { expect, type Page } from "@playwright/test"

export async function resetAndLogin(page: Page, profile: "camille" | "lucas" | null) {
  await page.request.post("/api/demo", { data: { op: "reset_all" } })
  if (profile) await page.request.post("/api/session", { data: { profile } })
  else await page.request.delete("/api/session")
}

export const nbsp = (s: string) => s.replace(/ /g, "[\\s\\u202f\\u00a0]")
export const money = (s: string) => new RegExp(nbsp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))

export async function aiConfigured(page: Page) {
  const h = await (await page.request.get("/api/health")).json()
  return !!h.textProvider
}

export async function openCompass(page: Page) {
  await page.getByRole("button", { name: /Ouvrir Compass/ }).click()
  await expect(page.getByRole("dialog", { name: /Compass/ })).toBeVisible()
}

export async function ask(page: Page, text: string) {
  await page.getByLabel("Votre message à Compass").fill(text)
  await page.getByRole("button", { name: "Envoyer" }).click()
}

/** Waits until the assistant finished streaming (send button no longer busy). */
export async function waitAnswer(page: Page, timeout = 60_000) {
  await expect(page.getByLabel("Compass réfléchit")).toHaveCount(0, { timeout })
  await expect(page.locator("#compass-input")).toBeEnabled()
  await page.waitForFunction(() => !document.querySelector('[aria-label="Envoyer"] .animate-spin'), null, { timeout })
}
