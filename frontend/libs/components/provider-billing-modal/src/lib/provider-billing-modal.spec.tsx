import { act, render, screen } from '@testing-library/react';
import { GenerationProvider } from '@storyteller/common';

import DefaultProviderBillingModal, { ProviderBillingModal } from './provider-billing-modal';
import * as lib from '../index';

const BRAND_LEAK = /artcraft|getartcraft|storyteller\.ai|fakeyou|\bLTX\b|lightricks/i;

const EXPECTED_NAMES: Partial<Record<GenerationProvider, string>> = {
  [GenerationProvider.Fal]: 'Fal',
  [GenerationProvider.Higgsfield]: 'Higgsfield',
  [GenerationProvider.Krea]: 'Krea',
  [GenerationProvider.Leonardo]: 'Leonardo',
  [GenerationProvider.Magnific]: 'Magnific',
  [GenerationProvider.Openart]: 'OpenArt',
  [GenerationProvider.Picsart]: 'Picsart',
  [GenerationProvider.Pixverse]: 'PixVerse',
  [GenerationProvider.Runway]: 'Runway',
};

const mocks = vi.hoisted(() => ({
  onBilling: (_event: { provider: unknown }) => {},
}));

vi.mock('@storyteller/tauri-events', () => ({
  useShowProviderBillingModalEvent: (callback: typeof mocks.onBilling) => {
    mocks.onBilling = callback;
  },
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@storyteller/ui-modal', () => ({
  Modal: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div role="dialog">{children}</div> : null,
}));

describe('ProviderBillingModal', () => {
  it('opens with the provider setup heading when the billing event fires', async () => {
    render(<ProviderBillingModal />);
    expect(screen.queryByRole('dialog')).toBeNull();
    await act(async () => mocks.onBilling({ provider: GenerationProvider.Fal }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2 }).textContent).toMatch(/^Set up \w+/);
  });

  it('is exported by name from the lib entry and matches the default export', () => {
    expect(lib.ProviderBillingModal).toBeDefined();
    expect(lib.ProviderBillingModal).toBe(ProviderBillingModal);
    expect(DefaultProviderBillingModal).toBe(ProviderBillingModal);
  });

  it('renders nothing visible before any event, even with isVideoPage', () => {
    const { container } = render(<ProviderBillingModal isVideoPage />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it.each(Object.entries(EXPECTED_NAMES))(
    '%s shows "Set up <name>" with no brand leak',
    async (provider, name) => {
      render(<ProviderBillingModal />);
      await act(async () => mocks.onBilling({ provider }));
      const dialog = screen.getByRole('dialog');
      expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(`Set up ${name}`);
      expect(dialog.textContent).toContain('H0x Video Studio');
      expect(dialog.textContent).not.toMatch(BRAND_LEAK);
    },
  );

  it('a second event switches the heading to the new provider', async () => {
    render(<ProviderBillingModal />);
    await act(async () => mocks.onBilling({ provider: GenerationProvider.Fal }));
    await act(async () => mocks.onBilling({ provider: GenerationProvider.Runway }));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Set up Runway');
  });
});
