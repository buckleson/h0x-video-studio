import { fireEvent, render, screen } from '@testing-library/react';

import { Gravatar } from './gravatar';
import EnvironmentVariables from './environment-variables';

const BRAND_LEAKS = /artcraft|getartcraft|storyteller\.ai|fakeyou/i;
const BOB_ALT = "bob's gravatar";

describe('Gravatar edge cases', () => {
  beforeEach(() => {
    EnvironmentVariables.initialize({ GRAVATAR_API: 'https://gravatar.test' });
  });

  it('uses plain "gravatar" alt text without a username', () => {
    render(<Gravatar size={32} />);
    expect(screen.getByAltText('gravatar')).toBeTruthy();
  });

  it('builds the remote URL from the API base, hash and size', () => {
    render(<Gravatar size={64} email_hash="abc123" username="bob" />);
    const src = screen.getByAltText(BOB_ALT).getAttribute('src') ?? '';
    expect(src.startsWith('https://gravatar.test/avatar/abc123?s=64&d=')).toBe(true);
  });

  it('shows a spinner until the image loads', () => {
    const { container } = render(<Gravatar size={32} username="bob" />);
    expect(container.querySelector('.animate-spin')).not.toBeNull();
    fireEvent.load(screen.getByAltText(BOB_ALT));
    expect(container.querySelector('.animate-spin')).toBeNull();
  });

  it('falls back to the local default avatar when the remote image fails', () => {
    const { container } = render(<Gravatar size={32} username="bob" />);
    const img = screen.getByAltText(BOB_ALT);
    fireEvent.error(img);
    expect(img.getAttribute('src')).toBe('/resources/avatars/0.webp');
    expect(container.querySelector('.animate-spin')).toBeNull();
  });

  it('falls back to the indexed local avatar and does not loop on a second error', () => {
    render(<Gravatar size={32} username="bob" avatarIndex={3} />);
    const img = screen.getByAltText(BOB_ALT);
    fireEvent.error(img);
    fireEvent.error(img);
    expect(img.getAttribute('src')).toBe('/resources/avatars/3.webp');
  });

  it('maps backgroundIndex to a colour and defaults when out of range', () => {
    const { rerender } = render(<Gravatar size={32} username="bob" backgroundIndex={2} />);
    expect(screen.getByAltText(BOB_ALT).style.backgroundColor).toBe('rgb(231, 193, 60)');
    rerender(<Gravatar size={32} username="bob" backgroundIndex={99} />);
    expect(screen.getByAltText(BOB_ALT).style.backgroundColor).toBe('rgb(26, 26, 39)');
  });

  it('accepts a size of 0', () => {
    render(<Gravatar size={0} username="bob" />);
    expect(screen.getByAltText(BOB_ALT).getAttribute('width')).toBe('0');
  });

  it('shows no brand names in its alt text', () => {
    render(<Gravatar size={32} />);
    expect(screen.getByRole('img').getAttribute('alt')).not.toMatch(BRAND_LEAKS);
  });
});
