import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { TrialActivityRoom } from '../components/qualification/TrialActivityRoom.js';
import type { QualificationTrial } from '../lib/qualification.js';
import { qualificationClient } from '../lib/qualification.js';

export default function QualificationActivity() {
  const { profileId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const agent = searchParams.get('agent') ?? undefined;
  const [trial, setTrial] = useState<QualificationTrial | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setTrial(await qualificationClient.trial(profileId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load trial activity');
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link to={`/qualification/${encodeURIComponent(profileId)}`} className="text-xs text-sky-400 hover:underline">
          ← Trial detail
        </Link>
        <span className="text-[10px] text-(--vestara-text-muted)">Activity Room · {profileId}</span>
      </div>
      {error && <div className="text-xs text-red-300">{error}</div>}
      {loading ? (
        <div className="py-12 text-center text-sm text-(--vestara-text-muted)">Loading activity…</div>
      ) : trial ? (
        <TrialActivityRoom trial={trial} agentFilter={agent} />
      ) : (
        <div className="py-12 text-center text-sm text-(--vestara-text-muted)">No trial found.</div>
      )}
    </div>
  );
}
