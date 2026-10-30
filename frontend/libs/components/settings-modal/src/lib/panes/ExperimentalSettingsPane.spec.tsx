// A4c: removing fireToggleEvent must not change the storyboard toggle flow,
// and the pane must not touch any gtag / dataLayer global.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ExperimentalSettingsPane } from './ExperimentalSettingsPane';
import { useExperimentalStore } from '../experimental-store';

const STORYBOARD_KEY = 'artcraft_experimental_storyboard_page';

describe('ExperimentalSettingsPane (A4c)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    act(() => useExperimentalStore.setState({ enabled: true, storyboardPageEnabled: false }));
    delete (window as unknown as Record<string, unknown>).gtag;
    delete (window as unknown as Record<string, unknown>).dataLayer;
  });

  it('turning the switch on enables the storyboard page immediately, no confirm', () => {
    render(<ExperimentalSettingsPane />);
    fireEvent.click(screen.getByRole('switch'));
    expect(useExperimentalStore.getState().storyboardPageEnabled).toBe(true);
    expect(window.localStorage.getItem(STORYBOARD_KEY)).toBe('true');
    expect(screen.queryByText('Disable Storyboard page?')).toBeNull();
  });

  it('turning it off asks first; Cancel keeps it on and skips the callback', () => {
    act(() => useExperimentalStore.getState().setStoryboardPageEnabled(true));
    const onDisable = vi.fn();
    render(<ExperimentalSettingsPane onStoryboardPageDisable={onDisable} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(screen.getByText('Disable Storyboard page?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onDisable).not.toHaveBeenCalled();
    expect(useExperimentalStore.getState().storyboardPageEnabled).toBe(true);
  });

  it('confirming calls the host callback before the flag flips off', () => {
    act(() => useExperimentalStore.getState().setStoryboardPageEnabled(true));
    const seen: boolean[] = [];
    const onDisable = vi.fn(() => seen.push(useExperimentalStore.getState().storyboardPageEnabled));
    render(<ExperimentalSettingsPane onStoryboardPageDisable={onDisable} />);
    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('button', { name: 'Disable' }));
    expect(onDisable).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([true]);
    expect(useExperimentalStore.getState().storyboardPageEnabled).toBe(false);
    expect(window.localStorage.getItem(STORYBOARD_KEY)).toBeNull();
  });

  it('confirming with no callback still disables (optional prop)', () => {
    act(() => useExperimentalStore.getState().setStoryboardPageEnabled(true));
    render(<ExperimentalSettingsPane />);
    fireEvent.click(screen.getByRole('switch'));
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'Disable' }))).not.toThrow();
    expect(useExperimentalStore.getState().storyboardPageEnabled).toBe(false);
  });

  it('a full on/off cycle creates no gtag or dataLayer global and calls no fetch', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    render(<ExperimentalSettingsPane />);
    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('button', { name: 'Disable' }));
    expect('gtag' in window).toBe(false);
    expect('dataLayer' in window).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('shows no LTX / Lightricks branding', () => {
    act(() => useExperimentalStore.getState().setStoryboardPageEnabled(true));
    const { container } = render(<ExperimentalSettingsPane />);
    fireEvent.click(screen.getByRole('switch'));
    expect(container.textContent ?? '').not.toMatch(/\bLTX\b|Lightricks/i);
    expect(document.body.textContent ?? '').not.toMatch(/\bLTX\b|Lightricks/i);
  });
});
