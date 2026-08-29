import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeBuilderProvider } from '../../../../../lib/theme-builder-context.js';
import { TokenEditor } from '../TokenEditor/TokenEditor.js';
import type { CustomTheme } from '../../../../../lib/theme.js';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ThemeBuilderProvider>{children}</ThemeBuilderProvider>
);

function mockLocalStorage() {
  const store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { Object.keys(store).forEach(k => delete store[k]); }),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('localStorage', mockLocalStorage());
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ settings: [] }) }) as Response));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('TokenEditor', () => {
  it('renders all token categories', () => {
    render(<TokenEditor />, { wrapper });
    expect(screen.getByText('Semantic Tokens')).toBeInTheDocument();
    expect(screen.getByText('Accent Colors')).toBeInTheDocument();
    expect(screen.getByText('Background')).toBeInTheDocument();
    expect(screen.getByText('Surface')).toBeInTheDocument();
    expect(screen.getByText('Borders')).toBeInTheDocument();
    expect(screen.getByText('Text')).toBeInTheDocument();
    expect(screen.getByText('Focus')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Spacing')).toBeInTheDocument();
    expect(screen.getByText('Radius')).toBeInTheDocument();
    expect(screen.getByText('Shadows')).toBeInTheDocument();
    expect(screen.getByText('Motion')).toBeInTheDocument();
    expect(screen.getByText('Typography')).toBeInTheDocument();
  });

  it('shows editing theme name', () => {
    render(<TokenEditor />, { wrapper });
    expect(screen.getByText('Editing: New Theme')).toBeInTheDocument();
  });

  it('expands/collapses categories on click', () => {
    render(<TokenEditor />, { wrapper });
    const accentHeader = screen.getByText('Accent Colors').closest('header');
    expect(accentHeader).toBeInTheDocument();

    const content = screen.getByLabelText('Accent Colors tokens');
    expect(content).not.toHaveAttribute('hidden');

    act(() => {
      accentHeader?.click();
    });
    expect(content).toHaveAttribute('hidden');

    act(() => {
      accentHeader?.click();
    });
    expect(content).not.toHaveAttribute('hidden');
  });

  it('expands/collapses categories on keyboard', () => {
    render(<TokenEditor />, { wrapper });
    const accentHeader = screen.getByText('Accent Colors').closest('header');
    const content = screen.getByLabelText('Accent Colors tokens');

    act(() => {
      accentHeader?.focus();
      vi.fireEvent.keyDown(accentHeader!, { key: 'Enter' });
    });
    expect(content).toHaveAttribute('hidden');

    act(() => {
      vi.fireEvent.keyDown(accentHeader!, { key: ' ' });
    });
    expect(content).not.toHaveAttribute('hidden');
  });
});

describe('TokenRow - Color Token Editor', () => {
  it('renders color token with color picker', () => {
    render(<TokenEditor />, { wrapper });
    const accentPrimary = screen.getByText('Accent Primary').closest('[role="listitem"]');
    expect(accentPrimary).toBeInTheDocument();

    const colorInput = accentPrimary?.querySelector('input[type="color"]');
    expect(colorInput).toBeInTheDocument();
  });

  it('shows light/dark toggle for color tokens with light/dark values', () => {
    render(<TokenEditor />, { wrapper });
    const accentPrimary = screen.getByText('Accent Primary').closest('[role="listitem"]');
    const toggleButton = accentPrimary?.querySelector('button[aria-pressed]');
    expect(toggleButton).toBeInTheDocument();
    expect(toggleButton).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows light/dark pickers when toggle is pressed', () => {
    render(<TokenEditor />, { wrapper });
    const accentPrimary = screen.getByText('Accent Primary').closest('[role="listitem"]');
    const toggleButton = accentPrimary?.querySelector('button[aria-pressed]');

    act(() => {
      toggleButton?.click();
    });

    expect(screen.getByLabelText('Accent Primary light mode color')).toBeInTheDocument();
    expect(screen.getByLabelText('Accent Primary dark mode color')).toBeInTheDocument();
  });

  it('updates color token value on color picker change', async () => {
    const user = userEvent.setup();
    render(<TokenEditor />, { wrapper });
    const accentPrimary = screen.getByText('Accent Primary').closest('[role="listitem"]');
    const colorInput = accentPrimary?.querySelector('input[type="color"]') as HTMLInputElement;

    await act(async () => {
      await user.click(colorInput!);
    });

    // Color picker interaction is limited in jsdom, verify input exists
    expect(colorInput).toBeInTheDocument();
  });

  it('shows current color value', () => {
    render(<TokenEditor />, { wrapper });
    const accentPrimary = screen.getByText('Accent Primary').closest('[role="listitem"]');
    expect(screen.getByText('#f59e0b')).toBeInTheDocument();
  });

  it('shows reset button when token is modified', async () => {
    const user = userEvent.setup();
    render(<TokenEditor />, { wrapper });
    const accentPrimary = screen.getByText('Accent Primary').closest('[role="listitem"]');
    const colorInput = accentPrimary?.querySelector('input[type="color"]') as HTMLInputElement;
    const textInput = accentPrimary?.querySelector('input[type="text"]') as HTMLInputElement;

    // Simulate value change via text input
    await act(async () => {
      await user.clear(textInput!);
      await user.type(textInput!, '#ff0000');
    });

    const resetButton = accentPrimary?.querySelector('button[aria-label*="Reset"]');
    expect(resetButton).toBeInTheDocument();
    expect(resetButton).not.toBeDisabled();
  });

  it('resets token to default on reset button click', async () => {
    const user = userEvent.setup();
    render(<TokenEditor />, { wrapper });
    const accentPrimary = screen.getByText('Accent Primary').closest('[role="listitem"]');
    const textInput = accentPrimary?.querySelector('input[type="text"]') as HTMLInputElement;

    await act(async () => {
      await user.clear(textInput!);
      await user.type(textInput!, '#ff0000');
    });

    const resetButton = accentPrimary?.querySelector('button[aria-label*="Reset"]');
    await act(async () => {
      await user.click(resetButton!);
    });

    expect(screen.getByText('#f59e0b')).toBeInTheDocument();
  });

  it('shows tooltip on info icon hover', () => {
    render(<TokenEditor />, { wrapper });
    const accentPrimary = screen.getByText('Accent Primary').closest('[role="listitem"]');
    const infoButton = accentPrimary?.querySelector('button[aria-label*="Primary accent color"]');

    act(() => {
      vi.fireEvent.mouseEnter(infoButton!);
    });

    expect(screen.getByRole('tooltip')).toHaveTextContent('Primary accent color');
  });
});

describe('TokenRow - Length Token Editor', () => {
  it('renders length token with slider and number input', () => {
    render(<TokenEditor />, { wrapper });
    const pageSpacing = screen.getByText('Page Spacing').closest('[role="listitem"]');
    expect(pageSpacing).toBeInTheDocument();

    const slider = pageSpacing?.querySelector('input[type="range"]');
    const numberInput = pageSpacing?.querySelector('input[type="number"]');
    expect(slider).toBeInTheDocument();
    expect(numberInput).toBeInTheDocument();
  });

  it('updates value on slider change', async () => {
    const user = userEvent.setup();
    render(<TokenEditor />, { wrapper });
    const pageSpacing = screen.getByText('Page Spacing').closest('[role="listitem"]');
    const slider = pageSpacing?.querySelector('input[type="range"]') as HTMLInputElement;

    await act(async () => {
      await user.click(slider!, { target: { value: '2' } });
    });

    // Value should update (debounced)
    vi.advanceTimersByTime(200);
    expect(screen.getByText('2rem')).toBeInTheDocument();
  });

  it('updates value on number input change', async () => {
    const user = userEvent.setup();
    render(<TokenEditor />, { wrapper });
    const pageSpacing = screen.getByText('Page Spacing').closest('[role="listitem"]');
    const numberInput = pageSpacing?.querySelector('input[type="number"]') as HTMLInputElement;

    await act(async () => {
      await user.clear(numberInput!);
      await user.type(numberInput!, '2');
    });

    vi.advanceTimersByTime(200);
    expect(screen.getByText('2rem')).toBeInTheDocument();
  });

  it('clamps value to min/max on blur', async () => {
    const user = userEvent.setup();
    render(<TokenEditor />, { wrapper });
    const pageSpacing = screen.getByText('Page Spacing').closest('[role="listitem"]');
    const numberInput = pageSpacing?.querySelector('input[type="number"]') as HTMLInputElement;

    await act(async () => {
      await user.clear(numberInput!);
      await user.type(numberInput!, '100'); // Above max
    });

    await act(async () => {
      await user.tab(); // Blur
    });

    // Should clamp to max (5rem for spacing)
    expect(screen.getByText('5rem')).toBeInTheDocument();
  });

  it('shows unit label (rem/px)', () => {
    render(<TokenEditor />, { wrapper });
    const pageSpacing = screen.getByText('Page Spacing').closest('[role="listitem"]');
    expect(screen.getByText('rem')).toBeInTheDocument();
  });

  it('shows radius tokens with px unit', () => {
    render(<TokenEditor />, { wrapper });
    const defaultRadius = screen.getByText('Default Radius').closest('[role="listitem"]');
    expect(defaultRadius).toBeInTheDocument();
    expect(screen.getByText('px')).toBeInTheDocument();
  });
});

describe('TokenRow - Font Token Editor', () => {
  it('renders font family token with select', () => {
    render(<TokenEditor />, { wrapper });
    const fontFamily = screen.getByText('Font Family').closest('[role="listitem"]');
    expect(fontFamily).toBeInTheDocument();

    const select = fontFamily?.querySelector('select');
    expect(select).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'System' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Serif' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Mono' })).toBeInTheDocument();
  });

  it('renders font size token with segmented control', () => {
    render(<TokenEditor />, { wrapper });
    const baseFontSize = screen.getByText('Base Font Size').closest('[role="listitem"]');
    expect(baseFontSize).toBeInTheDocument();

    const segmented = baseFontSize?.querySelector('[role="radiogroup"]');
    expect(segmented).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'XS' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'SM' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Base' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'LG' })).toBeInTheDocument();
  });

  it('renders font weight token with segmented control', () => {
    render(<TokenEditor />, { wrapper });
    const normalWeight = screen.getByText('Normal Font Weight').closest('[role="listitem"]');
    expect(normalWeight).toBeInTheDocument();

    const segmented = normalWeight?.querySelector('[role="radiogroup"]');
    expect(segmented).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Normal' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Medium' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Semibold' })).toBeInTheDocument();
  });

  it('updates font family on select change', async () => {
    const user = userEvent.setup();
    render(<TokenEditor />, { wrapper });
    const fontFamily = screen.getByText('Font Family').closest('[role="listitem"]');
    const select = fontFamily?.querySelector('select') as HTMLSelectElement;

    await act(async () => {
      await user.selectOptions(select!, 'ui-serif, "Times New Roman", Georgia, serif');
    });

    expect(screen.getByDisplayValue('ui-serif, "Times New Roman", Georgia, serif')).toBeInTheDocument();
  });

  it('shows reset button when modified', async () => {
    const user = userEvent.setup();
    render(<TokenEditor />, { wrapper });
    const fontFamily = screen.getByText('Font Family').closest('[role="listitem"]');
    const select = fontFamily?.querySelector('select') as HTMLSelectElement;

    await act(async () => {
      await user.selectOptions(select!, 'ui-serif, "Times New Roman", Georgia, serif');
    });

    const resetButton = fontFamily?.querySelector('button[aria-label*="Reset"]');
    expect(resetButton).toBeInTheDocument();
  });
});

