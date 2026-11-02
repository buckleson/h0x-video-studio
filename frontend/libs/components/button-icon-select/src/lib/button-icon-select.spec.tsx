import { render, screen } from '@testing-library/react';
import { ImageIcon, VideoIcon } from 'lucide-react';

import { ButtonIconSelect } from './button-icon-select';

describe('ButtonIconSelect', () => {
  it('renders a button per option with its text', () => {
    render(
      <ButtonIconSelect
        options={[
          { value: 'image', icon: ImageIcon, text: 'Image' },
          { value: 'video', icon: VideoIcon, text: 'Video' },
        ]}
      />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.getByText('Image')).toBeTruthy();
    expect(screen.getByText('Video')).toBeTruthy();
  });
});
