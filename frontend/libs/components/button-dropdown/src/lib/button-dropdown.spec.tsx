import { act, fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { ButtonDropdown } from './button-dropdown';

// --- constants ---

const VENDOR_TEXT = /artcraft|getartcraft|storyteller|fakeyou|lightricks|\bltx\b/i;

// The shared Modal is a Radix + react-spring dialog; flatten it so the
// dialog path is deterministic in jsdom.
vi.mock('@storyteller/ui-modal', () => ({
  Modal: ({
    isOpen,
    title,
    children,
  }: {
    isOpen: boolean;
    title?: string;
    children?: React.ReactNode;
  }) =>
    isOpen ? (
      <div role="dialog" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    ) : null,
}));

// --- helpers ---

async function openMenu(label: string) {
  const trigger = screen.getByRole('button', { name: label });
  await act(async () => {
    fireEvent.click(trigger);
  });
}

async function choose(text: string) {
  const item = await screen.findByText(text);
  await act(async () => {
    fireEvent.click(item);
  });
}

// jsdom has no ResizeObserver; Headless UI calls it when a menu opens.
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() {}
    unobserve() {}
  });
});

describe('ButtonDropdown', () => {
  it('renders its label', () => {
    render(
      <ButtonDropdown label="Export" options={[{ label: 'As MP4' }]} />,
    );
    expect(screen.getByRole('button', { name: 'Export' })).toBeTruthy();
  });

  it('keeps options hidden while the menu is closed', () => {
    render(<ButtonDropdown label="Export" options={[{ label: 'As MP4' }]} />);
    expect(screen.queryByText('As MP4')).toBeNull();
  });

  it('shows every option and its description once opened', async () => {
    render(
      <ButtonDropdown
        label="Export"
        options={[
          { label: 'As MP4', description: 'H.264' },
          { label: 'As GIF' },
        ]}
      />,
    );
    await openMenu('Export');
    expect(await screen.findByText('As MP4')).toBeTruthy();
    expect(screen.getByText('As GIF')).toBeTruthy();
    expect(screen.getByText('H.264')).toBeTruthy();
  });

  it('calls the option onClick when an option is chosen', async () => {
    const onClick = vi.fn();
    render(<ButtonDropdown label="Export" options={[{ label: 'As MP4', onClick }]} />);
    await openMenu('Export');
    await choose('As MP4');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders a disabled option as a disabled button', async () => {
    render(
      <ButtonDropdown label="Export" options={[{ label: 'As MOV', disabled: true }]} />,
    );
    await openMenu('Export');
    const option = (await screen.findByText('As MOV')).closest('button');
    expect(option).not.toBeNull();
    expect(option?.disabled).toBe(true);
  });

  it('opens a dialog with the option dialog title and content', async () => {
    const onDialogOpen = vi.fn();
    render(
      <ButtonDropdown
        label="Project"
        options={[
          {
            label: 'Delete',
            onDialogOpen,
            dialogProps: {
              title: 'Delete project?',
              content: <p>This cannot be undone.</p>,
              confirmButtonProps: { label: 'Delete it' },
              closeButtonProps: { label: 'Keep it' },
            },
          },
        ]}
      />,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    await openMenu('Project');
    await choose('Delete');
    expect(onDialogOpen).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog', { name: 'Delete project?' })).toBeTruthy();
    expect(screen.getByText('This cannot be undone.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete it' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Keep it' })).toBeTruthy();
  });

  it('closes the dialog and fires onClose from the close button', async () => {
    const onClose = vi.fn();
    render(
      <ButtonDropdown
        label="Project"
        options={[
          {
            label: 'Delete',
            dialogProps: {
              title: 'Delete project?',
              content: null,
              closeButtonProps: { label: 'Keep it' },
              onClose,
            },
          },
        ]}
      />,
    );
    await openMenu('Project');
    await choose('Delete');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('hides the close button when showClose is false', async () => {
    render(
      <ButtonDropdown
        label="Project"
        options={[
          {
            label: 'Delete',
            dialogProps: {
              title: 'Delete project?',
              content: null,
              showClose: false,
              closeButtonProps: { label: 'Keep it' },
            },
          },
        ]}
      />,
    );
    await openMenu('Project');
    await choose('Delete');
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Keep it' })).toBeNull();
  });

  it('falls back to "Confirm" when the confirm button has no label', async () => {
    const onConfirm = vi.fn();
    render(
      <ButtonDropdown
        label="Project"
        options={[
          {
            label: 'Reset',
            dialogProps: {
              title: 'Reset?',
              content: null,
              confirmButtonProps: { onClick: onConfirm },
            },
          },
        ]}
      />,
    );
    await openMenu('Project');
    await choose('Reset');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders with an empty options list without crashing', () => {
    render(<ButtonDropdown label="Export" options={[]} />);
    expect(screen.getByRole('button', { name: 'Export' })).toBeTruthy();
  });

  it('adds no vendor brand text of its own', async () => {
    const { baseElement } = render(
      <ButtonDropdown label="Export" options={[{ label: 'As MP4' }]} />,
    );
    await openMenu('Export');
    expect(baseElement.textContent).not.toMatch(VENDOR_TEXT);
  });
});
