import { describe, expect, it } from 'vitest';
import { systemClock } from '@/core/clock.js';

describe('systemClock', () => {
  it('returns current epoch ms', () => {
    const before = Date.now();
    const t = systemClock.nowMs();
    const after = Date.now();

    expect(t).toBeGreaterThanOrEqual(before);
    expect(t).toBeLessThanOrEqual(after);
  });
});
