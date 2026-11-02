import { fireEvent, render, screen } from '@testing-library/react';
import { Plus } from 'lucide-react';

import { ButtonIcon } from './button-icon';
import * as lib from '../index';

const BRAND_LEAK = /artcraft|getartcraft|storyteller\.ai|fakeyou|\bLTX\b|lightricks/i;

describe('ButtonIcon', () => {
  it('renders a clickable button with the icon', () => {
    const onClick = vi.fn();
    const { container } = render(<ButtonIcon icon={Plus} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(container.querySelector('button svg')).toBeTruthy();
  });

  it('is exported by name from the lib entry (not undefined)', () => {
    expect(typeof lib.ButtonIcon).toBe('function');
    expect(lib.ButtonIcon).toBe(ButtonIcon);
  });

  it('disabled: button is disabled and click does not call onClick', () => {
    const onClick = vi.fn();
    render(<ButtonIcon icon={Plus} onClick={onClick} disabled />);
    const button = screen.getByRole('button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(button.className).toContain('opacity-50');
  });

  it('passes size through to the svg and merges a custom className', () => {
    const { container } = render(
      <ButtonIcon icon={Plus} onClick={() => {}} size={12} className="extra-class" />,
    );
    const svg = container.querySelector('button svg')!;
    expect(svg.getAttribute('width')).toBe('12');
    expect(screen.getByRole('button').className).toContain('extra-class');
  });

  it('bgFill switches to the filled background', () => {
    render(<ButtonIcon icon={Plus} onClick={() => {}} bgFill />);
    const cls = screen.getByRole('button').className;
    expect(cls).toContain('bg-ui-controls-button');
    expect(cls).not.toContain('bg-transparent');
  });

  it('renders no brand text', () => {
    const { container } = render(<ButtonIcon icon={Plus} onClick={() => {}} />);
    expect(container.textContent ?? '').not.toMatch(BRAND_LEAK);
  });
});
