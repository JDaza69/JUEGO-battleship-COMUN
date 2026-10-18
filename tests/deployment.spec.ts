import { test, expect } from '@playwright/test';

test('build de producción bajo /JUEGO-battleship-COMUN/: carga assets, despliega y ejecuta una habilidad', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto('http://127.0.0.1:4173/JUEGO-battleship-COMUN/');
  await expect(page.getByRole('heading', { name: /Domina el mar/ })).toBeVisible();
  await page.getByRole('button', { name: 'Preparar flota' }).click();
  await page.getByRole('button', { name: 'Despliegue automático' }).click();
  await page.getByRole('button', { name: 'Iniciar combate' }).click();
  await page.locator('[data-action="recon"]').click();
  const canvas = page.locator('#target-board');
  const rect = await canvas.boundingBox();
  expect(rect).not.toBeNull();
  await canvas.click({ position: { x: rect!.width * .2, y: rect!.height * .2 } });
  await expect(page.getByRole('heading', { name: 'Zona reconocida.' })).toBeVisible();
  await page.getByRole('button', { name: 'Finalizar turno' }).click();
  await expect(page.getByRole('heading', { name: 'Jugador 1, al mando.' })).toBeVisible();
  expect(errors).toEqual([]);
});
