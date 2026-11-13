import { expect, it } from 'vitest';
import { Pool } from 'pg';
import { setTimeout as delay } from 'node:timers/promises';
import { testDatabase } from './helpers/db';

it('waits for owned fixture connections to close instead of terminating live clients', async () => {
  const fixture = await testDatabase(false);
  const peer = new Pool({ connectionString: fixture.url });
  const errors: Error[] = [];
  peer.on('error', error => errors.push(error));
  await peer.query('SELECT 1');
  let finished = false;
  const closing = fixture.close().then(() => { finished = true; });
  try {
    await delay(50);
    expect(finished).toBe(false);
  } finally {
    await peer.end();
    await closing;
  }
  expect(errors).toEqual([]);
});
