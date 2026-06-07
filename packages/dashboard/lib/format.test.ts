import { IntercalApiError } from '@intercal/sdk';
import { describe, expect, it } from 'vitest';
import { compactId, describeError, formatPercent } from './format';

describe('dashboard format helpers', () => {
  it('formats unknown percentages explicitly', () => {
    expect(formatPercent(undefined)).toBe('unknown');
    expect(formatPercent(0.734)).toBe('73%');
  });

  it('preserves API error taxonomy in user-facing messages', () => {
    const err = new IntercalApiError(404, 'not_found', 'No entity found');
    expect(describeError(err)).toBe('not_found: No entity found');
  });

  it('compacts long ids without hiding both ends', () => {
    expect(compactId('12345678-1234-1234-1234-abcdefabcdef')).toBe('12345678...abcdef');
  });
});
