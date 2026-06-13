// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import GraphView from './GraphView';
import type { GraphDocument } from '../types';

const { zoomToFitMock } = vi.hoisted(() => ({ zoomToFitMock: vi.fn() }));

vi.mock('react-force-graph-2d', async () => {
  const React = await import('react');
  return {
    default: React.forwardRef((_props: unknown, ref) => {
      React.useImperativeHandle(ref, () => ({
        d3Force: () => undefined,
        d3ReheatSimulation: () => undefined,
        pauseAnimation: () => undefined,
        resumeAnimation: () => undefined,
        zoomToFit: zoomToFitMock,
        zoom: () => 1,
        centerAt: () => undefined,
      }));
      return <div className="force-graph-mock" />;
    }),
  };
});

describe('GraphView', () => {
  it('keeps action filters visible in compact split-panel mode', async () => {
    const doc: GraphDocument = {
      runId: 'run-compact', repo: 'infra', revision: 1,
      nodes: [
        {
          id: 'target:dev:resource:terraform_data.demo', kind: 'managed',
          label: 'terraform_data.demo', target: 'dev', action: 'create',
        },
      ],
      edges: [],
    };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<GraphView document={doc} compact />));
    expect(container.querySelector('.gv-compact .gv-filter-bar')).not.toBeNull();
    expect(container.querySelectorAll('.gv-compact .gv-filter-item')).toHaveLength(5);
    await act(async () => root.unmount());
    container.remove();
  });

  it('renders hierarchy and Terraform action badges', async () => {
    const doc: GraphDocument = {
      runId: 'run-1', repo: 'infra', revision: 1,
      nodes: [
        { id: 'target:dev:module:', kind: 'module', label: 'root', target: 'dev', group: 'platform', parent: 'target:dev:root' },
        {
          id: 'target:dev:resource:aws_vpc.main', kind: 'managed', label: 'aws_vpc.main',
          address: 'aws_vpc.main', target: 'dev', group: 'platform',
          parent: 'target:dev:module:', action: 'update',
          changes: [{ path: 'tags.Environment', kind: 'updated', replacement: true }],
          command: 'terraform plan dev',
          result: '# aws_vpc.main will be updated in-place\n  ~ resource "aws_vpc" "main" {\n      ~ tags = {}',
        },
        { id: 'target:dev:resource:aws_subnet.private', kind: 'managed', label: 'aws_subnet.private', address: 'aws_subnet.private', target: 'dev', group: 'platform', parent: 'target:dev:module:' },
      ],
      edges: [{ id: 'dep', source: 'target:dev:resource:aws_vpc.main', target: 'target:dev:resource:aws_subnet.private', kind: 'dependency' }],
    };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<GraphView document={doc} />));
    expect(container.textContent).toContain('infra');
    expect(container.textContent).toContain('platform');
    expect(container.textContent).toContain('aws_vpc.main');
    expect(container.textContent).toContain('~');
    expect(container.querySelector('.force-graph-mock')).not.toBeNull();
    expect(container.querySelector('select')?.querySelectorAll('option')).toHaveLength(7);

    // Action filters sit centered in the top toolbar with their counts.
    const filters = container.querySelectorAll('.gv-filter-item');
    expect(filters).toHaveLength(5);
    expect(container.textContent).toContain('No change');
    expect(Array.from(filters).find(item => item.textContent?.includes('Update'))?.textContent).toContain('1');
    expect(container.querySelector('[aria-label="Terraform summary"]')).toBeNull();
    expect(container.querySelector('.gv-impact-chip')).toBeNull();
    expect(container.querySelector('.gv-legend')).toBeNull();
    expect(container.querySelector('.gv-seg button.on')?.textContent).toBe('Action');

    const resource = Array.from(container.querySelectorAll<HTMLElement>('.gv-node-item.kind-managed'))
      .find(node => node.textContent?.includes('aws_vpc.main'))!;
    await act(async () => resource.click());
    expect(container.textContent).toContain('What changed');
    expect(container.textContent).toContain('tags.Environment');
    expect(container.textContent).toContain('replacement');
    expect(container.textContent).toContain('terraform plan dev');
    expect(container.textContent).toContain('# aws_vpc.main will be updated in-place');
    expect(Array.from(container.querySelectorAll('.gv-node-item.connected')).some(node => node.textContent?.includes('aws_subnet.private'))).toBe(true);
    // The transitive dependency closure (vpc → subnet) is the blast radius.
    expect(container.textContent).toContain('2 in blast radius');

    // Filtering by the "update" action keeps the changed node and drops the unrelated one.
    const updateLegend = Array.from(container.querySelectorAll<HTMLElement>('.gv-filter-item'))
      .find(item => item.textContent?.includes('Update'))!;
    await act(async () => new Promise(resolve => window.setTimeout(resolve, 30)));
    zoomToFitMock.mockClear();
    await act(async () => updateLegend.click());
    await act(async () => new Promise(resolve => window.setTimeout(resolve, 30)));
    expect(zoomToFitMock).not.toHaveBeenCalled();
    const resourceLabels = Array.from(container.querySelectorAll('.gv-node-item.kind-managed')).map(node => node.textContent);
    expect(resourceLabels.some(label => label?.includes('aws_vpc.main'))).toBe(true);
    expect(resourceLabels.some(label => label?.includes('aws_subnet.private'))).toBe(false);
    await act(async () => updateLegend.click());

    const shapeSelect = container.querySelector('select[aria-label="Node shape"]') as HTMLSelectElement;
    await act(async () => {
      shapeSelect.value = 'circle';
      shapeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(shapeSelect.value).toBe('circle');
    expect(localStorage.getItem('tf9-graph-node-shape')).toBe('circle');

    const controlsButton = Array.from(container.querySelectorAll<HTMLButtonElement>('.gv-toolbar button'))
      .find(button => button.textContent === 'Controls')!;
    await act(async () => controlsButton.click());
    expect(container.querySelector('[aria-label="Graph controls"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Node size"]')).not.toBeNull();
    const changedOnly = Array.from(container.querySelectorAll<HTMLInputElement>('.gv-switch-row input'))
      .find(input => input.parentElement?.textContent?.includes('Changed nodes only'))!;
    await act(async () => changedOnly.click());
    expect(changedOnly.checked).toBe(true);

    await act(async () => root.unmount());
    container.remove();
  });
});