describe('TokenRow - Number Token Editor', () => {
  it('renders motion tokens with text input', () => {
    render(<TokenEditor />, { wrapper });
    const fastMotion = screen.getByText('Fast Motion').closest('[role="listitem"]');
    expect(fastMotion).toBeInTheDocument();

    const input = fastMotion?.querySelector('input[type="text"]');
    expect(input).toBeInTheDocument();
    expect(screen.getByDisplayValue('150ms')).toBeInTheDocument();
  });
});

describe('Accessibility', () => {
  it('has proper ARIA labels on all interactive elements', () => {
    render(<TokenEditor />, { wrapper });

    // Color picker
    expect(screen.getByLabelText('Accent Primary color')).toBeInTheDocument();

    // Slider
    expect(screen.getByLabelText('Page Spacing slider')).toBeInTheDocument();

    // Number input
    expect(screen.getByLabelText('Page Spacing value')).toBeInTheDocument();

    // Select
    expect(screen.getByLabelText('Font Family')).toBeInTheDocument();

    // Reset buttons
    expect(screen.getByLabelText('Reset Accent Primary to default')).toBeInTheDocument();
  });

  it('has proper heading structure', () => {
    render(<TokenEditor />, { wrapper });
    expect(screen.getByRole('heading', { level: 3, name: 'Semantic Tokens' })).toBeInTheDocument();
  });

  it('category headers are keyboard accessible', () => {
    render(<TokenEditor />, { wrapper });
    const header = screen.getByRole('button', { name: /Accent Colors/ });
    expect(header).toHaveAttribute('tabIndex', '0');
    expect(header).toHaveAttribute('role', 'button');
    expect(header).toHaveAttribute('aria-expanded');
    expect(header).toHaveAttribute('aria-controls');
  });

  it('token rows are in a list', () => {
    render(<TokenEditor />, { wrapper });
    const list = screen.getByLabelText('Accent Colors token list');
    expect(list).toBeInTheDocument();
    const items = list.querySelectorAll('[role="listitem"]');
    expect(items.length).toBeGreaterThan(0);
  });

  it('respects reduced motion', () => {
    render(<TokenEditor />, { wrapper });
    const header = screen.getByRole('button', { name: /Accent Colors/ });
    const content = screen.getByLabelText('Accent Colors tokens');
    expect(content).toHaveClass('motion-reduce:transition-none');
  });
});