import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const serverEntry = fileURLToPath(new URL('../dist/index.js', import.meta.url));

test('lists all tools over stdio without making API calls', async (t) => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverEntry],
    env: {
      ...process.env,
      PDFCO_API_KEY: 'test-key',
    },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'protocol-test', version: '1.0.0' });

  t.after(async () => {
    await client.close();
  });

  await client.connect(transport);
  const response = await client.listTools();

  assert.deepEqual(
    response.tools.map((tool) => tool.name).sort(),
    [
      'get_credits_balance',
      'html_to_pdf',
      'pdf_merge',
      'pdf_split',
      'pdf_to_json',
      'pdf_to_text',
    ],
  );

  await assert.rejects(
    client.callTool({ name: 'pdf_merge', arguments: { urls: [42] } }),
    /urls must be a non-empty array of strings/,
  );
});
