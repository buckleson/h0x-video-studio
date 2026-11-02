import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Select } from './select';

const OPTIONS = [
  { label: 'First', value: 'a' },
  { label: 'Second', value: 'b' },
];

// jsdom has no ResizeObserver; Headless UI calls it when a menu opens.
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() {}
    unobserve() {}
  });
});

describe('Select edge cases', () => {
  it('shows the placeholder when the value matches no option', () => {
    render(
      <Select
        options={OPTIONS}
        value="missing"
        placeholder="Pick one"
        onChange={() => undefined}
      />,
    );
    expect(screen.getByRole('button').textContent).toBe('Pick one');
  });

  it('renders an empty label with no options, value or placeholder', () => {
    render(<Select options={[]} onChange={() => undefined} />);
    expect(screen.getByRole('button').textContent).toBe('');
  });

  it('shows the label for a falsy numeric value of 0', () => {
    render(
      <Select
        options={[
          { label: 'Zero', value: 0 },
          { label: 'One', value: 1 },
        ]}
        value={0}
        onChange={() => undefined}
      />,
    );
    expect(screen.getByRole('button').textContent).toBe('Zero');
  });

  it('passes id through to the button', () => {
    render(<Select id="resolution" options={OPTIONS} value="a" onChange={() => undefined} />);
    expect(screen.getByRole('button').id).toBe('resolution');
  });

  it('opens the list and calls onChange with the picked value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select options={OPTIONS} value="a" onChange={onChange} />);
    await user.click(screen.getByRole('button'));
    expect(screen.getAllByRole('option')).toHaveLength(2);
    await user.click(screen.getByRole('option', { name: 'Second' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });
});
