import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
import axios from 'axios';

// An adapter intercepts every Axios request before any network transport runs.
axios.defaults.adapter = async (config) => {
  const url = new URL(config.url);
  assert.equal(url.origin, 'https://api.pdf.co');
  assert.equal(config.headers.get('x-api-key'), 'synthetic-test-key');
  const data = config.data ? JSON.parse(config.data) : undefined;
  const call = { method: config.method, path: url.pathname, data };
  appendFileSync(process.env.PDFCO_TEST_LOG, JSON.stringify(call) + '\n');
  if (data?.url === 'https://fixture.invalid/http-error') {
    throw new axios.AxiosError('Request failed', 'ERR_BAD_RESPONSE', config, undefined,
      { status: 401, data: { message: 'Synthetic authentication failure' }, headers: {}, config });
  }
  let response;
  switch (url.pathname) {
    case '/v1/account/balance':
      assert.equal(config.method, 'get');
      response = { AvailableCredits: 100, UsedCredits: 5 };
      break;
    case '/v1/pdf/merge':
    case '/v1/pdf/convert/from/html':
      response = { url: 'https://fixture.invalid/output.pdf' };
      break;
    case '/v1/pdf/split':
      response = { urls: ['https://fixture.invalid/one.pdf', 'https://fixture.invalid/two.pdf'] };
      break;
    case '/v1/pdf/convert/to/text':
      response = { body: 'Extracted fixture text' };
      break;
    case '/v1/pdf/convert/to/json':
      response = { body: { document: 'fixture' } };
      break;
    default:
      throw new Error('Unexpected API endpoint');
  }
  if (config.method !== 'get') {
    assert.equal(config.method, 'post');
    assert.equal(data.async, false);
  }
  if (data?.url === 'https://fixture.invalid/provider-error') {
    response = { error: true, message: 'Synthetic provider rejection' };
  }
  return { data: response, status: 200, statusText: 'OK', headers: {}, config };
};
