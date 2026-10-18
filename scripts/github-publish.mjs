// Usa la autenticación existente de GitHub CLI; nunca lee ni guarda tokens.
import { execFileSync } from 'node:child_process';
const repo = 'JDaza69/JUEGO-battleship-COMUN';
const endpoint = `repos/${repo}/pages`;
const run = args => execFileSync('gh', args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
try {
  let exists = true;
  try { run(['api', endpoint]); }
  catch (error) {
    if (error.stderr?.toString().includes('404')) exists = false;
    else throw error;
  }
  run(['api', endpoint, '--method', exists ? 'PUT' : 'POST', '-f', 'build_type=workflow']);
  console.log('GitHub Pages configurado con GitHub Actions.');
} catch (error) {
  console.error(error.stderr?.toString() || 'No se pudo configurar Pages.');
  console.error(`Activa GitHub Actions en https://github.com/${repo}/settings/pages y vuelve a ejecutar Publicar web.`);
  process.exit(1);
}
