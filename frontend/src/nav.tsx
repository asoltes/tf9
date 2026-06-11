import { createContext, useContext } from 'react';
import type { Page } from './types';

interface NavCtx {
  page: Page;
  navigate: (p: Page) => void;
  mode: 'light' | 'dark' | 'dim';
  toggleTheme: () => void;
  userEmail: string;
}

export const NavContext = createContext<NavCtx>({
  page: { id: 'runs' },
  navigate: () => {},
  mode: 'dark',
  toggleTheme: () => {},
  userEmail: '',
});

export const useNav = () => useContext(NavContext);
