import { test, expect, type Page, type Locator } from '@playwright/test';
async function cell(canvas: Locator, x: number, y: number, size = 10): Promise<void> {
  const rect = await canvas.boundingBox();
  if (!rect) throw new Error('Tablero no visible');
  await canvas.click({ position: { x: (25 + (x + .5) * 510 / size) * rect.width / 540, y: (25 + (y + .5) * 510 / size) * rect.height / 540 } });
}
async function deploy(page: Page): Promise<void> {
  for (let y = 0; y < 5; y++) await cell(page.locator('#placement-board'), 0, y);
  await expect(page.getByText('5 / 5 NAVES')).toBeVisible();
}
async function passAndPlay(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('#humans').selectOption('2');
  await page.getByRole('button', { name: 'Preparar flota' }).click();
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.getByRole('button', { name: 'Soy Jugador 1' }).click();
  await deploy(page);
  await page.getByRole('button', { name: 'Siguiente comandante' }).click();
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.getByRole('button', { name: 'Soy Jugador 2' }).click();
  await deploy(page);
  await page.getByRole('button', { name: 'Iniciar combate' }).click();
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.getByRole('button', { name: 'Soy Jugador 1' }).click();
}
test('menú responsive, cuatro mapas, modo mixto y despliegue automático sin errores JS', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/'); await expect(page.locator('[data-map]')).toHaveCount(4);
  await page.locator('[data-map="mines"]').click();
  await expect(page.locator('[data-map="mines"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#size').selectOption('20'); await page.locator('#players').selectOption('4'); await page.locator('#humans').selectOption('2');
  await page.locator('#difficulty').selectOption('hard');
  await expect(page.locator('#mode-hint')).toContainText('2 humanos y 2 IA');
  await page.getByRole('button', { name: 'Preparar flota' }).click();
  await page.getByRole('button', { name: 'Soy Jugador 1' }).click();
  await page.getByRole('button', { name: 'Despliegue automático' }).click();
  await expect(page.getByText('5 / 5 NAVES')).toBeVisible();
  await page.getByRole('button', { name: 'Limpiar colocación' }).click();
  await expect(page.getByText('0 / 5 NAVES')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
test('colocación manual, disparo, informe privado y relevo sin flotas en el DOM', async ({ page }) => {
  await passAndPlay(page);
  await cell(page.locator('#target-board'), 0, 0);
  await expect(page.getByRole('heading', { name: 'Maniobra completada.' })).toBeVisible();
  await expect(page.locator('.page-heading p')).toContainText('1 impacto');
  await expect(page.locator('[data-action]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Finalizar turno' }).click();
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.getByRole('button', { name: 'Soy Jugador 2' }).click();
  await expect(page.getByRole('heading', { name: 'Jugador 2, al mando.' })).toBeVisible();
  await page.getByText('Diario de operaciones').click();
  await expect(page.locator('.journal')).not.toContainText('A1');
  await expect(page.locator('.journal')).not.toContainText('impacto');
});
test('reconocimiento: informe inmediatamente visible y recarga del turno propio', async ({ page }) => {
  await passAndPlay(page);
  await page.locator('[data-action="recon"]').click(); await cell(page.locator('#target-board'), 1, 0);
  await expect(page.getByRole('heading', { name: 'Zona reconocida.' })).toBeVisible();
  await page.getByRole('button', { name: 'Finalizar turno' }).click();
  await page.getByRole('button', { name: 'Soy Jugador 2' }).click();
  await cell(page.locator('#target-board'), 9, 9); await page.getByRole('button', { name: 'Finalizar turno' }).click();
  await page.getByRole('button', { name: 'Soy Jugador 1' }).click();
  await expect(page.locator('[data-action="recon"]')).toBeDisabled();
  await expect(page.locator('[data-action="recon"]')).toContainText('Recarga: 3 turnos');
});
test('IA difícil devuelve el turno humano y permite elegir las direcciones del torpedo', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await page.locator('#difficulty').selectOption('hard');
  await page.getByRole('button', { name: 'Preparar flota' }).click(); await deploy(page);
  await page.getByRole('button', { name: 'Iniciar combate' }).click();
  await page.locator('[data-action="torpedo"]').click(); await page.keyboard.press('r');
  await expect(page.locator('#combat-help')).toContainText('el sur');
  await cell(page.locator('#target-board'), 9, 9); await page.getByRole('button', { name: 'Finalizar turno' }).click();
  await expect(page.getByRole('heading', { name: 'Jugador 1, al mando.' })).toBeVisible();
  await expect(page.locator('.eyebrow')).toContainText('TURNO PROPIO 2');
  expect(errors).toEqual([]);
});
test('partida Pass & Play completa: hunde las cinco naves y muestra la victoria', async ({ page }) => {
  test.setTimeout(60_000);
  await passAndPlay(page);
  const shots: { x: number; y: number }[] = [];
  [5, 4, 3, 3, 2].forEach((size, y) => { for (let x = 0; x < size; x++) shots.push({ x, y }); });
  for (let i = 0; i < shots.length; i++) {
    await cell(page.locator('#target-board'), shots[i].x, shots[i].y);
    if (i === shots.length - 1) break;
    await page.getByRole('button', { name: 'Finalizar turno' }).click();
    await page.getByRole('button', { name: 'Soy Jugador 2' }).click();
    await cell(page.locator('#target-board'), 9 - i % 5, 9 - Math.floor(i / 5));
    await page.getByRole('button', { name: 'Finalizar turno' }).click();
    await page.getByRole('button', { name: 'Soy Jugador 1' }).click();
  }
  await expect(page.getByRole('heading', { name: 'Jugador 1 controla estas aguas.' })).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.getByRole('button', { name: 'Preparar una nueva misión' }).click();
  await expect(page.getByRole('button', { name: 'Preparar flota' })).toBeVisible();
});
