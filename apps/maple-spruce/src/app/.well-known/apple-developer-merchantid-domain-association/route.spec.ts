import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('Apple Pay domain association route', () => {
  it('serves the Square-issued file byte-for-byte as plain text', async () => {
    const response = GET();
    const body = await response.text();

    expect(response.headers.get('Content-Type')).toMatch(/^text\/plain/);
    // Apple rejects the file if anything is appended, a newline included.
    expect(body).toMatch(/^[0-9A-F]+$/);
    // It is hex-encoded JSON naming the payment processor's merchant id.
    const decoded = JSON.parse(Buffer.from(body, 'hex').toString('utf8'));
    expect(decoded).toHaveProperty('pspId');
  });
});
