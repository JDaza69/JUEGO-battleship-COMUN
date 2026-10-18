import assert from 'node:assert/strict';
import path from 'node:path';
import { _electron } from '@playwright/test';

if (process.platform !== 'win32') throw new Error('Esta prueba ejecuta la aplicación empaquetada en Windows.');
const app = await _electron.launch({ executablePath: path.resolve('release/win-unpacked/Flota Tactica.exe') });
try {
  const page = await app.firstWindow();
  await page.getByRole('heading', { name: /Domina el mar/ }).waitFor();
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  await page.getByRole('button', { name: 'Preparar flota' }).click();
  await page.getByRole('button', { name: 'Despliegue automático' }).click();
  await page.getByRole('button', { name: 'Iniciar combate' }).click();
  await page.getByRole('heading', { name: 'Jugador 1, al mando.' }).waitFor();
  await page.locator('[data-action="recon"]').click();
  const canvas = page.locator('#target-board');
  const rect = await canvas.boundingBox();
  assert.ok(rect);
  await canvas.click({ position: { x: rect.width * .2, y: rect.height * .2 } });
  await page.getByRole('heading', { name: 'Zona reconocida.' }).waitFor();
  await page.getByRole('button', { name: 'Finalizar turno' }).click();
  await page.getByRole('heading', { name: 'Jugador 1, al mando.' }).waitFor();
  console.log('Windows empaquetado: menú, despliegue, combate, habilidad y turno de IA verificados.');
} finally {
  await app.close();
}
