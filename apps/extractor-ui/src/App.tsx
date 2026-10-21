import { ThemeProvider } from '@mui/material/styles';
import ExtractorPage from './features/extractor/ExtractorPage';
import { extractorTheme } from './theme';

export default function App() {
  return (
    <ThemeProvider theme={extractorTheme}>
      <ExtractorPage />
    </ThemeProvider>
  );
}
