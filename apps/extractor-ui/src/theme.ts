import { createTheme } from '@mui/material/styles';

/**
 * MUI v9 theme mapped onto Vestara tokens.
 * Uses the v9 slots/slotProps API (components/componentsProps removed).
 *
 * NOTE: palette entries MUST be parseable colors (#/rgb/hsl) because MUI runs
 * color math (augmentColor → lighten/darken/contrast) over them — var()
 * references throw "MUI: Unsupported var() color". These literals mirror the
 * --vestara-* definitions in src/styles.css (the runtime authority); every
 * sx/styleOverride below still consumes var(--vestara-*) only. Keep in sync.
 */
const EXTRACTOR = {
  canvas: '#0a0f14',
  panel: '#121c22',
  textPrimary: '#e6f0f2',
  textSecondary: 'rgba(230, 240, 242, 0.65)',
  borderSubtle: 'rgba(255, 255, 255, 0.06)',
  accent: '#00e5ff',
  success: '#22c55e',
  warning: '#f59e0b',
} as const;

export const extractorTheme = createTheme({
  cssVariables: true,
  palette: {
    mode: 'dark',
    primary: {
      main: EXTRACTOR.accent,
      contrastText: EXTRACTOR.canvas,
    },
    background: {
      default: EXTRACTOR.canvas,
      paper: EXTRACTOR.panel,
    },
    text: {
      primary: EXTRACTOR.textPrimary,
      secondary: EXTRACTOR.textSecondary,
    },
    divider: EXTRACTOR.borderSubtle,
    success: {
      main: EXTRACTOR.success,
    },
    warning: {
      main: EXTRACTOR.warning,
    },
  },
  // Matches --vestara-radius (10px); kept numeric because MUI shape requires a number.
  shape: {
    borderRadius: 10,
  },
  typography: {
    fontFamily: 'var(--vestara-font-sans)',
  },
  components: {
    MuiButtonBase: {
      styleOverrides: {
        root: {
          transition:
            'background-color var(--vestara-motion-normal) var(--vestara-motion-easing), border-color var(--vestara-motion-normal) var(--vestara-motion-easing), color var(--vestara-motion-fast) var(--vestara-motion-easing)',
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          '&.Mui-selected': {
            backgroundColor: 'var(--vestara-accent-bg)',
          },
          '&.Mui-selected:hover': {
            backgroundColor: 'var(--vestara-accent-bg)',
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 'var(--vestara-radius)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundColor: 'var(--vestara-surface-panel)',
          border: '1px solid var(--vestara-border-subtle)',
          backgroundImage: 'none',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontFamily: 'var(--vestara-font-mono)',
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: 'var(--vestara-surface-panel-raised)',
          color: 'var(--vestara-text-secondary)',
          border: '1px solid var(--vestara-border-default)',
          fontFamily: 'var(--vestara-font-mono)',
        },
      },
    },
  },
});
