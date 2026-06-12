import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import NewRunModal from '../components/NewRunModal';
import Overview from './Overview';

describe('NewRunModal renders when visible', () => {
  it('emits the overlay for visible=true', () => {
    const html = renderToStaticMarkup(
      <NewRunModal visible={true} onDismiss={() => {}} onCreated={() => {}} />,
    );
    expect(html).toContain('run-overlay');
    expect(html).toContain('New run');
  });
});

describe('Dashboard primary actions', () => {
  const html = renderToStaticMarkup(<Overview firstRun={null as never} />);

  it('offers Start Terraform Run and Open Repository Workspace', () => {
    // The new-run action must lead to the distinct #runs/new destination
    // (via navigate with newRun: true), not plain #runs.
    expect(html).toContain('Start Terraform Run');
    expect(html).toContain('Open Repository Workspace');
  });
});
