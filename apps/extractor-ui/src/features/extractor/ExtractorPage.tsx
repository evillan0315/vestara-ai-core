import ArticleIcon from '@mui/icons-material/Article';
import BoltIcon from '@mui/icons-material/Bolt';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CodeIcon from '@mui/icons-material/Code';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DashboardIcon from '@mui/icons-material/Dashboard';
import DescriptionIcon from '@mui/icons-material/Description';
import DownloadIcon from '@mui/icons-material/Download';
import LinkIcon from '@mui/icons-material/Link';
import SearchIcon from '@mui/icons-material/Search';
import SmartButtonIcon from '@mui/icons-material/SmartButton';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Paper,
  Snackbar,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import type { DragEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { PaletteCommand } from './CommandPalette';
import CommandPalette from './CommandPalette';
import type { ComponentIcon, PropRow } from './extractor.fixtures';
import {
  componentFiles,
  extractorTip,
  headerBadges,
  initialProps,
  recentExtractions,
  referenceNote,
} from './extractor.fixtures';
import type { ParsedArtifact } from './parse';
import { buildImportSnippet, parseArtifact } from './parse';

type PreviewMode = 'preview' | 'original' | 'cleaned';

const MAX_ARTIFACT_BYTES = 10 * 1024 * 1024;

function iconFor(icon: ComponentIcon) {
  if (icon === 'button') return SmartButtonIcon;
  if (icon === 'card') return DashboardIcon;
  if (icon === 'code') return CodeIcon;
  if (icon === 'markdown') return ArticleIcon;
  return DescriptionIcon;
}

export default function ExtractorPage() {
  const [activeId, setActiveId] = useState('fileicon');
  const [mode, setMode] = useState<PreviewMode>('preview');
  const [toast, setToast] = useState('');
  const [url, setUrl] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [parsed, setParsed] = useState<ParsedArtifact | null>(null);
  const [props, setProps] = useState<PropRow[]>(initialProps);
  const dropRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const notify = (message: string) => setToast(message);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const scrollToDrop = () => dropRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify(`${label} copied`);
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand('copy');
        notify(`${label} copied`);
      } catch {
        notify('Copy failed');
      }
      area.remove();
    }
  };

  const parseText = (text: string, name: string, bytes: number) => {
    const artifact = parseArtifact(text, name, bytes);
    setParsed(artifact);
    notify(`Artifact parsed locally — ${artifact.elements} elements in ${name}`);
  };

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (file.size > MAX_ARTIFACT_BYTES) {
      notify('File exceeds 10MB limit');
      return;
    }
    void file.text().then((text) => parseText(text, file.name, file.size));
  };

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    handleFiles(event.dataTransfer.files);
  };

  const handleFetch = async () => {
    const target = url.trim();
    if (!target) {
      notify('Enter a URL first');
      return;
    }
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(target, window.location.href);
    } catch {
      notify('Invalid URL');
      return;
    }
    setFetching(true);
    try {
      const response = await fetch(parsedUrl.toString());
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      if (text.length > MAX_ARTIFACT_BYTES) {
        notify('Artifact exceeds 10MB limit');
        return;
      }
      parseText(text, parsedUrl.pathname.split('/').pop() || 'artifact.html', text.length);
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('html')) notify('Fetched non-HTML — parsed anyway');
    } catch {
      notify('Fetch blocked (CORS/network) — download the file and drop it instead');
    } finally {
      setFetching(false);
    }
  };

  const handleExport = () => {
    const manifest = {
      exportedAt: new Date().toISOString(),
      artifact: parsed,
      components: componentFiles,
      props,
    };
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = 'extractor-manifest.json';
    anchor.click();
    URL.revokeObjectURL(href);
    notify('Manifest exported');
  };

  const updateDefault = (index: number, value: string) => {
    setProps((prev) => prev.map((row, i) => (i === index ? { ...row, defaultValue: value } : row)));
  };

  const activeFile = componentFiles.find((file) => file.id === activeId) ?? componentFiles[0];
  const importSnippet = buildImportSnippet(parsed);

  const commands: PaletteCommand[] = [
    { id: 'drop', label: 'Drop artifact', detail: 'Scroll to the drop zone', run: scrollToDrop },
    {
      id: 'choose',
      label: 'Choose file',
      detail: 'Open the file picker (.html, up to 10MB)',
      run: () => fileRef.current?.click(),
    },
    { id: 'export', label: 'Export manifest', detail: 'Download extractor-manifest.json', run: handleExport },
    {
      id: 'copy-import',
      label: 'Copy import snippet',
      detail: 'Copy the generated import to the clipboard',
      run: () => void copyText(importSnippet, 'Import snippet'),
    },
    {
      id: 'copy-cleaned',
      label: 'Copy cleaned markup',
      detail: parsed ? `${parsed.name} (${parsed.size})` : 'Parse an artifact first',
      run: () => {
        if (parsed) void copyText(parsed.cleaned, 'Cleaned markup');
        else notify('Drop an artifact first');
      },
    },
    {
      id: 'tab-preview',
      label: 'Show Preview tab',
      detail: 'Reference component demos',
      run: () => setMode('preview'),
    },
    { id: 'tab-original', label: 'Show Original tab', detail: 'Raw artifact markup', run: () => setMode('original') },
    {
      id: 'tab-cleaned',
      label: 'Show Cleaned tab',
      detail: 'Scripts, styles and handlers stripped',
      run: () => setMode('cleaned'),
    },
    ...componentFiles.map((file) => ({
      id: `select-${file.id}`,
      label: `Select ${file.name}`,
      detail: file.path,
      run: () => setActiveId(file.id),
    })),
  ];

  const renderMarkupTab = (title: string, text: string, note: string) => (
    <Paper sx={{ mt: 2, overflow: 'hidden' }}>
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 'var(--vestara-spacing-2)',
          padding: 'var(--vestara-spacing-3)',
          borderBottom: '1px solid var(--vestara-border-subtle)',
        }}
      >
        <Typography variant="body2" sx={{ fontFamily: 'var(--vestara-font-mono)' }}>
          {title}
        </Typography>
        <Chip label={`${parsed?.lines ?? 0} lines`} size="small" variant="outlined" />
        <Chip label={parsed?.size ?? '0B'} size="small" variant="outlined" />
        {parsed?.truncated && <Chip label="truncated at 200KB" size="small" color="warning" />}
        <Typography
          variant="caption"
          sx={{ marginLeft: 'auto', color: 'var(--vestara-text-muted)', fontFamily: 'var(--vestara-font-mono)' }}
        >
          {note}
        </Typography>
      </Box>
      <Box
        component="pre"
        sx={{
          margin: 0,
          padding: 'var(--vestara-spacing-4)',
          maxHeight: 480,
          overflow: 'auto',
          fontFamily: 'var(--vestara-font-mono)',
          fontSize: 'var(--vestara-font-size-code)',
          color: 'var(--vestara-text-secondary)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {text}
      </Box>
    </Paper>
  );

  return (
    <Box sx={{ minHeight: '100vh', backgroundColor: 'var(--vestara-surface-canvas)' }}>
      {/* Header */}
      <Box
        component="header"
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 'var(--vestara-z-index-sticky)',
          borderBottom: '1px solid var(--vestara-border-subtle)',
          backgroundColor: 'var(--vestara-surface-overlay)',
          backdropFilter: 'blur(18px)',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: '56px',
            paddingX: 'var(--vestara-spacing-4)',
            gap: 'var(--vestara-spacing-3)',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 'var(--vestara-spacing-4)', minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 'var(--vestara-spacing-3)' }}>
              <Box
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: 'var(--vestara-radius)',
                  backgroundColor: 'var(--vestara-accent-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <BoltIcon sx={{ fontSize: 14, color: 'var(--vestara-surface-canvas)' }} />
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 'var(--vestara-spacing-2)' }}>
                <Typography variant="body2" sx={{ fontWeight: 600, letterSpacing: '0.12em' }}>
                  VESTARA
                </Typography>
                <Typography variant="body2" sx={{ color: 'var(--vestara-text-muted)' }}>
                  /
                </Typography>
                <Typography variant="body2" sx={{ color: 'var(--vestara-text-secondary)' }}>
                  EXTRACTOR
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: { xs: 'none', lg: 'flex' }, gap: 'var(--vestara-spacing-2)' }}>
              {headerBadges.map((badge) => (
                <Chip key={badge} label={badge} size="small" variant="outlined" />
              ))}
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 'var(--vestara-spacing-2)', flexShrink: 0 }}>
            <Tooltip
              title="Command palette — ⌘K"
              slotProps={{ tooltip: { sx: { fontFamily: 'var(--vestara-font-mono)' } } }}
            >
              <Button
                size="small"
                startIcon={<SearchIcon sx={{ fontSize: 12 }} />}
                onClick={() => setPaletteOpen(true)}
                aria-label="Open command palette"
                sx={{
                  display: { xs: 'none', md: 'inline-flex' },
                  color: 'var(--vestara-text-secondary)',
                  border: '1px solid var(--vestara-border-default)',
                  borderRadius: 'var(--vestara-radius-full)',
                  fontFamily: 'var(--vestara-font-mono)',
                }}
              >
                Command K
                <Box
                  component="span"
                  sx={{
                    marginLeft: 'var(--vestara-spacing-1)',
                    paddingX: 'var(--vestara-spacing-1)',
                    borderRadius: 'var(--vestara-radius-sm)',
                    backgroundColor: 'var(--vestara-surface-interactive-hover)',
                    fontSize: 'var(--vestara-font-size-caption)',
                  }}
                >
                  ⌘K
                </Box>
              </Button>
            </Tooltip>
            <Button
              size="small"
              onClick={scrollToDrop}
              sx={{
                color: 'var(--vestara-text-secondary)',
                border: '1px solid var(--vestara-border-default)',
                borderRadius: 'var(--vestara-radius-full)',
                fontFamily: 'var(--vestara-font-mono)',
              }}
            >
              Drop artifact
            </Button>
            <Button
              size="small"
              variant="contained"
              startIcon={<DownloadIcon sx={{ fontSize: 14 }} />}
              onClick={handleExport}
              sx={{ borderRadius: 'var(--vestara-radius-full)' }}
            >
              Export manifest
            </Button>
          </Box>
        </Box>
        {/* Mobile component strip */}
        <Box
          sx={{
            display: { xs: 'flex', lg: 'none' },
            gap: 'var(--vestara-spacing-1)',
            overflowX: 'auto',
            paddingX: 'var(--vestara-spacing-3)',
            paddingBottom: 'var(--vestara-spacing-2)',
          }}
        >
          {componentFiles.map((file) => (
            <Chip
              key={file.id}
              label={file.name}
              size="small"
              clickable
              onClick={() => setActiveId(file.id)}
              color={file.id === activeId ? 'primary' : 'default'}
              variant={file.id === activeId ? 'filled' : 'outlined'}
              sx={{ fontFamily: 'var(--vestara-font-mono)', flexShrink: 0 }}
            />
          ))}
        </Box>
      </Box>

      {/* Body */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
        {/* Sidebar */}
        <Box
          component="aside"
          aria-label="Components and recent extractions"
          sx={{
            display: { xs: 'none', lg: 'block' },
            width: 280,
            flexShrink: 0,
            position: 'sticky',
            top: 56,
            maxHeight: 'calc(100vh - 56px)',
            overflowY: 'auto',
            borderRight: '1px solid var(--vestara-border-subtle)',
            padding: 'var(--vestara-spacing-3)',
          }}
        >
          <Typography
            variant="caption"
            sx={{ color: 'var(--vestara-text-muted)', fontFamily: 'var(--vestara-font-mono)' }}
          >
            COMPONENTS
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 'var(--vestara-spacing-1)', mt: 1 }}>
            {componentFiles.map((file) => {
              const Icon = iconFor(file.icon);
              const active = file.id === activeId;
              return (
                <Button
                  key={file.id}
                  fullWidth
                  onClick={() => {
                    setActiveId(file.id);
                    notify(`Selected ${file.name}`);
                  }}
                  aria-pressed={active}
                  sx={{
                    justifyContent: 'flex-start',
                    gap: 'var(--vestara-spacing-2)',
                    padding: 'var(--vestara-spacing-2)',
                    borderRadius: 'var(--vestara-radius)',
                    border: '1px solid',
                    borderColor: active ? 'var(--vestara-accent-border)' : 'transparent',
                    backgroundColor: active ? 'var(--vestara-accent-bg)' : 'transparent',
                    color: active ? 'var(--vestara-text-primary)' : 'var(--vestara-text-secondary)',
                    textTransform: 'none',
                  }}
                >
                  <Icon sx={{ fontSize: 13 }} />
                  <Box sx={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 'var(--vestara-spacing-1)' }}>
                      <Typography variant="caption" noWrap sx={{ fontFamily: 'var(--vestara-font-mono)' }}>
                        {file.name}
                      </Typography>
                      <Box
                        sx={{
                          width: 6,
                          height: 6,
                          borderRadius: 'var(--vestara-radius-full)',
                          backgroundColor:
                            file.status === 'live' ? 'var(--vestara-status-success)' : 'var(--vestara-text-muted)',
                        }}
                      />
                    </Box>
                    <Typography
                      variant="caption"
                      noWrap
                      sx={{ color: 'var(--vestara-text-muted)', fontFamily: 'var(--vestara-font-mono)' }}
                    >
                      {file.path}
                    </Typography>
                  </Box>
                  <Typography variant="caption" sx={{ color: 'var(--vestara-text-muted)' }}>
                    {file.size}
                  </Typography>
                </Button>
              );
            })}
          </Box>
          <Divider sx={{ my: 2 }} />
          <Typography
            variant="caption"
            sx={{ color: 'var(--vestara-text-muted)', fontFamily: 'var(--vestara-font-mono)' }}
          >
            RECENT EXTRACTIONS
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 'var(--vestara-spacing-1)', mt: 1 }}>
            {recentExtractions.map((item) => (
              <Button
                key={item.name}
                fullWidth
                onClick={() => notify(`Open ${item.name}`)}
                sx={{
                  justifyContent: 'flex-start',
                  textTransform: 'none',
                  color: 'var(--vestara-text-secondary)',
                  border: '1px solid var(--vestara-border-subtle)',
                  borderRadius: 'var(--vestara-radius)',
                }}
              >
                <DescriptionIcon sx={{ fontSize: 12, color: 'var(--vestara-text-muted)', mr: 1 }} />
                <Typography
                  variant="caption"
                  noWrap
                  sx={{ flex: 1, textAlign: 'left', fontFamily: 'var(--vestara-font-mono)' }}
                >
                  {item.name}
                </Typography>
                <Typography variant="caption" sx={{ color: 'var(--vestara-text-muted)' }}>
                  {item.time}
                </Typography>
              </Button>
            ))}
          </Box>
        </Box>

        {/* Main */}
        <Box sx={{ flex: 1, minWidth: 0, padding: 'var(--vestara-spacing-4)' }}>
          <Typography variant="body2" sx={{ color: 'var(--vestara-accent-text)' }}>
            Bundle • Live extraction • Glass workspace
          </Typography>
          <Typography variant="body2" sx={{ color: 'var(--vestara-text-muted)', mt: 1 }}>
            {referenceNote}
          </Typography>

          {/* Drop zone */}
          <Paper
            ref={dropRef}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            sx={{
              mt: 3,
              padding: 'var(--vestara-spacing-5)',
              border: '1px dashed',
              borderColor: dragOver ? 'var(--vestara-accent-primary)' : 'var(--vestara-extractor-drop-idle)',
              backgroundColor: dragOver ? 'var(--vestara-accent-bg)' : 'var(--vestara-surface-shell)',
              boxShadow: dragOver ? 'var(--vestara-elevation-lg)' : 'none',
            }}
          >
            <Box sx={{ display: 'flex', gap: 'var(--vestara-spacing-4)', alignItems: 'center' }}>
              <CloudUploadIcon sx={{ fontSize: 20, color: 'var(--vestara-accent-primary)' }} />
              <Box>
                <Typography variant="subtitle1">Drop React artifact HTML here</Typography>
                <Typography
                  variant="body2"
                  sx={{ color: 'var(--vestara-text-muted)', fontFamily: 'var(--vestara-font-mono)' }}
                >
                  Client-side only — parsed in your browser, never uploaded. File drop or paste a URL.
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--vestara-spacing-2)', mt: 2 }}>
              <Button size="small" variant="contained" onClick={() => fileRef.current?.click()}>
                Choose file
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".html"
                hidden
                aria-label="Choose artifact HTML file"
                onChange={(e) => {
                  handleFiles(e.target.files);
                  e.target.value = '';
                }}
              />
              <TextField
                size="small"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleFetch();
                }}
                placeholder="https://…"
                disabled={fetching}
                slotProps={{ htmlInput: { 'aria-label': 'Artifact URL' } as Record<string, unknown> }}
                sx={{
                  flex: 1,
                  minWidth: 200,
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 'var(--vestara-radius-full)',
                    fontFamily: 'var(--vestara-font-mono)',
                  },
                }}
              />
              <Button
                size="small"
                variant="outlined"
                startIcon={fetching ? undefined : <LinkIcon sx={{ fontSize: 12 }} />}
                onClick={() => void handleFetch()}
                disabled={fetching}
              >
                {fetching ? <CircularProgress size={14} /> : 'Fetch'}
              </Button>
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--vestara-spacing-2)', mt: 2 }}>
              <Chip label=".html • up to 10MB" size="small" variant="outlined" />
              <Chip label="Paste • Drag • URL" size="small" variant="outlined" />
              {parsed && (
                <Chip
                  label={`${parsed.name} • ${parsed.size} • ${parsed.elements} elements`}
                  size="small"
                  color="primary"
                  icon={<CheckCircleIcon />}
                />
              )}
            </Box>
            {parsed && parsed.topTags.length > 0 && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--vestara-spacing-1)', mt: 2 }}>
                <Typography
                  variant="caption"
                  sx={{
                    width: '100%',
                    color: 'var(--vestara-text-muted)',
                    fontFamily: 'var(--vestara-font-mono)',
                  }}
                >
                  TOP TAGS
                </Typography>
                {parsed.topTags.map((t) => (
                  <Chip key={t.tag} label={`${t.tag} ×${t.count}`} size="small" variant="outlined" />
                ))}
              </Box>
            )}
          </Paper>

          {/* Preview modes */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 'var(--vestara-spacing-2)', mt: 3 }}>
            <Tabs
              value={mode}
              onChange={(_, value: PreviewMode) => setMode(value)}
              sx={{ borderBottom: '1px solid var(--vestara-border-subtle)', flex: 1 }}
              aria-label="Preview modes"
            >
              <Tab value="preview" label="Preview" />
              <Tab value="original" label="Original" />
              <Tab value="cleaned" label="Cleaned" />
            </Tabs>
          </Box>
          {mode === 'preview' ? (
            <Box sx={{ py: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 'var(--vestara-spacing-2)', mb: 2 }}>
                <Typography variant="body2" sx={{ color: 'var(--vestara-text-secondary)' }}>
                  Reference examples
                </Typography>
                <Chip label={`${activeFile.name} • ${activeFile.path}`} size="small" variant="outlined" />
              </Box>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--vestara-spacing-3)' }}>
                <Button variant="contained" size="small" sx={{ borderRadius: 'var(--vestara-radius-full)' }}>
                  Primary
                </Button>
                <Button
                  size="small"
                  sx={{
                    borderRadius: 'var(--vestara-radius-full)',
                    border: '1px solid var(--vestara-border-default)',
                    color: 'var(--vestara-text-secondary)',
                  }}
                >
                  Ghost
                </Button>
                <Button size="small" variant="outlined" sx={{ borderRadius: 'var(--vestara-radius-full)' }}>
                  Outline
                </Button>
                <Paper sx={{ width: 300, padding: 'var(--vestara-spacing-4)' }}>
                  <Box
                    sx={{
                      height: 96,
                      borderRadius: 'var(--vestara-radius)',
                      backgroundColor: 'var(--vestara-surface-interactive)',
                      mb: 2,
                    }}
                  />
                  <Box
                    sx={{
                      height: 12,
                      width: '75%',
                      borderRadius: 'var(--vestara-radius-sm)',
                      backgroundColor: 'var(--vestara-surface-interactive-hover)',
                      mb: 1,
                    }}
                  />
                  <Box
                    sx={{
                      height: 12,
                      width: '50%',
                      borderRadius: 'var(--vestara-radius-sm)',
                      backgroundColor: 'var(--vestara-surface-interactive)',
                    }}
                  />
                </Paper>
              </Box>
            </Box>
          ) : parsed ? (
            renderMarkupTab(
              mode === 'original' ? 'Original markup' : 'Cleaned markup',
              mode === 'original' ? parsed.original : parsed.cleaned,
              mode === 'original' ? 'Raw artifact, unmodified' : 'Scripts, styles and on* handlers stripped',
            )
          ) : (
            <Paper sx={{ mt: 2, padding: 'var(--vestara-spacing-5)', textAlign: 'center' }}>
              <Typography variant="body2" sx={{ color: 'var(--vestara-text-muted)' }}>
                No artifact parsed yet
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  mt: 1,
                  color: 'var(--vestara-text-muted)',
                  fontFamily: 'var(--vestara-font-mono)',
                }}
              >
                Live preview placeholder
              </Typography>
              <Button size="small" variant="outlined" onClick={scrollToDrop} sx={{ mt: 2 }}>
                Drop artifact
              </Button>
            </Paper>
          )}
          {mode === 'cleaned' && parsed && parsed.customProps.length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--vestara-spacing-1)', mt: 2 }}>
              <Typography
                variant="caption"
                sx={{
                  width: '100%',
                  color: 'var(--vestara-text-muted)',
                  fontFamily: 'var(--vestara-font-mono)',
                }}
              >
                CUSTOM PROPERTIES ({parsed.customProps.length})
              </Typography>
              {parsed.customProps.map((prop) => (
                <Chip key={prop} label={prop} size="small" variant="outlined" />
              ))}
            </Box>
          )}

          <Typography
            variant="caption"
            sx={{
              display: 'block',
              mt: 4,
              textAlign: 'center',
              color: 'var(--vestara-text-muted)',
              fontFamily: 'var(--vestara-font-mono)',
            }}
          >
            Client-side only • Vestara Extractor
          </Typography>
        </Box>

        {/* Inspector */}
        <Box
          component="aside"
          aria-label="Props inspector"
          sx={{
            display: { xs: 'none', xl: 'block' },
            width: 320,
            flexShrink: 0,
            position: 'sticky',
            top: 56,
            maxHeight: 'calc(100vh - 56px)',
            overflowY: 'auto',
            borderLeft: '1px solid var(--vestara-border-subtle)',
            padding: 'var(--vestara-spacing-3)',
          }}
        >
          <Typography variant="caption" sx={{ color: 'var(--vestara-text-muted)' }}>
            PROPS
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', color: 'var(--vestara-text-muted)' }}>
            Preview updates as you edit props
          </Typography>
          <Table size="small" sx={{ mt: 1 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ color: 'var(--vestara-text-muted)' }}>Prop</TableCell>
                <TableCell sx={{ color: 'var(--vestara-text-muted)' }}>Type</TableCell>
                <TableCell sx={{ color: 'var(--vestara-text-muted)' }}>Default</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {props.map((row, index) => (
                <TableRow key={row.name}>
                  <TableCell sx={{ fontFamily: 'var(--vestara-font-mono)' }}>{row.name}</TableCell>
                  <TableCell sx={{ fontFamily: 'var(--vestara-font-mono)', color: 'var(--vestara-text-muted)' }}>
                    {row.type}
                  </TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      value={row.defaultValue}
                      onChange={(e) => updateDefault(index, e.target.value)}
                      variant="standard"
                      slotProps={{ htmlInput: { 'aria-label': `${row.name} default` } as Record<string, unknown> }}
                      sx={{ '& .MuiInputBase-input': { fontFamily: 'var(--vestara-font-mono)' } }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'var(--vestara-text-muted)' }}>
            vars — {parsed ? `${parsed.customProps.length} custom props` : 'Used by preview'} • Resolved at runtime
          </Typography>
          <Divider sx={{ my: 2 }} />
          <Typography variant="caption" sx={{ color: 'var(--vestara-text-muted)' }}>
            IMPORT
          </Typography>
          <Paper
            component="pre"
            sx={{
              margin: 'var(--vestara-spacing-1) 0 0',
              padding: 'var(--vestara-spacing-2)',
              fontFamily: 'var(--vestara-font-mono)',
              fontSize: 'var(--vestara-font-size-code)',
              color: 'var(--vestara-text-secondary)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: 160,
              overflow: 'auto',
            }}
          >
            {importSnippet}
          </Paper>
          <Box sx={{ display: 'flex', gap: 'var(--vestara-spacing-1)', mt: 1 }}>
            <Button
              size="small"
              startIcon={<ContentCopyIcon sx={{ fontSize: 12 }} />}
              onClick={() => void copyText(importSnippet, 'Import snippet')}
            >
              Copy
            </Button>
            <Button
              size="small"
              startIcon={<ContentCopyIcon sx={{ fontSize: 12 }} />}
              onClick={() => {
                if (parsed) void copyText(parsed.cleaned, 'Cleaned markup');
                else notify('Drop an artifact first');
              }}
            >
              Cleaned
            </Button>
          </Box>
          <Typography variant="caption" sx={{ display: 'block', mt: 2, color: 'var(--vestara-text-muted)' }}>
            ACTIONS
          </Typography>
          <Box sx={{ display: 'flex', gap: 'var(--vestara-spacing-1)', mt: 1 }}>
            <Button size="small" variant="outlined" onClick={handleExport}>
              Manifest
            </Button>
            <Button size="small" onClick={() => notify('Tab closed')}>
              Close tab
            </Button>
          </Box>
          <Paper sx={{ mt: 3, padding: 'var(--vestara-spacing-3)', borderColor: 'var(--vestara-accent-border)' }}>
            <Typography variant="caption" sx={{ color: 'var(--vestara-accent-text)' }}>
              Extractor tip
            </Typography>
            <Typography variant="body2" sx={{ color: 'var(--vestara-text-muted)', mt: 1 }}>
              {extractorTip}
            </Typography>
          </Paper>
        </Box>
      </Box>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />

      <Snackbar
        open={toast !== ''}
        autoHideDuration={2600}
        onClose={() => setToast('')}
        message={toast}
        action={
          <IconButton size="small" onClick={() => setToast('')} aria-label="Dismiss notification">
            <CloseIcon sx={{ fontSize: 14, color: 'var(--vestara-text-secondary)' }} />
          </IconButton>
        }
        sx={{ '& .MuiSnackbarContent-root': { backgroundColor: 'var(--vestara-surface-panel-raised)' } }}
      />
    </Box>
  );
}
