/**
 * @vestara/ui-components — Vendored icon set.
 *
 * The reference artifact depends on `lucide-react`. To keep this package
 * dependency-free (react + @vestara/ui-tokens only), the icon geometry is
 * vendored here as a tiny factory. Each icon is stroke-based (currentColor,
 * 24×24 viewBox) so callers tint it with a `--vestara-*` token via className.
 *
 * Not for UI-UX governance: these are geometry data, not visual values —
 * colour always arrives through `currentColor` from a token class.
 */

import { createElement, forwardRef, type SVGProps } from 'react';

/** A single SVG child: `[tag, attrs]`. */
type IconNode = readonly [string, Readonly<Record<string, string | number>>];

const ICON_NODES: Record<string, readonly IconNode[]> = {
  ArrowRight: [
    ['path', { d: 'M5 12h14' }],
    ['path', { d: 'm12 5 7 7-7 7' }],
  ],
  Box: [
    [
      'path',
      {
        d: 'M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z',
      },
    ],
    ['path', { d: 'm3.3 7 8.7 5 8.7-5' }],
    ['path', { d: 'M12 22V12' }],
  ],
  Braces: [
    ['path', { d: 'M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1' }],
    ['path', { d: 'M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1' }],
  ],
  Check: [['path', { d: 'M20 6 9 17l-5-5' }]],
  CheckCheck: [
    ['path', { d: 'M18 6 7 17l-5-5' }],
    ['path', { d: 'm22 10-7.5 7.5L13 16' }],
  ],
  ChevronDown: [['path', { d: 'm6 9 6 6 6-6' }]],
  ChevronRight: [['path', { d: 'm9 18 6-6-6-6' }]],
  Clock: [
    ['circle', { cx: 12, cy: 12, r: 10 }],
    ['polyline', { points: '12 6 12 12 16 14' }],
  ],
  Command: [['path', { d: 'M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3' }]],
  Copy: [
    ['rect', { width: 14, height: 14, x: 8, y: 8, rx: 2, ry: 2 }],
    ['path', { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' }],
  ],
  Cpu: [
    ['rect', { width: 16, height: 16, x: 4, y: 4, rx: 2 }],
    ['rect', { width: 6, height: 6, x: 9, y: 9, rx: 1 }],
    ['path', { d: 'M15 2v2' }],
    ['path', { d: 'M15 20v2' }],
    ['path', { d: 'M2 15h2' }],
    ['path', { d: 'M2 9h2' }],
    ['path', { d: 'M20 15h2' }],
    ['path', { d: 'M20 9h2' }],
    ['path', { d: 'M9 2v2' }],
    ['path', { d: 'M9 20v2' }],
  ],
  Database: [
    ['ellipse', { cx: 12, cy: 5, rx: 9, ry: 3 }],
    ['path', { d: 'M3 5V19A9 3 0 0 0 21 19V5' }],
    ['path', { d: 'M3 12A9 3 0 0 0 21 12' }],
  ],
  Download: [
    ['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }],
    ['polyline', { points: '7 10 12 15 17 10' }],
    ['line', { x1: 12, x2: 12, y1: 15, y2: 3 }],
  ],
  ExternalLink: [
    ['path', { d: 'M15 3h6v6' }],
    ['path', { d: 'M10 14 21 3' }],
    ['path', { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' }],
  ],
  Eye: [
    [
      'path',
      { d: 'M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0' },
    ],
    ['circle', { cx: 12, cy: 12, r: 3 }],
  ],
  EyeOff: [
    ['path', { d: 'M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49' }],
    ['path', { d: 'M14.084 14.158a3 3 0 0 1-4.242-4.242' }],
    ['path', { d: 'M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143' }],
    ['path', { d: 'm2 2 20 20' }],
  ],
  FileCode2: [
    ['path', { d: 'M4 22h14a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v4' }],
    ['path', { d: 'M14 2v4a2 2 0 0 0 2 2h4' }],
    ['path', { d: 'm5 12-3 3 3 3' }],
    ['path', { d: 'm9 18 3-3-3-3' }],
  ],
  FileJson: [
    ['path', { d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' }],
    ['path', { d: 'M14 2v4a2 2 0 0 0 2 2h4' }],
    ['path', { d: 'M10 12a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1 1 1 0 0 1 1 1v1a1 1 0 0 0 1 1' }],
    ['path', { d: 'M14 18a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1' }],
  ],
  FileText: [
    ['path', { d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' }],
    ['path', { d: 'M14 2v4a2 2 0 0 0 2 2h4' }],
    ['path', { d: 'M10 9H8' }],
    ['path', { d: 'M16 13H8' }],
    ['path', { d: 'M16 17H8' }],
  ],
  Files: [
    ['path', { d: 'M20 7h-3a2 2 0 0 1-2-2V2' }],
    ['path', { d: 'M9 18a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h7l4 4v10a2 2 0 0 1-2 2Z' }],
    ['path', { d: 'M3 7.6v12.8A1.6 1.6 0 0 0 4.6 22h9.8' }],
  ],
  Folder: [
    [
      'path',
      {
        d: 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z',
      },
    ],
  ],
  FolderOpen: [
    [
      'path',
      {
        d: 'm6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2',
      },
    ],
  ],
  GitBranch: [
    ['line', { x1: 6, x2: 6, y1: 3, y2: 15 }],
    ['circle', { cx: 18, cy: 6, r: 3 }],
    ['circle', { cx: 6, cy: 18, r: 3 }],
    ['path', { d: 'M18 9a9 9 0 0 1-9 9' }],
  ],
  HardDrive: [
    ['line', { x1: 22, x2: 2, y1: 12, y2: 12 }],
    [
      'path',
      {
        d: 'M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
      },
    ],
    ['line', { x1: 6, x2: 6.01, y1: 16, y2: 16 }],
    ['line', { x1: 10, x2: 10.01, y1: 16, y2: 16 }],
  ],
  Hash: [
    ['line', { x1: 4, x2: 20, y1: 9, y2: 9 }],
    ['line', { x1: 4, x2: 20, y1: 15, y2: 15 }],
    ['line', { x1: 10, x2: 8, y1: 3, y2: 21 }],
    ['line', { x1: 16, x2: 14, y1: 3, y2: 21 }],
  ],
  KeyRound: [
    [
      'path',
      {
        d: 'M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z',
      },
    ],
    ['circle', { cx: 16.5, cy: 7.5, r: 0.5, fill: 'currentColor' }],
  ],
  Layers: [
    [
      'path',
      {
        d: 'M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z',
      },
    ],
    ['path', { d: 'M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12' }],
    ['path', { d: 'M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17' }],
  ],
  Link2: [
    ['path', { d: 'M9 17H7A5 5 0 0 1 7 7h2' }],
    ['path', { d: 'M15 7h2a5 5 0 1 1 0 10h-2' }],
    ['line', { x1: 8, x2: 16, y1: 12, y2: 12 }],
  ],
  Lock: [
    ['rect', { width: 18, height: 11, x: 3, y: 11, rx: 2, ry: 2 }],
    ['path', { d: 'M7 11V7a5 5 0 0 1 10 0v4' }],
  ],
  Menu: [
    ['line', { x1: 4, x2: 20, y1: 12, y2: 12 }],
    ['line', { x1: 4, x2: 20, y1: 6, y2: 6 }],
    ['line', { x1: 4, x2: 20, y1: 18, y2: 18 }],
  ],
  MessageSquare: [['path', { d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' }]],
  PenLine: [
    ['path', { d: 'M12 20h9' }],
    [
      'path',
      {
        d: 'M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z',
      },
    ],
  ],
  Pin: [
    ['path', { d: 'M12 17v5' }],
    [
      'path',
      {
        d: 'M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z',
      },
    ],
  ],
  Plus: [
    ['path', { d: 'M5 12h14' }],
    ['path', { d: 'M12 5v14' }],
  ],
  Puzzle: [
    [
      'path',
      {
        d: 'M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474 2.5 2.5 0 1 1-3.014-3.015 1 1 0 0 0 .474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z',
      },
    ],
  ],
  Search: [
    ['circle', { cx: 11, cy: 11, r: 8 }],
    ['path', { d: 'm21 21-4.3-4.3' }],
  ],
  Send: [
    [
      'path',
      {
        d: 'M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z',
      },
    ],
    ['path', { d: 'm21.854 2.147-10.94 10.939' }],
  ],
  Server: [
    ['rect', { width: 20, height: 8, x: 2, y: 2, rx: 2, ry: 2 }],
    ['rect', { width: 20, height: 8, x: 2, y: 14, rx: 2, ry: 2 }],
    ['line', { x1: 6, x2: 6.01, y1: 6, y2: 6 }],
    ['line', { x1: 6, x2: 6.01, y1: 18, y2: 18 }],
  ],
  Settings: [
    [
      'path',
      {
        d: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z',
      },
    ],
    ['circle', { cx: 12, cy: 12, r: 3 }],
  ],
  Shield: [
    [
      'path',
      {
        d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
      },
    ],
  ],
  ShieldCheck: [
    [
      'path',
      {
        d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
      },
    ],
    ['path', { d: 'm9 12 2 2 4-4' }],
  ],
  Sparkles: [
    [
      'path',
      {
        d: 'M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z',
      },
    ],
    ['path', { d: 'M20 3v4' }],
    ['path', { d: 'M22 5h-4' }],
    ['path', { d: 'M4 17v2' }],
    ['path', { d: 'M5 18H3' }],
  ],
  Terminal: [
    ['polyline', { points: '4 17 10 11 4 5' }],
    ['line', { x1: 12, x2: 20, y1: 19, y2: 19 }],
  ],
  Trash2: [
    ['path', { d: 'M3 6h18' }],
    ['path', { d: 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6' }],
    ['path', { d: 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2' }],
    ['line', { x1: 10, x2: 10, y1: 11, y2: 17 }],
    ['line', { x1: 14, x2: 14, y1: 11, y2: 17 }],
  ],
  TriangleAlert: [
    ['path', { d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3' }],
    ['path', { d: 'M12 9v4' }],
    ['path', { d: 'M12 17h.01' }],
  ],
  Usb: [
    ['circle', { cx: 10, cy: 7, r: 1 }],
    ['circle', { cx: 4, cy: 20, r: 1 }],
    ['path', { d: 'M4.7 19.3 19 5' }],
    ['path', { d: 'm21 3-3 1 2 2Z' }],
    ['path', { d: 'M9.26 7.68 5 12l2 5' }],
    ['path', { d: 'm10 14 5 2 3.5-3.5' }],
    ['path', { d: 'm18 12 1-1 1 1-1 1Z' }],
  ],
  X: [
    ['path', { d: 'M18 6 6 18' }],
    ['path', { d: 'm6 6 12 12' }],
  ],
  Zap: [
    [
      'path',
      {
        d: 'M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z',
      },
    ],
  ],
};

export type IconName = keyof typeof ICON_NODES;

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  /** Icon size in px (square). Defaults to 24. */
  size?: number;
  /** Stroke width. Defaults to 2. */
  strokeWidth?: number;
}

function makeIcon(name: string) {
  const nodes = ICON_NODES[name] ?? [];
  const Icon = forwardRef<SVGSVGElement, IconProps>(function Icon(
    { size = 24, strokeWidth = 2, className, children, ...rest },
    ref,
  ) {
    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
        {...rest}
      >
        {nodes.map(([tag, attrs], index) => createElement(tag, { key: index, ...attrs }))}
        {children}
      </svg>
    );
  });
  Icon.displayName = name;
  return Icon;
}

export const ArrowRight = makeIcon('ArrowRight');
export const Box = makeIcon('Box');
export const Braces = makeIcon('Braces');
export const Check = makeIcon('Check');
export const CheckCheck = makeIcon('CheckCheck');
export const ChevronDown = makeIcon('ChevronDown');
export const ChevronRight = makeIcon('ChevronRight');
export const Clock = makeIcon('Clock');
export const Command = makeIcon('Command');
export const Copy = makeIcon('Copy');
export const Cpu = makeIcon('Cpu');
export const Database = makeIcon('Database');
export const Download = makeIcon('Download');
export const ExternalLink = makeIcon('ExternalLink');
export const Eye = makeIcon('Eye');
export const EyeOff = makeIcon('EyeOff');
export const FileCode2 = makeIcon('FileCode2');
export const FileJson = makeIcon('FileJson');
export const FileText = makeIcon('FileText');
export const Files = makeIcon('Files');
export const Folder = makeIcon('Folder');
export const FolderOpen = makeIcon('FolderOpen');
export const GitBranch = makeIcon('GitBranch');
export const HardDrive = makeIcon('HardDrive');
export const Hash = makeIcon('Hash');
export const KeyRound = makeIcon('KeyRound');
export const Layers = makeIcon('Layers');
export const Link2 = makeIcon('Link2');
export const Lock = makeIcon('Lock');
export const Menu = makeIcon('Menu');
export const MessageSquare = makeIcon('MessageSquare');
export const PenLine = makeIcon('PenLine');
export const Pin = makeIcon('Pin');
export const Plus = makeIcon('Plus');
export const Puzzle = makeIcon('Puzzle');
export const Search = makeIcon('Search');
export const Send = makeIcon('Send');
export const Server = makeIcon('Server');
export const Settings = makeIcon('Settings');
export const Shield = makeIcon('Shield');
export const ShieldCheck = makeIcon('ShieldCheck');
export const Sparkles = makeIcon('Sparkles');
export const Terminal = makeIcon('Terminal');
export const Trash2 = makeIcon('Trash2');
export const TriangleAlert = makeIcon('TriangleAlert');
export const Usb = makeIcon('Usb');
export const X = makeIcon('X');
export const Zap = makeIcon('Zap');

export const ICONS = {
  ArrowRight,
  Box,
  Braces,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Clock,
  Command,
  Copy,
  Cpu,
  Database,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileCode2,
  FileJson,
  FileText,
  Files,
  Folder,
  FolderOpen,
  GitBranch,
  HardDrive,
  Hash,
  KeyRound,
  Layers,
  Link2,
  Lock,
  Menu,
  MessageSquare,
  PenLine,
  Pin,
  Plus,
  Puzzle,
  Search,
  Send,
  Server,
  Settings,
  Shield,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  TriangleAlert,
  Usb,
  X,
  Zap,
} as const;
