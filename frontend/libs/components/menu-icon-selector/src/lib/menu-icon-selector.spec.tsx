import { fireEvent, render, screen } from '@testing-library/react';

import DefaultMenuIconSelector, { MenuIconSelector, type MenuIconItem } from './menu-icon-selector';
import * as lib from '../index';

const ITEMS: MenuIconItem[] = [
  { id: 'image', label: 'Image', icon: <span>I</span> },
  { id: 'video', label: 'Video', icon: <span>V</span> },
];

describe('MenuIconSelector', () => {
  it('renders one button per item and reports the clicked id', () => {
    const onMenuChange = vi.fn();
    render(
      <MenuIconSelector
        menuItems={[
          { id: 'image', label: 'Image', icon: <span>I</span> },
          { id: 'video', label: 'Video', icon: <span>V</span> },
        ]}
        activeMenu="image"
        onMenuChange={onMenuChange}
      />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(2);
    fireEvent.click(screen.getByText('V'));
    expect(onMenuChange).toHaveBeenCalledWith('video');
  });

  it('is exported by name from the lib entry and matches the default export', () => {
    expect(lib.MenuIconSelector).toBeDefined();
    expect(lib.MenuIconSelector).toBe(MenuIconSelector);
    expect(DefaultMenuIconSelector).toBe(MenuIconSelector);
  });

  it('empty menuItems renders no buttons and does not throw', () => {
    render(<MenuIconSelector menuItems={[]} activeMenu="" onMenuChange={vi.fn()} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('unknown activeMenu still renders every item and stays clickable', () => {
    const onMenuChange = vi.fn();
    render(<MenuIconSelector menuItems={ITEMS} activeMenu="missing" onMenuChange={onMenuChange} />);
    expect(screen.getAllByRole('button')).toHaveLength(2);
    fireEvent.click(screen.getByText('I'));
    expect(onMenuChange).toHaveBeenCalledWith('image');
  });

  it('active item gets the active text class, others the muted class', () => {
    render(<MenuIconSelector menuItems={ITEMS} activeMenu="video" onMenuChange={vi.fn()} />);
    const [image, video] = screen.getAllByRole('button');
    expect(video.className).toContain('text-base-fg');
    expect(video.className).not.toContain('text-base-fg/70');
    expect(image.className).toContain('text-base-fg/70');
  });

  it('disabled: all buttons disabled and clicks are not reported', () => {
    const onMenuChange = vi.fn();
    render(
      <MenuIconSelector
        menuItems={ITEMS}
        activeMenu="image"
        onMenuChange={onMenuChange}
        disabled
        disabledMessage="Busy"
      />,
    );
    const buttons = screen.getAllByRole('button') as HTMLButtonElement[];
    expect(buttons).toHaveLength(2);
    buttons.forEach((b) => expect(b.disabled).toBe(true));
    fireEvent.click(screen.getByText('V'));
    expect(onMenuChange).not.toHaveBeenCalled();
  });

  it('buttons are type=button so they never submit a surrounding form', () => {
    render(<MenuIconSelector menuItems={ITEMS} activeMenu="image" onMenuChange={vi.fn()} />);
    screen.getAllByRole('button').forEach((b) => expect(b.getAttribute('type')).toBe('button'));
  });
});
