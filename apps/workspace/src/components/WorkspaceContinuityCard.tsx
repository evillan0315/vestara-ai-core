import { Card, CardContent, Typography, Button, Box, Chip } from '@mui/material';
import HistoryIcon from '@mui/icons-material/History';

export interface ContinuityContext {
  workspaceName: string;
  lastMilestone: string;
  nextRecommended: string;
  decisionCount: number;
  lastActive: string;
}

interface Props {
  context: ContinuityContext | null;
  loading: boolean;
  onContinue: () => void;
  onDismiss: () => void;
}

export default function WorkspaceContinuityCard({ context, loading, onContinue, onDismiss }: Props) {
  if (loading) {
    return (
      <Card sx={{ mb: 2, bgcolor: 'primary.dark', color: 'primary.contrastText' }}>
        <CardContent>
          <Typography variant="body2">Restoring workspace...</Typography>
        </CardContent>
      </Card>
    );
  }

  if (!context) return null;

  return (
    <Card sx={{ mb: 2, bgcolor: 'primary.dark', color: 'primary.contrastText' }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <HistoryIcon />
          <Typography variant="h6">Welcome Back</Typography>
        </Box>

        <Typography variant="body1" sx={{ mb: 1 }}>
          Restored your <strong>{context.workspaceName}</strong> workspace.
        </Typography>

        <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
          <Chip label={`${context.decisionCount} decisions`} size="small" variant="outlined" />
          <Chip label={context.lastMilestone} size="small" variant="outlined" />
        </Box>

        <Typography variant="body2" sx={{ mb: 2, opacity: 0.9 }}>
          Last session: {context.lastActive}. Next recommended milestone: <strong>{context.nextRecommended}</strong>.
        </Typography>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="contained" color="secondary" onClick={onContinue}>
            Continue
          </Button>
          <Button variant="text" color="inherit" onClick={onDismiss}>
            Dismiss
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}
