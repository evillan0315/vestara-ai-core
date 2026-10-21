/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AssistantMarkdown } from './AssistantMarkdown';

afterEach(() => {
  cleanup();
});

describe('AssistantMarkdown', () => {
  it('renders emphasis, headings, and lists', () => {
    const { container } = render(
      <AssistantMarkdown text={'## Status\n\nShell **nominal** with *teal* identity.\n\n- dock\n- windows'} />,
    );
    expect(screen.getByText('nominal')).toBeTruthy();
    expect(screen.getByText('dock')).toBeTruthy();
    expect(container.querySelector('ul')).toBeTruthy();
    expect(container.querySelector('strong')).toBeTruthy();
  });

  it('renders fenced code as a block and inline code as a chip', () => {
    const { container } = render(<AssistantMarkdown text={'Run `pnpm test`.\n\n```sh\npnpm build\n```'} />);
    expect(container.querySelector('pre')).toBeTruthy();
    expect(screen.getByText('pnpm build')).toBeTruthy();
    expect(screen.getByText('pnpm test')).toBeTruthy();
  });

  it('opens links in a new tab with opener protection', () => {
    render(<AssistantMarkdown text={'See [the docs](https://example.com/x).'} />);
    const link = screen.getByText('the docs');
    expect(link.getAttribute('href')).toBe('https://example.com/x');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('leaves raw HTML inert', () => {
    const { container } = render(<AssistantMarkdown text={'<img src="x" onerror="alert(1)">'} />);
    expect(container.querySelector('img')).toBeNull();
  });

  it('renders plain prose unchanged', () => {
    render(<AssistantMarkdown text={'Director — shell nominal. Ask for a window.'} />);
    expect(screen.getByText('Director — shell nominal. Ask for a window.')).toBeTruthy();
  });
});
