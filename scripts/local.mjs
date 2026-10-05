import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const build = spawn(npm, ['run', 'build'], { cwd, stdio: 'inherit' });
build.on('error', (error) => { console.error(error); process.exitCode = 1; });
build.on('exit', (code) => {
  if (code !== 0) { process.exitCode = code || 1; return; }
  const port = process.env.PORT || '3000';
  const server = spawn(process.execPath, ['dist/server.cjs'], {
    cwd,
    env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: port, FLASHMOTION_MCP: '1' },
    stdio: ['inherit', 'pipe', 'inherit'],
  });
  let opened = false;
  server.stdout.on('data', (data) => {
    process.stdout.write(data);
    if (opened || !data.toString().includes('FlashMotion Studio running')) return;
    opened = true;
    const url = `http://localhost:${port}/?mcp=1`;
    console.log(`Abra ${url} no Chrome/Edge e escolha Instalar. Mantenha este terminal aberto.`);
    if (process.argv.includes('--no-open')) return;
    const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer.exe' : 'xdg-open';
    const browser = spawn(command, [url], { stdio: 'ignore' });
    browser.on('error', () => console.log(`Abra manualmente: ${url}`));
  });
  server.on('error', (error) => { console.error(error); process.exitCode = 1; });
  server.on('exit', (code) => { process.exitCode = code || 0; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));
});
