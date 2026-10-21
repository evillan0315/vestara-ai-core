import SearchIcon from '@mui/icons-material/Search';
import { Box, Dialog, List, ListItemButton, ListItemText, TextField, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';

export interface PaletteCommand {
  id: string;
  label: string;
  detail: string;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: PaletteCommand[];
}

export default function CommandPalette({ open, onClose, commands }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q) || c.detail.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setIndex(0);
    }
  }, [open]);

  const choose = (command: PaletteCommand | undefined) => {
    if (!command) return;
    onClose();
    command.run();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            backgroundColor: 'var(--vestara-surface-panel-raised)',
            border: '1px solid var(--vestara-border-default)',
            boxShadow: 'var(--vestara-elevation-floating)',
            borderRadius: 'var(--vestara-radius-xl)',
            overflow: 'hidden',
          },
        },
      }}
      aria-label="Command palette"
    >
      <Box sx={{ padding: 'var(--vestara-spacing-3)' }}>
        <TextField
          autoFocus
          fullWidth
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setIndex((i) => Math.min(i + 1, filtered.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
              choose(filtered[index]);
            }
          }}
          placeholder="Type a command…"
          slotProps={{ htmlInput: { 'aria-label': 'Search commands' } as Record<string, unknown> }}
          sx={{
            '& .MuiOutlinedInput-root': {
              fontFamily: 'var(--vestara-font-mono)',
              backgroundColor: 'var(--vestara-surface-canvas)',
            },
          }}
        />
        <List sx={{ maxHeight: 320, overflowY: 'auto', mt: 1 }} role="listbox" aria-label="Commands">
          {filtered.map((command, i) => (
            <ListItemButton
              key={command.id}
              selected={i === index}
              onClick={() => choose(command)}
              onMouseEnter={() => setIndex(i)}
              role="option"
              aria-selected={i === index}
              sx={{ borderRadius: 'var(--vestara-radius)' }}
            >
              <SearchIcon sx={{ fontSize: 14, color: 'var(--vestara-text-muted)', mr: 1 }} />
              <ListItemText
                primary={command.label}
                secondary={command.detail}
                slotProps={{
                  primary: { sx: { fontFamily: 'var(--vestara-font-mono)' } },
                  secondary: {
                    sx: { fontFamily: 'var(--vestara-font-mono)', color: 'var(--vestara-text-muted)' },
                  },
                }}
              />
            </ListItemButton>
          ))}
          {filtered.length === 0 && (
            <Typography
              variant="body2"
              sx={{
                padding: 'var(--vestara-spacing-4)',
                textAlign: 'center',
                color: 'var(--vestara-text-muted)',
                fontFamily: 'var(--vestara-font-mono)',
              }}
            >
              No matching command
            </Typography>
          )}
        </List>
      </Box>
    </Dialog>
  );
}
