import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { TrialDetailPanel } from '../components/qualification/TrialDetailPanel.js';
import type { QualificationTrial } from '../lib/qualification.js';
import { qualificationClient } from '../lib/qualification.js';

export default function QualificationDetail() {
  const { profileId = '' } = useParams();
  const [trial, setTrial] = useState<QualificationTrial | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setTrial(await qualificationClient.trial(profileId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load trial');
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <Link to="/qualification" className="text-xs text-sky-400 hover:underline">
        ← All qualification trials
      </Link>
      {error && <div className="text-xs text-red-300">{error}</div>}
      {loading ? (
        <div className="py-12 text-center text-sm text-(--vestara-text-muted)">Loading trial…</div>
      ) : trial ? (
        <TrialDetailPanel trial={trial} />
      ) : (
        <div className="py-12 text-center text-sm text-(--vestara-text-muted)">No trial found.</div>
      )}
    </div>
  );
}
