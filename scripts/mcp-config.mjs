import { fileURLToPath } from 'node:url';
const entry = fileURLToPath(new URL('../dist/mcp.mjs', import.meta.url));
const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
console.log('Codex:');
console.log(`codex mcp add flashmotion -- ${quote(process.execPath)} ${quote(entry)}`);
console.log('\nClaude Code (execute na pasta deste projeto):');
console.log(`claude mcp add --scope local --transport stdio flashmotion -- ${quote(process.execPath)} ${quote(entry)}`);
console.log('\nClaude Desktop (adicione a mcpServers na configuração existente):');
console.log(JSON.stringify({ mcpServers: { flashmotion: { command: process.execPath, args: [entry] } } }, null, 2));
