/**
 * VES-TG-027: Telegram dogfood posture — tests
 *
 * Verifies the single activation authority used by both the boot gate and the
 * Settings read model. The dogfood profile parks Telegram; every other profile
 * (including the `full` default) activates it.
 */

import { describe, expect, it } from 'vitest';
import { resolveTelegramActivation } from '../src/routes/telegram';

describe('resolveTelegramActivation', () => {
  it('parks Telegram in the dogfood profile', () => {
    expect(resolveTelegramActivation('dogfood')).toEqual({ enabled: false, profile: 'dogfood' });
  });

  it('activates Telegram in the full profile', () => {
    expect(resolveTelegramActivation('full')).toEqual({ enabled: true, profile: 'full' });
  });

  it('defaults to full when the profile is unset', () => {
    expect(resolveTelegramActivation(undefined)).toEqual({ enabled: true, profile: 'full' });
  });
});
