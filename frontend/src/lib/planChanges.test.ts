import { describe, expect, it } from 'vitest';
import { sortResourceChanges, type ResourceChange } from './planChanges';

const changes: ResourceChange[] = [
  { action: 'change', resource: 'z.last', blockLines: [] },
  { action: 'destroy', resource: 'b.destroy', blockLines: [] },
  { action: 'add', resource: 'c.add', blockLines: [] },
  { action: 'replace', resource: 'a.replace', blockLines: [] },
];

describe('sortResourceChanges', () => {
  it('preserves Terraform plan order', () => {
    expect(sortResourceChanges(changes, 'plan')).toBe(changes);
  });

  it('groups actions in review order', () => {
    expect(sortResourceChanges(changes, 'action').map(change => change.action))
      .toEqual(['add', 'change', 'replace', 'destroy']);
  });

  it('sorts resources alphabetically', () => {
    expect(sortResourceChanges(changes, 'resource').map(change => change.resource))
      .toEqual(['a.replace', 'b.destroy', 'c.add', 'z.last']);
  });
});
