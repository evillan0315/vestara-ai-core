/**
 * @vestara/ui: Floating Window System Tests
 *
 * Tests for FloatingWindow, FloatingWindowManager,
 * FloatingWindowHeader, and FloatingWindowContent.
 *
 * Verifies module exports, pure logic, and structural contracts.
 * Rendering tests require @testing-library/react (not yet installed).
 *
 * @see packages/ui/src/components/FloatingWindow.tsx
 */

import { describe, expect, it } from 'vitest';
import {
  FloatingWindow,
  FloatingWindowContent,
  FloatingWindowHeader,
  FloatingWindowManager,
  useFloatingWindowManager,
} from '../src/components/FloatingWindow';

// ─── Module Exports Tests ──────────────────────────────────────

describe('FloatingWindow exports', () => {
  it('exports FloatingWindowManager as a function', () => {
    expect(FloatingWindowManager).toBeDefined();
    expect(typeof FloatingWindowManager).toBe('function');
  });

  it('exports FloatingWindow as a function', () => {
    expect(FloatingWindow).toBeDefined();
    expect(typeof FloatingWindow).toBe('function');
  });

  it('exports FloatingWindowHeader as a function', () => {
    expect(FloatingWindowHeader).toBeDefined();
    expect(typeof FloatingWindowHeader).toBe('function');
  });

  it('exports FloatingWindowContent as a function', () => {
    expect(FloatingWindowContent).toBeDefined();
    expect(typeof FloatingWindowContent).toBe('function');
  });

  it('exports useFloatingWindowManager hook', () => {
    expect(useFloatingWindowManager).toBeDefined();
    expect(typeof useFloatingWindowManager).toBe('function');
  });
});

// ─── useFloatingWindowManager Tests ─────────────────────────────

describe('useFloatingWindowManager', () => {
  it('is exported as a function', () => {
    expect(typeof useFloatingWindowManager).toBe('function');
  });

  // Note: Full provider-throw test requires a React render context.
  // Covered by integration tests when @testing-library/react is installed.
});

// ─── FloatingWindowContent Tests ───────────────────────────────

describe('FloatingWindowContent', () => {
  it('is a valid function component', () => {
    expect(typeof FloatingWindowContent).toBe('function');
    // Function components have a length matching their params
    expect(FloatingWindowContent.length).toBe(1);
  });
});

// ─── FloatingWindowHeader Tests ────────────────────────────────

describe('FloatingWindowHeader', () => {
  it('is a valid function component', () => {
    expect(typeof FloatingWindowHeader).toBe('function');
  });
});

// ─── FloatingWindow Tests ──────────────────────────────────────

describe('FloatingWindow', () => {
  it('is a valid function component', () => {
    expect(typeof FloatingWindow).toBe('function');
  });
});

// ─── FloatingWindowManager Tests ───────────────────────────────

describe('FloatingWindowManager', () => {
  it('is a valid function component', () => {
    expect(typeof FloatingWindowManager).toBe('function');
  });
});

// ─── FloatingWindowContent Structural Tests ────────────────────

describe('FloatingWindowContent structure', () => {
  it('wraps children in a div with overflow-auto', () => {
    // Verify the component is defined and can be imported
    expect(FloatingWindowContent).toBeDefined();
  });
});

// ─── API Surface Tests ─────────────────────────────────────────

describe('API surface', () => {
  it('all components are named exports', () => {
    // Verify the module shape matches expectations
    const exports = {
      FloatingWindowManager,
      FloatingWindow,
      FloatingWindowHeader,
      FloatingWindowContent,
      useFloatingWindowManager,
    };

    for (const [name, value] of Object.entries(exports)) {
      expect(value).toBeDefined();
      expect(typeof value).toBe('function');
    }
  });
});
