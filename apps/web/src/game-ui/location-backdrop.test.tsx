import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { uiSound } from '../features/audio/use-ui-sound';
import { CAMPAIGN_ID } from '../mocks/fixtures';
import { useSettingsStore } from '../stores/settings-store';
import { renderApp } from '../test/render-app';
import { LocationBackdrop } from './location-backdrop';
import { SCENES, type SceneKey } from './scenes';
import { PLACES } from './places';

const backdrop = () => screen.getByTestId('location-backdrop');
const images = () => [...backdrop().querySelectorAll('img')];

beforeEach(() => useSettingsStore.setState({ motion: 'reduced' }));
afterEach(() => {
  vi.restoreAllMocks();
  useSettingsStore.setState({ motion: 'system' });
});

describe('LocationBackdrop', () => {
  it.each(PLACES.map((p) => p.key))('paints the %s with its own picture, 960w first', (key) => {
    render(<LocationBackdrop scene={key} />);
    expect(backdrop()).toHaveAttribute('aria-hidden', 'true');
    expect(backdrop()).toHaveAttribute('data-scene', key);
    const [img, ...rest] = images();
    expect(rest).toHaveLength(0); // only the current scene is fetched
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveAttribute('aria-hidden', 'true');
    expect(img).toHaveAttribute('src', SCENES[key].src960);
    expect(img?.getAttribute('srcset')).toContain(`${SCENES[key].src960} 960w`);
    expect(img?.getAttribute('srcset')).toContain(`${SCENES[key].src} 1672w`);
    expect(img?.getAttribute('src')).toMatch(new RegExp(`${key}-960\\.webp`));
  });

  it('shows plain ink until the picture loads, then swaps without a fade under reduced motion', () => {
    const { rerender } = render(<LocationBackdrop scene="office" />);
    expect(backdrop()).toHaveClass('bg-ink');
    expect(images()[0]).toHaveClass('opacity-0');
    fireEvent.load(images()[0]!);
    expect(images()[0]).toHaveClass('opacity-100');
    expect(images()[0]).not.toHaveClass('transition-opacity');

    rerender(<LocationBackdrop scene="chamber" />);
    // The office stays up until the chamber has loaded: never a flash of empty ink between tabs.
    expect(images().map((i) => i.dataset.scene)).toEqual(['office', 'chamber']);
    fireEvent.load(images()[1]!);
    expect(images().map((i) => i.dataset.scene)).toEqual(['chamber']);
  });

  it('cross-fades when motion is allowed', async () => {
    useSettingsStore.setState({ motion: 'full' });
    const { rerender } = render(<LocationBackdrop scene="office" />);
    fireEvent.load(images()[0]!);
    rerender(<LocationBackdrop scene="archive" />);
    const incoming = images()[1]!;
    expect(incoming).toHaveClass('transition-opacity', 'opacity-0');
    fireEvent.load(incoming);
    expect(incoming).toHaveClass('opacity-100');
    await waitFor(() => expect(images().map((i) => i.dataset.scene)).toEqual(['archive']));
  });

  it('has a painting for every scene, including the division lobby', () => {
    const keys: SceneKey[] = [...PLACES.map((p) => p.key), 'division-lobby'];
    for (const k of keys) expect(SCENES[k].src).toMatch(/\.webp$/);
  });
});

describe('the game shell backdrop', () => {
  it('follows the current tab', async () => {
    vi.spyOn(uiSound, 'click').mockReturnValue(true);
    const user = userEvent.setup();
    renderApp(`/c/${CAMPAIGN_ID}`);
    await screen.findByRole('heading', { name: 'Office', level: 1 });
    expect(backdrop()).toHaveAttribute('data-scene', 'office');
    await user.keyboard('4');
    await screen.findByRole('heading', { name: 'Party HQ', level: 1 });
    expect(backdrop()).toHaveAttribute('data-scene', 'party-hq');
  });
});
