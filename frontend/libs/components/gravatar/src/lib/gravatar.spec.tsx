import { render, screen } from '@testing-library/react';

import { Gravatar } from './gravatar';

describe('Gravatar', () => {
  it('renders an avatar image with alt text and size', () => {
    render(<Gravatar size={48} username="alice" />);
    const img = screen.getByAltText("alice's gravatar");
    expect(img.getAttribute('width')).toBe('48');
    expect(img.getAttribute('height')).toBe('48');
  });
});
