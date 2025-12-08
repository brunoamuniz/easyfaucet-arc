import { test, expect } from '@playwright/test';

test.describe('Easy Faucet Arc - Testes Básicos', () => {
  test.beforeEach(async ({ page }) => {
    // Navegar para a aplicação
    await page.goto('http://127.0.0.1:8000');
  });

  test('deve carregar a página principal', async ({ page }) => {
    // Verificar se o título está presente
    await expect(page).toHaveTitle(/Easy Faucet Arc/i);
  });

  test('deve exibir o botão de Claim', async ({ page }) => {
    // Procurar pelo botão "Claim 100 USDC (testnet)"
    const claimButton = page.getByRole('button', { name: /claim/i });
    await expect(claimButton).toBeVisible();
  });

  test('deve exibir o botão de Share', async ({ page }) => {
    // Procurar pelo botão "Share"
    const shareButton = page.getByRole('button', { name: /share/i });
    await expect(shareButton).toBeVisible();
  });

  test('deve exibir o campo de endereço de destino', async ({ page }) => {
    // Procurar pelo campo de input do endereço
    const addressInput = page.getByLabel(/destination address/i);
    await expect(addressInput).toBeVisible();
  });

  test('deve exibir o tutorial colapsável', async ({ page }) => {
    // Procurar pelo botão do tutorial
    const tutorialButton = page.getByRole('button', { name: /tutorial/i });
    await expect(tutorialButton).toBeVisible();
    
    // Clicar para expandir
    await tutorialButton.click();
    
    // Verificar se o conteúdo do tutorial aparece
    await expect(page.getByText(/sepolia/i)).toBeVisible({ timeout: 2000 });
  });

  test('deve exibir informações do faucet', async ({ page }) => {
    // Verificar se as informações do faucet estão visíveis
    await expect(page.getByText(/faucet information/i)).toBeVisible();
    await expect(page.getByText(/100 USDC/i)).toBeVisible();
  });
});




