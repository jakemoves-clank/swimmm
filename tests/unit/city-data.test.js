import { describe, it, expect } from 'vitest';
import { readJsonCapped } from '../../src/lib/server/cityData.js';

function response(...buffers) {
	return {
		body: new ReadableStream({
			start(controller) {
				for (const b of buffers) controller.enqueue(b);
				controller.close();
			}
		})
	};
}

const bytes = (s) => new TextEncoder().encode(s);

describe('readJsonCapped', () => {
	it('parses a body that fits under the cap', async () => {
		const out = await readJsonCapped(response(bytes('{"a":'), bytes('1}')), 'url', 1000);
		expect(out).toEqual({ a: 1 });
	});

	it('stops as soon as the stream exceeds the cap', async () => {
		const kb = new Uint8Array(1024);
		await expect(readJsonCapped(response(kb, kb, kb), 'url', 2048)).rejects.toThrow(/byte cap/);
	});
});
