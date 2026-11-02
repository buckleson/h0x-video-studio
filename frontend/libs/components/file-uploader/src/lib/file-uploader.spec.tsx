import { act, fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { FileUploader } from './file-uploader';

// --- constants ---

const MB = 1024 * 1024;
const VENDOR_TEXT = /artcraft|getartcraft|storyteller|fakeyou|lightricks|\bltx\b/i;

// --- helpers ---

function makeFile(name: string, size: number, type = 'image/png'): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

function fileInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[type="file"]');
  if (!input) throw new Error('file input not found');
  return input as HTMLInputElement;
}

async function pick(input: HTMLInputElement, files: File[]) {
  await act(async () => {
    fireEvent.change(input, { target: { files } });
  });
}

describe('FileUploader', () => {
  it('renders the empty drop zone', () => {
    render(
      <FileUploader files={[]} fileTypes={['PNG']} handleChange={() => undefined} />,
    );
    expect(screen.getByText('Upload a file')).toBeTruthy();
  });

  it('lists every supported file type in the empty state', () => {
    render(
      <FileUploader
        files={[]}
        fileTypes={['PNG', 'JPG', 'WEBP']}
        handleChange={() => undefined}
      />,
    );
    expect(screen.getByText('PNG, JPG, WEBP supported')).toBeTruthy();
  });

  it('renders with no file types without crashing', () => {
    render(<FileUploader files={[]} fileTypes={[]} handleChange={() => undefined} />);
    expect(screen.getByText('Upload a file')).toBeTruthy();
  });

  it('shows the name and KB size of a single small file', () => {
    render(
      <FileUploader
        files={[makeFile('photo.png', 2048)]}
        fileTypes={['PNG']}
        handleChange={() => undefined}
      />,
    );
    expect(screen.getByText('photo')).toBeTruthy();
    expect(screen.getByText(/PHOTO file size: 2 KB/)).toBeTruthy();
    expect(screen.getByText('Change File')).toBeTruthy();
    expect(screen.queryByText('Upload a file')).toBeNull();
  });

  it('switches to MB at exactly 1 MB', () => {
    render(
      <FileUploader
        files={[makeFile('clip.png', MB)]}
        fileTypes={['PNG']}
        handleChange={() => undefined}
      />,
    );
    expect(screen.getByText(/file size: 1\.00 MB/)).toBeTruthy();
  });

  it('shows 0 KB for a file under 1 KB', () => {
    render(
      <FileUploader
        files={[makeFile('tiny.png', 10)]}
        fileTypes={['PNG']}
        handleChange={() => undefined}
      />,
    );
    expect(screen.getByText(/file size: 0 KB/)).toBeTruthy();
  });

  it('keeps inner dots in the display name and drops only the extension', () => {
    render(
      <FileUploader
        files={[makeFile('my.clip.final.png', 2048)]}
        fileTypes={['PNG']}
        handleChange={() => undefined}
      />,
    );
    expect(screen.getByText('my.clip.final')).toBeTruthy();
  });

  it('shows a count for several files', () => {
    render(
      <FileUploader
        files={[makeFile('a.png', 1), makeFile('b.png', 1)]}
        fileTypes={['PNG']}
        handleChange={() => undefined}
        multiple
      />,
    );
    expect(screen.getByText('2 files selected')).toBeTruthy();
    expect(screen.getByText('Change Files')).toBeTruthy();
  });

  it('normalizes a single picked file into an array', async () => {
    const handleChange = vi.fn();
    const { container } = render(
      <FileUploader files={[]} fileTypes={['PNG']} handleChange={handleChange} />,
    );
    const file = makeFile('photo.png', 2048);
    await pick(fileInput(container), [file]);
    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith([file]);
  });

  it('passes several picked files through as an array when multiple', async () => {
    const handleChange = vi.fn();
    const { container } = render(
      <FileUploader files={[]} fileTypes={['PNG']} handleChange={handleChange} multiple />,
    );
    const a = makeFile('a.png', 1024);
    const b = makeFile('b.png', 1024);
    await pick(fileInput(container), [a, b]);
    expect(handleChange).toHaveBeenCalledTimes(1);
    const arg = handleChange.mock.calls[0][0];
    expect(Array.isArray(arg)).toBe(true);
    expect(arg).toEqual([a, b]);
  });

  it('rejects a file whose extension is not in fileTypes', async () => {
    const handleChange = vi.fn();
    const { container } = render(
      <FileUploader files={[]} fileTypes={['PNG']} handleChange={handleChange} />,
    );
    await pick(fileInput(container), [makeFile('notes.txt', 10, 'text/plain')]);
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('matches the extension case-insensitively', async () => {
    const handleChange = vi.fn();
    const { container } = render(
      <FileUploader files={[]} fileTypes={['PNG']} handleChange={handleChange} />,
    );
    await pick(fileInput(container), [makeFile('SHOT.PNG', 10)]);
    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it('rejects a file over the 50 MB limit', async () => {
    const handleChange = vi.fn();
    const { container } = render(
      <FileUploader files={[]} fileTypes={['PNG']} handleChange={handleChange} />,
    );
    await pick(fileInput(container), [makeFile('huge.png', 51 * MB)]);
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('restricts the native picker to the given file types', () => {
    const { container } = render(
      <FileUploader files={[]} fileTypes={['PNG', 'JPG']} handleChange={() => undefined} />,
    );
    const input = fileInput(container);
    expect(input.getAttribute('accept')).toBe('.png,.jpg');
    expect(input.multiple).toBe(false);
  });

  it('adds no vendor brand text of its own', () => {
    const { container } = render(
      <FileUploader files={[]} fileTypes={['PNG']} handleChange={() => undefined} />,
    );
    expect(container.textContent).not.toMatch(VENDOR_TEXT);
  });
});
