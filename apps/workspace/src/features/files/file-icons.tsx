/**
 * File-type icons for the file explorer.
 *
 * Extension/filename map (same structure as the ai-planner map): specific
 * VSCode-style glyphs from `components/icons` (ported set), generic MUI
 * icons for the rest. Multicolor glyphs render at a fixed 18px; no tile,
 * no accent recolor — the glyph itself is the identity.
 */

import AudiotrackIcon from '@mui/icons-material/Audiotrack';
import CodeIcon from '@mui/icons-material/Code';
import CssIcon from '@mui/icons-material/Css';
import DescriptionIcon from '@mui/icons-material/Description';
import HtmlIcon from '@mui/icons-material/Html';
import ImageIcon from '@mui/icons-material/Image';
import JavascriptIcon from '@mui/icons-material/Javascript';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import TerminalIcon from '@mui/icons-material/Terminal';
import VideocamIcon from '@mui/icons-material/Videocam';
import type { ComponentType, ElementType, JSX } from 'react';
import { CatppuccinYarnLock } from '../../components/icons/CatppuccinYarnLock';
import { ClarityLicenseSolid } from '../../components/icons/ClarityLicenseSolid';
import { EosIconsEnv } from '../../components/icons/EosIconsEnv';
import { FileIconsTsx } from '../../components/icons/FileIconsTsx';
import { FxemojiFolder } from '../../components/icons/FxemojiFolder';
import { FxemojiOpenfolder } from '../../components/icons/FxemojiOpenfolder';
import { GgReadme } from '../../components/icons/GgReadme';
import { MaterialIconThemeCss } from '../../components/icons/MaterialIconThemeCss';
import { MaterialIconThemeHtml } from '../../components/icons/MaterialIconThemeHtml';
import { MaterialIconThemeJsconfig } from '../../components/icons/MaterialIconThemeJsconfig';
import { MaterialIconThemeJson } from '../../components/icons/MaterialIconThemeJson';
import { MaterialIconThemeSvg } from '../../components/icons/MaterialIconThemeSvg';
import { MaterialIconThemeTsconfig } from '../../components/icons/MaterialIconThemeTsconfig';
import { MaterialIconThemeTypescript } from '../../components/icons/MaterialIconThemeTypescript';
import { MaterialIconThemeTypescriptDef } from '../../components/icons/MaterialIconThemeTypescriptDef';
import { MaterialSymbolsGifBox } from '../../components/icons/MaterialSymbolsGifBox';
import { MaterialSymbolsLightFilePng } from '../../components/icons/MaterialSymbolsLightFilePng';
import { MaterialSymbolsMarkdownRounded } from '../../components/icons/MaterialSymbolsMarkdownRounded';
import { MdiCodeJson } from '../../components/icons/MdiCodeJson';
import { SimpleIconsGitignoredotio } from '../../components/icons/SimpleIconsGitignoredotio';
import { TeenyiconsJavascriptOutline } from '../../components/icons/TeenyiconsJavascriptOutline';
import { VscodeIconsFileTypeTsconfig } from '../../components/icons/VscodeIconsFileTypeTsconfig';

type IconComponent = ElementType;

