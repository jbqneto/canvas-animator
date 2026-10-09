import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const client = new Client({ name: 'flashmotion-protocol-check', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL('../dist/mcp.mjs', import.meta.url))],
  stderr: 'inherit',
});
try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  const expected = ['list_windows', 'get_status', 'get_project', 'replace_content', 'seek', 'set_playing', 'render_frame',
    'load_project', 'export_video', 'set_camera', 'list_templates', 'apply_template', 'render_contact_sheet', 'lint_scene', 'describe_scene'];
  const names = tools.map((tool) => tool.name);
  if (JSON.stringify([...names].sort()) !== JSON.stringify([...expected].sort())) throw new Error('Unexpected MCP tools');
  console.log(`MCP stdio: handshake e ${tools.length} ferramentas verificados.`);
} finally { await client.close(); }
