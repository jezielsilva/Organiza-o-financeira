import { expect, test } from "@playwright/test";

test.describe("Fluxos principais", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test("onboarding cadastra renda e conta e mostra quanto sobra", async ({ page }) => {
    await page.getByRole("button", { name: "Começar" }).click();
    await page.getByLabel("Nome").fill("Salário");
    await page.getByLabel("Valor por mês").fill("500000");
    await page.getByRole("button", { name: "Próximo" }).click();
    await page.getByLabel("Nome").fill("Aluguel");
    await page.getByLabel("Valor por mês").fill("150000");
    await page.getByRole("button", { name: "Concluir" }).click();

    await expect(page.getByText("R$ 3.500,00").first()).toBeVisible();
  });

  test("navegação pelas rotas e botão voltar", async ({ page }) => {
    await page.getByRole("button", { name: "Começar" }).click();
    await page.getByRole("button", { name: "Próximo" }).click();
    await page.getByRole("button", { name: "Concluir" }).click();

    const nav = page.getByRole("navigation", { name: "Principal" }).first();
    await nav.getByRole("link", { name: "Fatura" }).click();
    await expect(page).toHaveURL(/#\/fatura/);
    await nav.getByRole("link", { name: "Contas" }).click();
    await expect(page).toHaveURL(/#\/contas/);
    await page.goBack();
    await expect(page).toHaveURL(/#\/fatura/);
  });
});
