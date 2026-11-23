/**
 * Spec for the hosted checkout page.
 *
 * These tests fail while public/script.js copies query-string parameters into
 * the CyberSource payment form and submits it. They pass once that page
 * ignores payment fields from the query string.
 *
 * The page under test is the repository's public/index.html and public/script.js,
 * served with the hosting rules in firebase.json (directory index, rewrites,
 * and header globs) by superstatic 10.0.0, the hosting server firebase-tools
 * 15.37.0 ships. The browser is the system Chrome. The POST to the CyberSource
 * pay endpoint is captured and aborted before it leaves this machine.
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const { after, before, test } = require('node:test');
const cjson = require('cjson');
const puppeteer = require('puppeteer-core');
const { server: createHostingServer } = require('superstatic');

const REPO_ROOT = path.resolve(__dirname, '..');
const PAY_ENDPOINT = 'https://secureacceptance.cybersource.com/pay';
const MARKER = 'QVFPAYLOAD';

// Placeholder payment request. Every value carries MARKER so a forwarded
// field is visible whether it is read from the form DOM or from the POST body.
// None of these values is a real credential.
const ATTACKER_FIELDS = {
  access_key: `${MARKER}ACCESSKEY`,
  profile_id: `${MARKER}PROFILEID`,
  transaction_uuid: `${MARKER}UUID`,
  signed_field_names: [
    'access_key',
    'profile_id',
    'transaction_uuid',
    'signed_field_names',
    'unsigned_field_names',
    'signed_date_time',
    'locale',
    'transaction_type',
    'reference_number',
    'amount',
    'currency',
    'payment_method',
    'override_custom_receipt_page',
    'override_custom_cancel_page',
    'override_backoffice_post_url',
    'bill_to_forename',
    'bill_to_email',
  ].join(','),
  unsigned_field_names: 'merchant_defined_data1',
  signed_date_time: '2020-01-01T00:00:00Z',
  locale: 'en',
  transaction_type: 'sale',
  reference_number: `${MARKER}REFERENCE`,
  amount: '48.15',
  currency: 'USD',
  payment_method: 'card',
  signature: `${MARKER}SIGNATURE`,
  override_custom_receipt_page: `https://attacker.example/${MARKER}receipt`,
  override_custom_cancel_page: `https://attacker.example/${MARKER}cancel`,
  override_backoffice_post_url: `https://attacker.example/${MARKER}notify`,
  bill_to_forename: `${MARKER} Forename`,
  bill_to_email: `${MARKER}@example.com`,
  merchant_defined_data1: `${MARKER}EXTRA`,
};

const PATHS = [
  { name: 'directory index', path: '/' },
  { name: 'rewritten invoice path', path: '/invoice' },
  { name: 'rewritten pay path', path: '/pay' },
  { name: 'explicit index.html', path: '/index.html' },
  { name: 'nested rewritten path', path: '/store/invoice/1001' },
];

let hosting;
let browser;

before(async () => {
  hosting = await startHosting();
  browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
});

after(async () => {
  if (browser) {
    await browser.close();
  }
  if (hosting) {
    await new Promise((resolve, reject) => {
      hosting.server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

for (const entry of PATHS) {
  test(`${entry.name} does not forward query-string payment fields`, async () => {
    const result = await openCheckout(entry.path, ATTACKER_FIELDS);
    assertNoForwardedPaymentFields(entry.path, result);
  });
}

test('duplicate access_key query parameters are not forwarded', async () => {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(ATTACKER_FIELDS)) {
    params.append(name, value);
  }
  params.append('access_key', `${MARKER}ACCESSKEYTWO`);
  const result = await openCheckout('/invoice', params);
  assertNoForwardedPaymentFields('/invoice', result);
  assert.ok(
    !result.text.includes(`${MARKER}ACCESSKEYTWO`),
    `duplicate access_key was forwarded\n${result.text}`,
  );
});

test('percent-encoded payment fields are not forwarded', async () => {
  const params = new URLSearchParams(ATTACKER_FIELDS);
  params.set('reference_number', `${MARKER}/REF`);
  params.set('bill_to_forename', `${MARKER} Encoded Name`);
  const result = await openCheckout('/pay', params);
  assertNoForwardedPaymentFields('/pay', result);
});

function assertNoForwardedPaymentFields(requestPath, result) {
  assert.equal(result.status, 200, `${requestPath} did not serve the checkout page`);
  assert.match(
    result.html,
    /id="paymentForm"/,
    `${requestPath} did not serve public/index.html`,
  );
  assert.match(
    result.html,
    /https:\/\/secureacceptance\.cybersource\.com\/pay/,
    `${requestPath} did not serve the hosted checkout form`,
  );
  assert.equal(
    result.text.includes(MARKER),
    false,
    [
      `${requestPath} copied query-string payment fields into the checkout.`,
      `document CSP: ${result.documentCsp || '(none)'}`,
      `script responses: ${JSON.stringify(result.scripts)}`,
      `pay posts: ${JSON.stringify(result.posts)}`,
      `form fields: ${JSON.stringify(result.domFields)}`,
    ].join('\n'),
  );
}

async function openCheckout(requestPath, fields) {
  const query = fields instanceof URLSearchParams
    ? fields.toString()
    : new URLSearchParams(fields).toString();
  const url = `http://127.0.0.1:${hosting.port}${requestPath}?${query}`;
  const documentResponse = await fetch(url);
  const html = await documentResponse.text();
  const documentCsp = documentResponse.headers.get('content-security-policy') || '';

  const page = await browser.newPage();
  const posts = [];
  const scripts = [];
  try {
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const target = request.url();
      if (target.startsWith('https://secureacceptance.cybersource.com/')) {
        posts.push({
          url: target,
          method: request.method(),
          body: request.postData() || '',
        });
        request.abort('aborted').catch(() => {});
        return;
      }
      request.continue().catch(() => {});
    });
    page.on('response', (response) => {
      const target = response.url();
      if (target.includes('script.js') || response.request().resourceType() === 'script') {
        scripts.push({
          url: target,
          status: response.status(),
          contentType: response.headers()['content-type'] || '',
        });
      }
    });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch((err) => {
      // form.submit() navigates away from the checkout page while it is loading.
      if (!/ERR_ABORTED|ERR_BLOCKED|Navigation/.test(String(err))) {
        throw err;
      }
    });

    const domFields = await page.evaluate(() => {
      const form = document.getElementById('paymentForm');
      if (!form) {
        return [];
      }
      const fields = [];
      for (const element of form.elements) {
        if (element.name) {
          fields.push([element.name, element.value]);
        }
      }
      return fields;
    }).catch(() => []);

    const text = [
      html,
      documentCsp,
      ...posts.map((post) => `${post.method} ${post.url}\n${decodeFormBody(post.body)}`),
      ...domFields.map(([name, value]) => `${name}=${value}`),
    ].join('\n');

    return {
      status: documentResponse.status,
      html,
      documentCsp,
      posts,
      scripts,
      domFields,
      text,
    };
  } finally {
    await page.close().catch(() => {});
  }
}

function decodeFormBody(body) {
  const decoded = [];
  for (const [name, value] of new URLSearchParams(body)) {
    decoded.push(`${name}=${value}`);
  }
  return decoded.join('&');
}

function startHosting() {
  const firebaseConfig = cjson.load(path.join(REPO_ROOT, 'firebase.json'));
  const app = createHostingServer({
    port: 0,
    hostname: '127.0.0.1',
    stack: 'strict',
    compression: true,
    fallthrough: false,
    cwd: REPO_ROOT,
    config: firebaseConfig.hosting,
  });
  return new Promise((resolve, reject) => {
    const httpServer = app.listen((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve({
        server: httpServer,
        port: httpServer.address().port,
      });
    });
  });
}
