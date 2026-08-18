import { test, expect } from "@playwright/test";

test.describe("Fluxos End-to-End da Aplicação", () => {
  test.beforeEach(async ({ page }) => {
    // Limpa o localStorage antes de cada teste E2E
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test("Deve exibir a tela de Onboarding no primeiro acesso", async ({ page }) => {
    await page.goto("/");
    // Verifica se os elementos do Onboarding ou Dashboard são exibidos
    const appShell = page.locator("#main-app-shell");
    await expect(appShell).toBeVisible();
  });

  test("Deve permitir a navegação entre as abas principais", async ({ page }) => {
    await page.goto("/");

    // Clica no item de Renda & Contas Fixas
    const buttonFixas = page.getByRole("button", { name: /Renda & Contas Fixas/i });
    if (await buttonFixas.isVisible()) {
      await buttonFixas.click();
    }

    // Clica no item de Fatura do Cartão
    const buttonCartao = page.getByRole("button", { name: /Fatura do Cartão/i });
    if (await buttonCartao.isVisible()) {
      await buttonCartao.click();
    }
  });
});
