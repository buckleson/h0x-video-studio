import { render, screen } from '@testing-library/react';

import { Badge } from './badge';

// --- constants ---

const VENDOR_TEXT = /artcraft|getartcraft|storyteller|fakeyou|lightricks|\bltx\b/i;

describe('Badge', () => {
  it('renders its label', () => {
    render(<Badge label="New" />);
    expect(screen.getByText('New')).toBeTruthy();
  });

  it('renders the icon before the label', () => {
    render(<Badge label="Pro" icon={<svg data-testid="badge-icon" />} />);
    const label = screen.getByText('Pro');
    const icon = screen.getByTestId('badge-icon');
    expect(label.firstChild).toBe(icon);
  });

  it('merges a custom className with the defaults', () => {
    render(<Badge label="Beta" className="text-red-500" />);
    const el = screen.getByText('Beta');
    expect(el.className).toContain('text-red-500');
    expect(el.className).toContain('uppercase');
  });

  it('lets a custom className override a conflicting default', () => {
    render(<Badge label="Beta" className="px-4" />);
    const el = screen.getByText('Beta');
    expect(el.className).toContain('px-4');
    expect(el.className).not.toContain('px-1.5');
  });

  it('renders an empty label without crashing', () => {
    const { container } = render(<Badge label="" />);
    expect(container.firstElementChild).not.toBeNull();
    expect(container.textContent).toBe('');
  });

  it('accepts the unused color prop without adding inline styles', () => {
    render(<Badge label="Hot" color="#ff0000" />);
    expect(screen.getByText('Hot').getAttribute('style')).toBeNull();
  });

  it('adds no vendor brand text of its own', () => {
    const { container } = render(<Badge label="New" />);
    expect(container.textContent).not.toMatch(VENDOR_TEXT);
  });
});
