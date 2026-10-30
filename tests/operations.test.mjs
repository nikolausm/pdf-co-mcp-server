import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function connect(t, apiKey = 'synthetic-test-key') {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pdfco-protocol-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const log = path.join(root, 'requests.jsonl');
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', './tests/mock-pdfco.mjs', 'dist/index.js'],
    env: { PATH: process.env.PATH, PDFCO_API_KEY: apiKey, PDFCO_TEST_LOG: log },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'operations-test', version: '1.0.0' });
  t.after(() => client.close());
  await client.connect(transport);
  const calls = async () => {
    try { return (await readFile(log, 'utf8')).trim().split('\n').map(JSON.parse); }
    catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  };
  return { client, calls };
}

test('all six tools dispatch authenticated requests and format responses offline', async (t) => {
  const { client, calls } = await connect(t);
  const call = async (name, args = {}) => {
    const result = await client.callTool({ name, arguments: args });
    assert.ok(!result.isError);
    return result.content[0].text;
  };
  const url = 'https://fixture.invalid/input.pdf';
  assert.match(await call('pdf_merge', { urls: [url, url] }), /Output URL: https:\/\/fixture.invalid\/output.pdf/);
  assert.match(await call('pdf_split', { url, pages: '1,3' }), /one.pdf\nhttps:\/\/fixture.invalid\/two.pdf/);
  await call('pdf_split', { url });
  assert.equal(await call('pdf_to_text', { url }), 'Extracted fixture text');
  assert.deepEqual(JSON.parse(await call('pdf_to_json', { url })), { document: 'fixture' });
  await call('html_to_pdf', { html: '<p>Fixture</p>' });
  await call('html_to_pdf', { url });
  assert.equal(await call('get_credits_balance'), 'API Credits Balance:\nAvailable: 100\nUsed: 5');
  assert.deepEqual(await calls(), [
    { method: 'post', path: '/v1/pdf/merge', data: { url: `${url},${url}`, name: 'merged.pdf', async: false } },
    { method: 'post', path: '/v1/pdf/split', data: { url, pages: '1,3', async: false } },
    { method: 'post', path: '/v1/pdf/split', data: { url, pages: '', async: false } },
    { method: 'post', path: '/v1/pdf/convert/to/text', data: { url, inline: true, async: false } },
    { method: 'post', path: '/v1/pdf/convert/to/json', data: { url, inline: true, async: false } },
    { method: 'post', path: '/v1/pdf/convert/from/html', data: { name: 'output.pdf', html: '<p>Fixture</p>', async: false } },
    { method: 'post', path: '/v1/pdf/convert/from/html', data: { name: 'output.pdf', url, async: false } },
    { method: 'get', path: '/v1/account/balance' },
  ]);
});

test('invalid and unknown tool calls are rejected before any API request', async (t) => {
  const { client, calls } = await connect(t);
  for (const [name, args, message] of [
    ['pdf_merge', { urls: [] }, /non-empty array/],
    ['pdf_merge', { urls: [42] }, /array of strings/],
    ['pdf_split', { url: 'fixture', pages: 42 }, /pages must be a string/],
    ['pdf_to_text', {}, /url must be a non-empty string/],
    ['pdf_to_json', { url: 42 }, /url must be a non-empty string/],
    ['html_to_pdf', {}, /Either html or url/],
    ['html_to_pdf', { html: 42 }, /html must be a string/],
    ['unknown_tool', {}, /Unknown tool/],
  ]) {
    await assert.rejects(client.callTool({ name, arguments: args }), message);
  }
  assert.deepEqual(await calls(), []);
});

test('provider errors and missing credentials fail without exposing the synthetic key', async (t) => {
  const { client } = await connect(t);
  for (const [url, message] of [
    ['https://fixture.invalid/http-error', 'Synthetic authentication failure'],
    ['https://fixture.invalid/provider-error', 'Synthetic provider rejection'],
  ]) {
    await assert.rejects(client.callTool({ name: 'pdf_to_text', arguments: { url } }), error => {
      assert.ok(error.message.includes(message));
      assert.ok(!error.message.includes('synthetic-test-key'));
      return true;
    });
  }
  const missing = await connect(t, '');
  await assert.rejects(missing.client.callTool({ name: 'get_credits_balance', arguments: {} }), /PDFCO_API_KEY environment variable is not set/);
  assert.deepEqual(await missing.calls(), []);
});
