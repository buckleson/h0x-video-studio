// C1: the Appearance pane offers exactly two themes, "Light" (light) and
// "Dark" (gray). Every other stored value, legacy or junk, becomes gray.
import { fireEvent, render, screen } from '@testing-library/react';
import { AppearanceSettingsPane } from './AppearanceSettingsPane';

const KEY = 'st-theme';
const LEGACY = ['black', 'aurora', 'sunset', 'gradient'];
const JUNK = ['', '   ', 'LIGHT', 'Light', 'dark', 'theme-light', 'null', 'undefined', 'gray;light'];

describe('AppearanceSettingsPane (C1)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.className = '';
  });

  it('renders exactly two options, Light then Dark', () => {
    render(<AppearanceSettingsPane />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Light', 'Dark']);
  });

  it('defaults to Dark (gray) when nothing is stored', () => {
    render(<AppearanceSettingsPane />);
    expect(screen.getByRole('button', { name: 'Dark' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Light' }).getAttribute('aria-pressed')).toBe('false');
    expect(window.localStorage.getItem(KEY)).toBe('gray');
    expect(document.documentElement.classList.contains('theme-gray')).toBe(true);
  });

  it('keeps a stored light theme, tolerating surrounding whitespace', () => {
    window.localStorage.setItem(KEY, '  light \n');
    render(<AppearanceSettingsPane />);
    expect(screen.getByRole('button', { name: 'Light' }).getAttribute('aria-pressed')).toBe('true');
    expect(window.localStorage.getItem(KEY)).toBe('light');
    expect(document.documentElement.className).toBe('theme-light');
  });

  it.each(LEGACY)('normalises legacy stored "%s" to gray', (legacy) => {
    window.localStorage.setItem(KEY, legacy);
    document.documentElement.classList.add(`theme-${legacy}`);
    render(<AppearanceSettingsPane />);
    expect(screen.getByRole('button', { name: 'Dark' }).getAttribute('aria-pressed')).toBe('true');
    expect(window.localStorage.getItem(KEY)).toBe('gray');
    expect(document.documentElement.classList.contains(`theme-${legacy}`)).toBe(false);
    expect(document.documentElement.classList.contains('theme-gray')).toBe(true);
  });

  it.each(JUNK)('normalises unknown stored value %j to gray', (junk) => {
    window.localStorage.setItem(KEY, junk);
    render(<AppearanceSettingsPane />);
    expect(window.localStorage.getItem(KEY)).toBe('gray');
    expect(document.documentElement.className).toBe('theme-gray');
  });

  it('switching swaps the theme class, keeps non-theme classes, and leaves one theme class', () => {
    document.documentElement.classList.add('dark-scrollbars', 'theme-aurora', 'theme-light');
    render(<AppearanceSettingsPane />);
    fireEvent.click(screen.getByRole('button', { name: 'Light' }));
    expect(window.localStorage.getItem(KEY)).toBe('light');
    expect(themeClasses()).toEqual(['theme-light']);
    expect(document.documentElement.classList.contains('dark-scrollbars')).toBe(true);
    expect(screen.getByRole('button', { name: 'Light' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Dark' }).getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
    expect(window.localStorage.getItem(KEY)).toBe('gray');
    expect(themeClasses()).toEqual(['theme-gray']);
  });

  it('clicking the already-selected option is a no-op', () => {
    render(<AppearanceSettingsPane />);
    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
    expect(window.localStorage.getItem(KEY)).toBe('gray');
    expect(themeClasses()).toEqual(['theme-gray']);
  });

  it('shows no legacy theme names and no upstream branding', () => {
    const { container } = render(<AppearanceSettingsPane />);
    const text = container.textContent ?? '';
    for (const word of ['Black', 'Aurora', 'Sunset', 'Gradient', 'Gray']) expect(text).not.toContain(word);
    expect(text).not.toMatch(/artcraft|storyteller|fakeyou|LTX|Lightricks/i);
  });
});

// --- helpers ---

const themeClasses = () => [...document.documentElement.classList].filter((c) => c.startsWith('theme-'));
