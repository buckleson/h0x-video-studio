import { render, screen } from '@testing-library/react';

import { Select } from './select';

// jsdom has no ResizeObserver; Headless UI calls it when a menu opens.
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() {}
    unobserve() {}
  });
});

describe('Select', () => {
  it('renders the selected option label', () => {
    render(
      <Select
        options={[
          { label: 'First', value: 'a' },
          { label: 'Second', value: 'b' },
        ]}
        value="b"
        onChange={() => undefined}
      />,
    );
    expect(screen.getByRole('button').textContent).toContain('Second');
  });

  it('renders the placeholder when no value is set', () => {
    render(
      <Select
        options={[{ label: 'First', value: 'a' }]}
        placeholder="Pick one"
        onChange={() => undefined}
      />,
    );
    expect(screen.getByText('Pick one')).toBeTruthy();
  });
});
