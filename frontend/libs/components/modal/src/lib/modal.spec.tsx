import { render, screen } from '@testing-library/react';

import { Modal } from './modal';

describe('Modal', () => {
  it('renders title and children when open', () => {
    render(
      <Modal isOpen title="Test Modal" onClose={() => undefined}>
        <p>Modal body</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Test Modal')).toBeTruthy();
    expect(screen.getByText('Modal body')).toBeTruthy();
  });
});
