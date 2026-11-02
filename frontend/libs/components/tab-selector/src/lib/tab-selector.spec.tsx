import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { TabSelector } from './tab-selector';

// --- constants ---

const TABS = [
  { id: 'image', label: 'Image' },
  { id: 'video', label: 'Video' },
];
const VENDOR_TEXT = /artcraft|getartcraft|storyteller|fakeyou|lightricks|\bltx\b/i;

describe('TabSelector', () => {
  it('renders a tab per item and selects the active one', () => {
    render(
      <TabSelector
        tabs={[
          { id: 'image', label: 'Image' },
          { id: 'video', label: 'Video' },
        ]}
        activeTab="video"
        onTabChange={() => undefined}
      />,
    );
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(
      screen.getByRole('tab', { name: 'Video' }).getAttribute('aria-selected'),
    ).toBe('true');
  });

  it('marks the other tabs as not selected', () => {
    render(<TabSelector tabs={TABS} activeTab="video" onTabChange={() => undefined} />);
    expect(
      screen.getByRole('tab', { name: 'Image' }).getAttribute('aria-selected'),
    ).toBe('false');
  });

  it('calls onTabChange with the id of the clicked tab', () => {
    const onTabChange = vi.fn();
    render(<TabSelector tabs={TABS} activeTab="video" onTabChange={onTabChange} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Image' }));
    expect(onTabChange).toHaveBeenCalledWith('image');
  });

  it('does not call onTabChange when disabled', () => {
    const onTabChange = vi.fn();
    render(
      <TabSelector tabs={TABS} activeTab="video" onTabChange={onTabChange} disabled />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Image' }));
    expect(onTabChange).not.toHaveBeenCalled();
    for (const tab of screen.getAllByRole('tab')) {
      expect(
        tab.hasAttribute('disabled') || tab.getAttribute('aria-disabled') === 'true',
      ).toBe(true);
    }
  });

  it('renders an empty tab list without crashing', () => {
    render(<TabSelector tabs={[]} activeTab="video" onTabChange={() => undefined} />);
    expect(screen.getByRole('tablist')).toBeTruthy();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });

  it('still renders every tab when activeTab matches none of them', () => {
    render(<TabSelector tabs={TABS} activeTab="audio" onTabChange={() => undefined} />);
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.getByText('Image')).toBeTruthy();
    expect(screen.getByText('Video')).toBeTruthy();
  });

  it('shows no vendor brand text', () => {
    const { container } = render(
      <TabSelector tabs={TABS} activeTab="image" onTabChange={() => undefined} />,
    );
    expect(container.textContent).not.toMatch(VENDOR_TEXT);
  });
});
