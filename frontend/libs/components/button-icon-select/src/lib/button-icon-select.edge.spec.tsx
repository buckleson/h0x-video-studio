import { fireEvent, render, screen } from '@testing-library/react';
import { ImageIcon, MusicIcon, VideoIcon } from 'lucide-react';

import { ButtonIconSelect } from './button-icon-select';

const OPTIONS = [
  { value: 'image', icon: ImageIcon, text: 'Image' },
  { value: 'video', icon: VideoIcon, text: 'Video' },
];

const SELECTED = 'border-brand-primary';
const button = (name: string) => screen.getByRole('button', { name });

describe('ButtonIconSelect edge cases', () => {
  it('selects the first option when no selectedOption is given', () => {
    render(<ButtonIconSelect options={OPTIONS} />);
    expect(button('Image').className).toContain(SELECTED);
    expect(button('Video').className).not.toContain(SELECTED);
  });

  it('honours selectedOption and follows it on rerender', () => {
    const { rerender } = render(<ButtonIconSelect options={OPTIONS} selectedOption="video" />);
    expect(button('Video').className).toContain(SELECTED);
    rerender(<ButtonIconSelect options={OPTIONS} selectedOption="image" />);
    expect(button('Image').className).toContain(SELECTED);
    expect(button('Video').className).not.toContain(SELECTED);
  });

  it('calls onOptionChange and moves the selection on click', () => {
    const onOptionChange = vi.fn();
    render(<ButtonIconSelect options={OPTIONS} onOptionChange={onOptionChange} />);
    fireEvent.click(button('Video'));
    expect(onOptionChange).toHaveBeenCalledWith('video');
    expect(button('Video').className).toContain(SELECTED);
  });

  it('handles clicks without an onOptionChange callback', () => {
    render(<ButtonIconSelect options={OPTIONS} />);
    expect(() => fireEvent.click(button('Video'))).not.toThrow();
    expect(button('Video').className).toContain(SELECTED);
  });

  it('renders icon-only options as square buttons with no text', () => {
    render(
      <ButtonIconSelect
        options={[
          { value: 'image', icon: ImageIcon },
          { value: 'music', icon: MusicIcon },
        ]}
      />,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    for (const b of buttons) {
      expect(b.textContent).toBe('');
      expect(b.className).toContain('w-9');
    }
  });

  it('still renders a clickable button for an option with a tooltip', () => {
    const onOptionChange = vi.fn();
    render(
      <ButtonIconSelect
        options={[
          ...OPTIONS,
          { value: 'music', icon: MusicIcon, text: 'Music', tooltip: 'Audio track' },
        ]}
        onOptionChange={onOptionChange}
      />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(3);
    fireEvent.click(button('Music'));
    expect(onOptionChange).toHaveBeenCalledWith('music');
  });

  it('applies buttonClassName to every button', () => {
    render(<ButtonIconSelect options={OPTIONS} buttonClassName="custom-btn" />);
    for (const b of screen.getAllByRole('button')) expect(b.className).toContain('custom-btn');
  });
});
