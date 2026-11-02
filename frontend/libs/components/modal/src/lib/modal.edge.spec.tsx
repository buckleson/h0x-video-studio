import { fireEvent, render, screen, within } from '@testing-library/react';

import { Modal } from './modal';

const BRAND_LEAKS = /artcraft|getartcraft|storyteller\.ai|fakeyou/i;

const pressEscape = () => fireEvent.keyDown(document.body, { key: 'Escape' });

describe('Modal edge cases', () => {
  it('renders no dialog and does not call onClose when closed', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={false} title="Hidden" onClose={onClose}>
        <p>Hidden body</p>
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('Hidden body')).toBeNull();
    pressEscape();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen title="Closable" onClose={onClose}>
        <p>Body</p>
      </Modal>,
    );
    const buttons = within(screen.getByRole('dialog')).getAllByRole('button');
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders no close button when showClose is false', () => {
    render(
      <Modal isOpen title="No close" showClose={false} onClose={() => undefined}>
        <p>Body</p>
      </Modal>,
    );
    expect(within(screen.getByRole('dialog')).queryAllByRole('button')).toHaveLength(0);
  });

  it('falls back to a hidden "Dialog" accessible name when no title is given', () => {
    render(
      <Modal isOpen onClose={() => undefined}>
        <p>Untitled body</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog', { name: 'Dialog' })).toBeTruthy();
  });

  it('uses accessibleTitle as the dialog name when no title is given', () => {
    render(
      <Modal isOpen accessibleTitle="Export settings" onClose={() => undefined}>
        <p>Body</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog', { name: 'Export settings' })).toBeTruthy();
  });

  it('calls onClose on Escape by default', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen title="Esc" onClose={onClose}>
        <p>Body</p>
      </Modal>,
    );
    pressEscape();
    expect(onClose).toHaveBeenCalled();
  });

  it('ignores Escape when closeOnEsc is false', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen title="No esc" closeOnEsc={false} onClose={onClose}>
        <p>Body</p>
      </Modal>,
    );
    pressEscape();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('lets an open outside-safe panel claim Escape', () => {
    const onClose = vi.fn();
    render(
      <>
        <Modal isOpen title="With panel" onClose={onClose}>
          <p>Body</p>
        </Modal>
        <div data-modal-outside-safe="">autocomplete</div>
      </>,
    );
    pressEscape();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('toggles the expand button label when expandable', () => {
    render(
      <Modal isOpen title="Big" expandable onClose={() => undefined}>
        <p>Body</p>
      </Modal>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Expand modal' }));
    expect(screen.getByRole('button', { name: 'Restore modal size' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Restore modal size' }));
    expect(screen.getByRole('button', { name: 'Expand modal' })).toBeTruthy();
  });

  it('shows no brand names in its own visible strings', () => {
    render(
      <Modal isOpen expandable onClose={() => undefined}>
        <p>Body</p>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent ?? '').not.toMatch(BRAND_LEAKS);
    for (const el of dialog.querySelectorAll('[aria-label],[title]')) {
      expect(`${el.getAttribute('aria-label')} ${el.getAttribute('title')}`).not.toMatch(
        BRAND_LEAKS,
      );
    }
  });
});
