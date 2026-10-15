// Téma: auto (podle systému), světlé, tmavé.
import * as store from './store.js';

export const THEMES = [
  { value: 'auto', label: 'Podle systému' },
  { value: 'light', label: 'Světlý' },
  { value: 'dark', label: 'Tmavý' },
];

export function applyTheme() {
  const theme = store.get().theme;
  if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = theme;
}

export function setTheme(theme) {
  if (!THEMES.some((t) => t.value === theme)) return;
  store.update((s) => { s.theme = theme; });
  applyTheme();
}
