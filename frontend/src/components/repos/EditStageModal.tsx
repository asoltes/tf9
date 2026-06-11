/**
 * Edit-stage modal — plain JSX port of the prototype's `openEdit` modal
 * (design_handoff_tfops/repos/app.js). Uses the global .overlay/.modal classes.
 *
 * Fields: Stage name · Directory (read-only) · AWS profile (select) ·
 * Region (select) · Account ID · Pipeline group (datalist autocomplete) ·
 * Require manual approval toggle.
 */
import { useEffect, useState, useRef } from 'react';
import type { RepoTarget } from '../../types';
import { awsApi, type AWSProfileDetail } from '../../api';
import { groupKeyOf } from './repoModel';

const REGIONS = [
  'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1', 'eu-north-1',
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2', 'ap-south-1',
  'ca-central-1', 'sa-east-1', 'af-south-1', 'me-south-1',
];

interface EditStageModalProps {
  target: RepoTarget | null;
  awsProfiles: string[];
  onSave: (updated: RepoTarget) => void;
  onCancel: () => void;
}

function selectOptions(values: string[], current: string): string[] {
  if (current && !values.includes(current)) return [current, ...values];
  return values;
}

export default function EditStageModal({
  target,
  awsProfiles,
  onSave,
  onCancel,
}: EditStageModalProps) {
  const [name, setName] = useState('');
  const [profile, setProfile] = useState('');
  const [region, setRegion] = useState('');
  const [account, setAccount] = useState('');
  const [group, setGroup] = useState('');
  const [groupMode, setGroupMode] = useState<'prefix' | 'custom'>('prefix');
  const [gated, setGated] = useState(false);
  const [profileDetails, setProfileDetails] = useState<Record<string, AWSProfileDetail>>({});
  // Track which fields were auto-filled from the profile so manual edits are respected.
  const autoFilled = useRef({ region: false, account: false });

  // Fetch ~/.aws/config region + account data once.
  useEffect(() => {
    awsApi.profileDetails().then(d => setProfileDetails(d ?? {})).catch(() => {});
  }, []);

  // Re-populate form state when the modal opens for a different target.
  useEffect(() => {
    if (!target) return;
    setName(target.name);
    setProfile(target.aws_profile || '');
    setRegion(target.region || '');
    setAccount(target.account_id || '');
    autoFilled.current = { region: false, account: false };
    const g = target.group || groupKeyOf(target);
    setGroup(g);
    setGated(!!(target as RepoTarget & { gated?: boolean }).gated);
    const parts = (target.directory || '').split('/').filter(Boolean);
    const prefixes: string[] = [];
    for (let i = 1; i < parts.length; i++) prefixes.push(parts.slice(0, i).join('/'));
    setGroupMode(prefixes.includes(g) ? 'prefix' : 'custom');
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [target, onCancel]);

  if (!target) return null;

  function handleProfileChange(newProfile: string) {
    setProfile(newProfile);
    const detail = profileDetails[newProfile];
    if (!detail) return;
    // Auto-fill region if the field is blank or was previously auto-filled.
    if (detail.region && (!region || autoFilled.current.region)) {
      setRegion(detail.region);
      autoFilled.current.region = true;
    }
    // Auto-fill account if the field is blank or was previously auto-filled.
    if (detail.account_id && (!account || autoFilled.current.account)) {
      setAccount(detail.account_id);
      autoFilled.current.account = true;
    }
  }

  const profileOpts = selectOptions(awsProfiles, profile);
  const regionOpts = selectOptions(REGIONS, region);
  const defaultGroup = (target.directory || '').split('/')[0] || '';

  const dirParts = (target.directory || '').split('/').filter(Boolean);
  const dirPrefixes: string[] = [];
  for (let i = 1; i < dirParts.length; i++) dirPrefixes.push(dirParts.slice(0, i).join('/'));

  function save() {
    if (!target) return;
    const next: RepoTarget & { gated?: boolean } = { ...target };
    next.name = name.trim() || target.name;
    // Preserve existing values if the user left the fields untouched.
    next.aws_profile = profile || target.aws_profile || '';
    next.region     = region  || target.region      || '';
    next.account_id = account.trim() || target.account_id || '';
    next.gated = gated;
    const ng = group.trim();
    if (ng && ng !== defaultGroup) next.group = ng;
    else delete next.group;
    onSave(next);
  }

  const hasDetail = !!profileDetails[profile];

  return (
    <div className="overlay show" onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal">
        <div className="modal-head">Edit stage · {target.name}</div>
        <div className="modal-body">
          <div style={{ marginBottom: 16 }}>
            <label className="field-label">Stage name</label>
            <input className="inp" value={name} onChange={e => setName(e.target.value)} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label className="field-label">Directory</label>
            <input
              className="inp mono"
              value={target.directory}
              disabled
              style={{ background: '#f4f6f8', color: 'var(--text-2)' }}
            />
            <div className="field-hint">Path is fixed to the Terraform directory.</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ marginBottom: 16 }}>
              <label className="field-label">AWS profile</label>
              <select className="sel" value={profile} onChange={e => handleProfileChange(e.target.value)}>
                {profileOpts.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              {hasDetail && (
                <div className="field-hint" style={{ marginTop: 4 }}>
                  Region and account auto-populated from <code>~/.aws/config</code>
                </div>
              )}
            </div>
            <div style={{ marginBottom: 16 }}>
              <label className="field-label">Region</label>
              <select
                className="sel"
                value={region}
                onChange={e => { setRegion(e.target.value); autoFilled.current.region = false; }}
              >
                {!region && <option value="">— select region —</option>}
                {regionOpts.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label className="field-label">Expected account ID</label>
            <input
              className="inp mono"
              value={account}
              onChange={e => { setAccount(e.target.value); autoFilled.current.account = false; }}
              placeholder="Optional — verified via STS before runs"
            />
            <div className="field-hint">When set, tfops checks the AWS account before applying.</div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label className="field-label">Pipeline group</label>
            <select
              className="sel"
              value={groupMode === 'prefix' ? group : '__custom__'}
              onChange={e => {
                if (e.target.value === '__custom__') {
                  setGroupMode('custom');
                } else {
                  setGroupMode('prefix');
                  setGroup(e.target.value);
                }
              }}
            >
              {dirPrefixes.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
              <option value="__custom__">Custom…</option>
            </select>
            {groupMode === 'custom' && (
              <input
                className="inp mono"
                value={group}
                onChange={e => setGroup(e.target.value)}
                placeholder="e.g. environments"
                style={{ marginTop: 8 }}
                aria-label="Custom pipeline group"
              />
            )}
            <div className="field-hint">
              Override which pipeline group this stage belongs to. Changing this moves it in the New Run Modal.
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 4, cursor: 'pointer' }}>
            <span
              className={'switch' + (gated ? ' on' : '')}
              onClick={() => setGated(g => !g)}
            />
            <span>
              <b style={{ fontSize: 13 }}>Require manual approval</b>
              <div className="field-hint" style={{ margin: 0 }}>
                Pause the promotion before this stage until approved.
              </div>
            </span>
          </label>
        </div>
        <div className="modal-foot">
          <button className="btn btn-normal" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>Save changes</button>
        </div>
      </div>
    </div>
  );
}
