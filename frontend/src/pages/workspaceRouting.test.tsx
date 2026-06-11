import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NavContext } from '../nav';
import Shell from '../Shell';

describe('Workspace navigation', () => {
  it('renders Workspace as a primary destination', () => {
    const html = renderToStaticMarkup(
      <NavContext.Provider value={{
        page: { id: 'workspace' },
        navigate: () => {},
        mode: 'dark',
        toggleTheme: () => {},
        userEmail: '',
      }}>
        <Shell><div>content</div></Shell>
      </NavContext.Provider>,
    );
    expect(html).toContain('href="#workspace"');
    expect(html).toContain('Workspace');
  });
});
