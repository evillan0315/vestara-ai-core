import { Box, Typography } from '@mui/material';
import type { JSX } from 'react';
import { VestaraMark } from './branding/index.js';

export interface LogoProps {
  collapsed?: boolean;
  orientation?: 'vertical' | 'horizontal';
  showText?: boolean;
  size?: number;
  /**
   * Custom logo image URL — renders an `<img>` instead of the themed mark.
   * Omit (or pass null) for the inline `VestaraMark`, which re-tints
   * automatically with the selected accent color.
   */
  src?: string | null;
}

export default function Logo({
  collapsed = false,
  orientation = 'vertical',
  showText,
  size = 72,
  src,
}: LogoProps): JSX.Element {
  const displayText = showText ?? !collapsed;
  const vertical = orientation === 'vertical';

  return (
    <Box
      sx={{
        width: '100%',
        display: 'flex',
        flexDirection: vertical ? 'column' : 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: vertical ? 1.75 : 2,
      }}
    >
      {src ? (
        <Box
          component="img"
          src={src}
          alt="Vestara"
          sx={{
            width: size,
            height: size,
            flexShrink: 0,
            objectFit: 'contain',
          }}
        />
      ) : (
        <VestaraMark size={size} />
      )}

      {displayText && (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: vertical ? 'center' : 'flex-start',
            textAlign: vertical ? 'center' : 'left',
          }}
        >
          <Typography
            sx={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontWeight: 800,
              fontSize: vertical ? 14 : 18,
              letterSpacing: vertical ? '0.42em' : '0.34em',
              lineHeight: 1,

              whiteSpace: 'nowrap',
            }}
          >
            VESTARA
          </Typography>

          <Typography
            sx={{
              mt: 0.9,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontWeight: 700,
              fontSize: vertical ? 12 : 9,
              letterSpacing: '0.09em',
              textTransform: 'uppercase',
              lineHeight: 1,
              whiteSpace: 'nowrap',
            }}
            style={{
              color: 'var(--vestara-primary)',
            }}
          >
            AI OPERATING SYSTEM
          </Typography>
        </Box>
      )}
    </Box>
  );
}
