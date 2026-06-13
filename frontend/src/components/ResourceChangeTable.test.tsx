// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import type { ResourceChange, ResourceChangeSort } from '../lib/planChanges';
import { ResourceChangeTable } from './RunSplitPanel';
import { RvResourceTable } from '../pages/ReportViewer';

const changes: ResourceChange[] = [
  {
    action: 'change',
    resource: 'terraform_data.zeta',
    blockLines: [
      '# terraform_data.zeta will be updated in-place',
      '~ resource "terraform_data" "zeta" {',
      '}',
    ],
  },
  {
    action: 'add',
    resource: 'terraform_data.alpha',
    blockLines: [
      '# terraform_data.alpha will be created',
      '+ resource "terraform_data" "alpha" {',
      '}',
    ],
  },
];

const lines = changes.flatMap(change => change.blockLines);

function LiveTableHarness() {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [sort, setSort] = useState<ResourceChangeSort>('plan');
  return (
    <ResourceChangeTable
      lines={lines}
      search=""
      expanded={expanded}
      sort={sort}
      onSortChange={setSort}
      onToggle={key => setExpanded(previous => {
        const next = new Set(previous);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
      })}
    />
  );
}

async function verifyPersistentExpansion(
  element: React.ReactElement,
  rowSelector: string,
  detailSelector: string,
) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(element));

  const rows = () => Array.from(container.querySelectorAll<HTMLElement>(rowSelector));
  expect(rows().map(row => row.textContent)).toEqual([
    expect.stringContaining('terraform_data.zeta'),
    expect.stringContaining('terraform_data.alpha'),
  ]);

  await act(async () => rows()[0].click());
  await act(async () => rows()[1].click());
  expect(container.querySelectorAll(detailSelector)).toHaveLength(2);

  const select = container.querySelector('select') as HTMLSelectElement;
  await act(async () => {
    select.value = 'resource';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });

  expect(rows().map(row => row.textContent)).toEqual([
    expect.stringContaining('terraform_data.alpha'),
    expect.stringContaining('terraform_data.zeta'),
  ]);
  expect(container.querySelectorAll(detailSelector)).toHaveLength(2);

  await act(async () => root.unmount());
  container.remove();
}

describe('resource change tables', () => {
  it('keeps multiple live-terminal rows expanded while sorting', async () => {
    await verifyPersistentExpansion(<LiveTableHarness />, '.rct-row', '.rct-expanded');
  });

  it('keeps multiple report rows expanded while sorting', async () => {
    await verifyPersistentExpansion(
      <RvResourceTable changes={changes} query="" wrap={false} />,
      '.rv-rct-row',
      '.rv-rct-block',
    );
  });
});
