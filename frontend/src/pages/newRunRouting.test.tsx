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

describe('Overview "New run" hub card', () => {
  const html = renderToStaticMarkup(<Overview firstRun={null as never} />);

  it('links to a distinct new-run destination (not the same as plain Runs)', () => {
    // Regression: the New run card used href="#runs" identical to the Runs
    // card, so it navigated to the Runs page without opening the modal.
    expect(html).toContain('href="#runs/new"');
  });
});
