import { describe, expect, it } from 'vitest';
import { handleInventoryRoute } from '../src/routes/inventory';

function responseCapture() {
  let body = '';
  let status = 0;
  return {
    response: {
      writableEnded: false,
      headersSent: false,
      req: { headers: {} },
      writeHead(nextStatus: number) {
        status = nextStatus;
      },
      end(value?: string) {
        body = value ?? '';
        this.writableEnded = true;
      },
    } as never,
    read() {
      return { status, body: JSON.parse(body) };
    },
  };
}

describe('Inventory read route', () => {
  it('returns the bounded summary and rows', async () => {
    const capture = responseCapture();
    const handled = await handleInventoryRoute('GET', '/api/inventory', {} as never, capture.response);

    expect(handled).toBe(true);
    expect(capture.read()).toMatchObject({
      status: 200,
      body: { summary: { totalTargets: 48, represented: 42, unresolved: 6 }, rows: expect.any(Array) },
    });
  });

  it('returns selected-target assertions, historical locators, and conflict state', async () => {
    const capture = responseCapture();
    const handled = await handleInventoryRoute('GET', '/api/inventory/AR-CAP-08', {} as never, capture.response);
    const result = capture.read();

    expect(handled).toBe(true);
    expect(result.status).toBe(200);
    expect(result.body.detail).toMatchObject({
      targetId: 'AR-CAP-08',
      disposition: 'unresolved',
      conflict: { id: 'r3-conflict-ar-cap-08' },
      unresolvedQuestion: { id: 'r3-unresolved-ar-cap-08' },
    });
    expect(result.body.detail.assertions[0].evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ artifact: 'original' }),
        expect.objectContaining({ artifact: 'overlay' }),
      ]),
    );
  });

  it('does not expose mutation methods', async () => {
    const capture = responseCapture();
    expect(await handleInventoryRoute('POST', '/api/inventory', {} as never, capture.response)).toBe(false);
  });
});