// Map of file extensions (or full filenames for dotfiles) to icons.
// Keys are lowercase. Ported set: multicolor customs where they exist,
// generic MUI glyphs everywhere else.
const fileExtensionIcons: Record<string, IconComponent> = {
  // Code / programming languages
  '.js': TeenyiconsJavascriptOutline,
  '.jsx': JavascriptIcon,
  '.ts': MaterialIconThemeTypescript,
  '.tsx': FileIconsTsx,
  '.mts': MaterialIconThemeTypescriptDef,
  '.cts': MaterialIconThemeTypescriptDef,
  '.mjs': JavascriptIcon,
  '.cjs': JavascriptIcon,
  '.json': MdiCodeJson,
  '.css': MaterialIconThemeCss,
  '.scss': MaterialIconThemeCss,
  '.less': CssIcon,
  '.html': MaterialIconThemeHtml,
  '.htm': HtmlIcon,
  '.xml': CodeIcon,
  '.py': CodeIcon,
  '.java': CodeIcon,
  '.go': CodeIcon,
  '.rb': CodeIcon,
  '.php': CodeIcon,
  '.c': CodeIcon,
  '.cpp': CodeIcon,
  '.h': CodeIcon,
  '.rs': CodeIcon,
  '.sh': TerminalIcon,
  '.bash': TerminalIcon,
  '.zsh': TerminalIcon,
  '.ps1': TerminalIcon,
  '.md': MaterialSymbolsMarkdownRounded,
  '.markdown': MaterialSymbolsMarkdownRounded,
  '.mdx': MaterialSymbolsMarkdownRounded,
  '.yml': DescriptionIcon,
  '.yaml': DescriptionIcon,
  '.toml': DescriptionIcon,
  '.env': EosIconsEnv,

  // Web / config / build (exact filenames first — checked before extensions)
  'package.json': MaterialIconThemeJson,
  'package-lock.json': CatppuccinYarnLock,
  'yarn.lock': CatppuccinYarnLock,
  'pnpm-lock.yaml': CatppuccinYarnLock,
  'tsconfig.json': MaterialIconThemeTsconfig,
  'jsconfig.json': MaterialIconThemeJsconfig,
  'vite.config.ts': VscodeIconsFileTypeTsconfig,
  'eslint.config.ts': MaterialIconThemeJsconfig,
  'tailwind.config.ts': JavascriptIcon,
  'next.config.js': JavascriptIcon,
  '.gitignore': SimpleIconsGitignoredotio,
  'readme.md': GgReadme,
  license: ClarityLicenseSolid,
  '.lock': CatppuccinYarnLock,

  // Media / documents
  '.png': MaterialSymbolsLightFilePng,
  '.jpg': ImageIcon,
  '.jpeg': ImageIcon,
  '.gif': MaterialSymbolsGifBox,
  '.svg': MaterialIconThemeSvg,
  '.webp': ImageIcon,
  '.ico': ImageIcon,
  '.pdf': PictureAsPdfIcon,
  '.txt': DescriptionIcon,
  '.log': DescriptionIcon,
  '.mp3': AudiotrackIcon,
  '.wav': AudiotrackIcon,
  '.mp4': VideocamIcon,
  '.webm': VideocamIcon,
};

function MuiGlyph({ Icon }: { Icon: IconComponent }): JSX.Element {
  const C = Icon as ComponentType<{ sx?: object; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  return <C sx={{ fontSize: 18 }} aria-hidden="true" />;
}

function CustomGlyph({ Icon }: { Icon: IconComponent }): JSX.Element {
  const C = Icon as ComponentType<{
    width?: number | string;
    height?: number | string;
    'aria-hidden'?: boolean | 'true' | 'false';
  }>;
  return <C width={18} height={18} aria-hidden="true" />;
}

const MUI_ICONS = new Set<IconComponent>([
  JavascriptIcon,
  CssIcon,
  HtmlIcon,
  CodeIcon,
  TerminalIcon,
  DescriptionIcon,
  ImageIcon,
  PictureAsPdfIcon,
  AudiotrackIcon,
  VideocamIcon,
]);

/**
 * File-type icon element for an explorer row. Folders use the open/closed
 * set; files resolve exact filename → extension → generic fallback.
 */
export function getFileTypeIcon(
  fileName: string,
  fileType: 'file' | 'folder',
  isExpanded = false,
): JSX.Element {
  if (fileType === 'folder') {
    const Icon = isExpanded ? FxemojiOpenfolder : FxemojiFolder;
    return <CustomGlyph Icon={Icon} />;
  }

  const lowered = fileName.toLowerCase();
  const exact = fileExtensionIcons[lowered];
  if (exact) {
    return MUI_ICONS.has(exact) ? <MuiGlyph Icon={exact} /> : <CustomGlyph Icon={exact} />;
  }

  const ext = lowered.includes('.') ? `.${lowered.split('.').pop()}` : '';
  const match = ext ? fileExtensionIcons[ext] : undefined;
  if (match) {
    return MUI_ICONS.has(match) ? <MuiGlyph Icon={match} /> : <CustomGlyph Icon={match} />;
  }

  return <MuiGlyph Icon={DescriptionIcon} />;
}
