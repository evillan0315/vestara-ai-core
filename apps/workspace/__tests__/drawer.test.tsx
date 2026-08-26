import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Drawer } from '../src/components/ui/Drawer.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// jsdom lacks PointerEvent; polyfill from MouseEvent so resize drags work.
class PointerEventPolyfill extends MouseEvent {
  pointerId: number;
  constructor(type: string, params: MouseEventInit & { pointerId?: number } = {}) {
    super(type, params);
    this.pointerId = params.pointerId ?? 1;
  }
}

describe('Drawer', () => {
  it('renders children when open and nothing when closed', () => {
    const { rerender } = render(
      <Drawer open onClose={() => {}} title="Test">
        <div>Content</div>
      </Drawer>,
    );
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Content')).toBeTruthy();

    rerender(
      <Drawer open={false} onClose={() => {}} title="Test">
        <div>Content</div>
      </Drawer>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('anchors to the requested position (left | right | bottom)', () => {
    const { rerender } = render(
      <Drawer open onClose={() => {}} title="Test" position="left">
        <div>x</div>
      </Drawer>,
    );
    expect(screen.getByRole('dialog').className).toContain('left-0');
    expect(screen.getByRole('dialog').className).toContain('h-full');

    rerender(
      <Drawer open onClose={() => {}} title="Test" position="bottom">
        <div>x</div>
      </Drawer>,
    );
    expect(screen.getByRole('dialog').className).toContain('bottom-0');
    expect(screen.getByRole('dialog').className).toContain('w-full');
  });

  it('switches between the normal | medium | large | full size presets', () => {
    render(
      <Drawer open onClose={() => {}} title="Test" position="right" defaultSize="normal">
        <div>x</div>
      </Drawer>,
    );
    expect(screen.getByRole('dialog').style.width).toBe('360px');

    fireEvent.click(screen.getByRole('button', { name: 'Medium' }));
    expect(screen.getByRole('dialog').style.width).toBe('480px');

    fireEvent.click(screen.getByRole('button', { name: 'Large' }));
    expect(screen.getByRole('dialog').style.width).toBe('640px');

    fireEvent.click(screen.getByRole('button', { name: 'Full' }));
    expect(screen.getByRole('dialog').style.width).toBe(`${window.innerWidth}px`);
  });

  it('sizes a bottom drawer by height', () => {
    render(
      <Drawer open onClose={() => {}} title="Test" position="bottom" defaultSize="large">
        <div>x</div>
      </Drawer>,
    );
    expect(screen.getByRole('dialog').style.height).toBe('448px');
  });

  it('resizes by dragging the handle and persists the custom width', () => {
    window.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent;
    render(
      <Drawer open onClose={() => {}} title="Test" position="right" defaultSize="medium" storageKey="test-drawer">
        <div>x</div>
      </Drawer>,
    );
    const handle = document.querySelector('[title="Resize drawer"]');
    expect(handle).toBeTruthy();

    // Dragging the left edge of a right drawer left by 100px widens it.
    fireEvent.pointerDown(handle!, { button: 0, clientX: 500, clientY: 100 });
    fireEvent.pointerMove(document, { clientX: 400, clientY: 100 });
    fireEvent.pointerUp(document);

    expect(screen.getByRole('dialog').style.width).toBe('580px');
    expect(window.localStorage.getItem('vestara:drawer:test-drawer')).toBe('580');
  });

  it('closes via the close button and the Escape key', () => {
    const onClose = vi.fn();
    render(
      <Drawer open onClose={onClose} title="Test">
        <div>x</div>
      </Drawer>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close drawer' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
