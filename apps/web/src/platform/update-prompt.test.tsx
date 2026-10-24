import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setPlatformForTests } from './index';
import type { AvailableUpdate, Platform } from './types';
import { UpdatePrompt } from './update-prompt';
import { createWebPlatform } from './web';

function desktop(update: AvailableUpdate | null, health: object = {}): Platform {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        Response.json({ status: 'ok', simulationVersion: 1, environment: 'test', ...health }),
      ),
    ),
  );
  return {
    ...createWebPlatform('https://playwhip.com'),
    kind: 'desktop',
    isDesktop: true,
    appVersion: '0.1.0',
    checkForUpdates: () => Promise.resolve(update),
  };
}

const update = (install = vi.fn(() => Promise.resolve())): AvailableUpdate => ({
  version: '0.2.0',
  currentVersion: '0.1.0',
  notes: null,
  date: null,
  install,
});

describe('UpdatePrompt', () => {
  afterEach(() => {
    setPlatformForTests(null);
    vi.unstubAllGlobals();
  });

  it('renders nothing on the web', async () => {
    setPlatformForTests(createWebPlatform(''));
    const { container } = render(<UpdatePrompt />);
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it('offers "restart to update" and installs on click', async () => {
    const install = vi.fn(() => Promise.resolve());
    setPlatformForTests(desktop(update(install)));
    render(<UpdatePrompt />);
    expect(await screen.findByText('Update available')).toBeInTheDocument();
    expect(screen.getByText('v0.2.0')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Restart to update' }));
    expect(install).toHaveBeenCalledOnce();
    expect(await screen.findByText('Installing — WHIP will restart')).toBeInTheDocument();
  });

  it('installs with the U keycap shortcut', async () => {
    const install = vi.fn(() => Promise.resolve());
    setPlatformForTests(desktop(update(install)));
    render(<UpdatePrompt />);
    await screen.findByText('Update available');
    await userEvent.keyboard('u');
    expect(install).toHaveBeenCalledOnce();
  });

  it('blocks play when the server requires a newer client', async () => {
    setPlatformForTests(desktop(update(), { apiVersion: '1.1.0', minDesktopVersion: '0.2.0' }));
    render(<UpdatePrompt />);
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Update required');
    expect(screen.getByRole('button', { name: 'Quit' })).toBeInTheDocument();
  });
});
