import { useEffect, useMemo, useRef, useState } from 'react';
import Shell from '../Shell';
import GraphView from '../components/GraphView';
import { api, graphApi } from '../api';
import type { GraphDocument, Paginated, Run } from '../types';
import './Graph.css';

export default function GraphPage({ runId }: { runId?: string }) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [selected, setSelected] = useState(runId || '');
  const [doc, setDoc] = useState<GraphDocument | null>(null);
  const [error, setError] = useState('');
  const [followLatest, setFollowLatest] = useState(!runId);
  const selectedRef = useRef(selected);
  const selectedRun = useMemo(() => runs.find(r => r.id === selected), [runs, selected]);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    let active = true;
    const loadRuns = () => api.get<Paginated<Run>>('/api/runs?limit=200')
      .then(res => {
        if (!active) return;
        const graphRuns = (res.items ?? []).filter(r => r.hasGraph);
        setRuns(graphRuns);
        if (graphRuns[0] && (followLatest || !selectedRef.current || !graphRuns.some(r => r.id === selectedRef.current))) {
          setSelected(graphRuns[0].id);
          window.history.replaceState(null, '', `#graph?run=${encodeURIComponent(graphRuns[0].id)}`);
        }
      })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Failed to load graph runs.'); });
    loadRuns();
    const timer = window.setInterval(loadRuns, 2000);
    return () => { active = false; window.clearInterval(timer); };
  }, [followLatest]);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    const load = () => graphApi.get(selected)
      .then(next => { if (active) { setDoc(next); setError(''); } })
      .catch(e => { if (active) { setDoc(null); setError(e instanceof Error ? e.message : 'Graph unavailable.'); } });
    load();
    const timer = selectedRun?.status === 'running' ? window.setInterval(load, 1200) : undefined;
    return () => { active = false; if (timer) window.clearInterval(timer); };
  }, [selected, selectedRun?.status]);

  return (
    <Shell fullWidth>
      <div className="graph-page">
        <div className="page-head">
          <div><h1 className="page-title">Graph View</h1><p className="page-subtitle">Explore repository, target, module, and resource relationships from Terraform plans and infrastructure changes.</p></div>
          <label className="graph-run-select">
            <span>Terraform run</span>
            <select
              value={selected}
              onChange={e => {
                setFollowLatest(false);
                setSelected(e.target.value);
                window.history.replaceState(null, '', `#graph?run=${encodeURIComponent(e.target.value)}`);
              }}
            >
              {runs.length === 0 && <option value="">No graph runs</option>}
              {runs.map(run => <option key={run.id} value={run.id}>{run.id} · {run.request?.command || run.command} · {run.repo || run.request?.repo || 'repository'} · {run.status}</option>)}
            </select>
            <button
              type="button"
              className={followLatest ? 'active' : ''}
              onClick={() => setFollowLatest(true)}
              title="Automatically follow the newest Terraform graph"
            >
              {followLatest ? 'Following latest' : 'Follow latest'}
            </button>
          </label>
        </div>
        {selectedRun && <div className="graph-meta"><span>{selectedRun.repo || selectedRun.request?.repo}</span><span>{selectedRun.id}</span><span className={selectedRun.status}>{selectedRun.status}</span>{doc && <span>revision {doc.revision}</span>}</div>}
        {error && <div className="graph-message error">{error}</div>}
        {!error && !doc && <div className="graph-message">No graph is available yet. Run Terraform plan, apply, or destroy to create one.</div>}
        {doc && <GraphView document={doc} />}
      </div>
    </Shell>
  );
}
