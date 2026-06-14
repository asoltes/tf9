import { describe, expect, it } from 'vitest';
import { ticketURL } from './ticketing';

describe('ticketURL', () => {
  it('substitutes a ticket placeholder', () => {
    expect(ticketURL('https://tickets.example/browse/{ticket}', 'OPS 42'))
      .toBe('https://tickets.example/browse/OPS%2042');
  });

  it('appends the ticket when no placeholder exists', () => {
    expect(ticketURL('https://tickets.example/issues/', 'OPS-42'))
      .toBe('https://tickets.example/issues/OPS-42');
  });

  it('returns null when tracking links are not configured', () => {
    expect(ticketURL(null, 'OPS-42')).toBeNull();
    expect(ticketURL('https://tickets.example', '')).toBeNull();
  });
});
