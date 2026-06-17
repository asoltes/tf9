import { useEffect, useState } from 'react';
import { aiModelsApi, api, awsApi, insightsPromptApi, parallelWorkersApi, reconcilePromptApi, type AWSProfileDetail } from '../api';
import type { AIModel, Paginated, Repo, RepoConfig } from '../types';
import { DEFAULT_RECONCILE_PROMPT } from '../lib/reconcilePrompt';
import { DEFAULT_INSIGHTS_PROMPT } from '../lib/insightsPrompt';
import { IconFlow, IconKey, IconList, IconPlus, IconTrash } from './repos/icons';

type RepoDefaults = Pick<RepoConfig,
  'default_aws_profile' | 'default_account_id' | 'default_region'
  | 'integration_branch' | 'active_branch_window_days' | 'active_branch_limit'>;

const EMPTY_DEFAULTS: RepoDefaults = {
  default_aws_profile: '',
  default_account_id: '',
  default_region: '',
  integration_branch: '',
};

export default function GlobalSettingsEditor({
  disabled,
  notify,
  onSaved,
}: {
  disabled: boolean;
  notify: (message: string) => void;
  onSaved: () => Promise<void>;
}) {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [repoName, setRepoName] = useState('');
  const [repoConfig, setRepoConfig] = useState<RepoConfig | null>(null);
  const [defaults, setDefaults] = useState<RepoDefaults>(EMPTY_DEFAULTS);
  const [awsProfiles, setAwsProfiles] = useState<string[]>([]);
  const [profileDetails, setProfileDetails] = useState<Record<string, AWSProfileDetail>>({});
  const [prompt, setPrompt] = useState(DEFAULT_RECONCILE_PROMPT);
  const [insightsPrompt, setInsightsPrompt] = useState(DEFAULT_INSIGHTS_PROMPT);
  const [aiModels, setAiModels] = useState<AIModel[]>([]);
  const [parallelWorkers, setParallelWorkers] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [promptSaving, setPromptSaving] = useState(false);
  const [insightsPromptSaving, setInsightsPromptSaving] = useState(false);
  const [modelsSaving, setModelsSaving] = useState(false);
  const [workersSaving, setWorkersSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.get<Paginated<Repo>>('/api/repos?limit=500'),
      awsApi.profiles().catch(() => []),
      awsApi.profileDetails().catch(() => ({})),
      reconcilePromptApi.get().catch(() => ({ prompt: '' })),
      aiModelsApi.get().catch(() => ({ models: [] })),
      parallelWorkersApi.get().catch(() => ({ workers: 0 })),
      insightsPromptApi.get().catch(() => ({ prompt: '' })),
    ]).then(([repoResult, profiles, details, promptResult, modelsResult, workersResult, insightsPromptResult]) => {
      const enabled = repoResult.items.filter(repo => !repo.disabled);
      setRepos(enabled);
      setRepoName(enabled[0]?.name ?? '');
      setAwsProfiles(profiles);
      setProfileDetails(details);
      setPrompt(promptResult.prompt || DEFAULT_RECONCILE_PROMPT);
      setAiModels(modelsResult.models ?? []);
      setParallelWorkers(workersResult.workers ?? 0);
      setInsightsPrompt(insightsPromptResult.prompt || DEFAULT_INSIGHTS_PROMPT);
    }).catch(err => setError(err instanceof Error ? err.message : 'Could not load global settings.'));
  }, []);

  useEffect(() => {
    if (!repoName) {
      setRepoConfig(null);
      setDefaults(EMPTY_DEFAULTS);
      return;
    }
    api.get<RepoConfig>(`/api/repos/${encodeURIComponent(repoName)}/config`)
      .then(config => {
        setRepoConfig(config);
        setDefaults({
          default_aws_profile: config.default_aws_profile || '',
          default_account_id: config.default_account_id || '',
          default_region: config.default_region || '',
          integration_branch: config.integration_branch || '',
          active_branch_window_days: config.active_branch_window_days,
          active_branch_limit: config.active_branch_limit,
        });
        setError('');
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Could not load repository defaults.'));
  }, [repoName]);

  const profileOptions = defaults.default_aws_profile && !awsProfiles.includes(defaults.default_aws_profile)
    ? [defaults.default_aws_profile, ...awsProfiles]
    : awsProfiles;

  function setDefaultProfile(profile: string) {
    const detail = profileDetails[profile];
    setDefaults(current => ({
      ...current,
      default_aws_profile: profile,
      default_region: detail?.region || current.default_region,
      default_account_id: detail?.account_id || current.default_account_id,
    }));
  }

  async function saveRepositoryDefaults() {
    if (!repoName || !repoConfig) return;
    const accountID = (defaults.default_account_id || '').trim();
    if (accountID && !/^\d{12}$/.test(accountID)) {
      setError('Default account ID must be exactly 12 digits.');
      return;
    }
    setSaving(true);
    try {
      await api.put(`/api/repos/${encodeURIComponent(repoName)}/config`, {
        ...repoConfig,
        ...defaults,
      });
      await onSaved();
      setError('');
      notify(`Repository defaults for ${repoName} saved`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save repository defaults.');
    } finally {
      setSaving(false);
    }
  }

  async function savePrompt() {
    const value = prompt.trim() === DEFAULT_RECONCILE_PROMPT.trim() ? '' : prompt;
    setPromptSaving(true);
    try {
      const saved = await reconcilePromptApi.save(value);
      setPrompt(saved.prompt || DEFAULT_RECONCILE_PROMPT);
      await onSaved();
      setError('');
      notify('Reconcile with AI prompt saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the global reconcile prompt.');
    } finally {
      setPromptSaving(false);
    }
  }

  function updateModel(index: number, patch: Partial<AIModel>) {
    setAiModels(current => current.map((model, i) => (i === index ? { ...model, ...patch } : model)));
  }

  function setDefaultModel(index: number) {
    setAiModels(current => current.map((model, i) => ({ ...model, default: i === index })));
  }

  function addModel() {
    setAiModels(current => [...current, { label: '', id: '', default: current.length === 0 }]);
  }

  function removeModel(index: number) {
    setAiModels(current => current.filter((_, i) => i !== index));
  }

  async function saveInsightsPrompt() {
    const value = insightsPrompt.trim() === DEFAULT_INSIGHTS_PROMPT.trim() ? '' : insightsPrompt;
    setInsightsPromptSaving(true);
    try {
      const saved = await insightsPromptApi.save(value);
      setInsightsPrompt(saved.prompt || DEFAULT_INSIGHTS_PROMPT);
      await onSaved();
      setError('');
      notify('AI insights prompt saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the AI insights prompt.');
    } finally {
      setInsightsPromptSaving(false);
    }
  }

  async function saveParallelWorkers() {
    setWorkersSaving(true);
    try {
      const saved = await parallelWorkersApi.save(parallelWorkers);
      setParallelWorkers(saved.workers ?? 0);
      await onSaved();
      setError('');
      notify('Parallel workers saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save parallel workers.');
    } finally {
      setWorkersSaving(false);
    }
  }

  async function saveAiModels(models: AIModel[]) {
    setModelsSaving(true);
    try {
      const saved = await aiModelsApi.save(models);
      setAiModels(saved.models ?? []);
      await onSaved();
      setError('');
      notify('AI models saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save AI models.');
    } finally {
      setModelsSaving(false);
    }
  }

  return (
    <section className="container config-global-settings" aria-labelledby="config-global-settings-title">
      <div className="c-head">
        <div>
          <div className="c-title" id="config-global-settings-title">Global settings</div>
          <div className="c-desc">Repository defaults and AI reconciliation behavior stored in config.yaml.</div>
        </div>
      </div>
      {error && <div className="config-global-error">{error}</div>}
      <div className="config-settings-grid">
        <div className="config-settings-group">
          <div className="config-settings-group-head">
            <span className="config-settings-icon"><IconKey /></span>
            <div>
              <strong>Repository defaults</strong>
              <span>Select a repository to edit its AWS and branch discovery defaults.</span>
            </div>
            <button className="btn btn-primary btn-sm" disabled={disabled || saving || !repoConfig} onClick={saveRepositoryDefaults}>
              {saving ? 'Saving…' : 'Save defaults'}
            </button>
          </div>
          <div className="config-settings-fields">
            <label className="config-settings-repo">
              <span>Repository</span>
              <select className="sel" value={repoName} onChange={event => setRepoName(event.target.value)}>
                {repos.length === 0 && <option value="">No repositories configured</option>}
                {repos.map(repo => <option key={repo.name} value={repo.name}>{repo.name}</option>)}
              </select>
            </label>
            <label>
              <span>Default AWS profile</span>
              <select className="sel" value={defaults.default_aws_profile || ''} onChange={event => setDefaultProfile(event.target.value)}>
                <option value="">Select a profile</option>
                {profileOptions.map(profile => <option key={profile} value={profile}>{profile}</option>)}
              </select>
            </label>
            <label>
              <span>Default region</span>
              <input className="inp mono" value={defaults.default_region || ''} onChange={event => setDefaults({ ...defaults, default_region: event.target.value })} placeholder="eu-west-2" />
            </label>
            <label>
              <span>Default account ID</span>
              <input className="inp mono" value={defaults.default_account_id || ''} onChange={event => setDefaults({ ...defaults, default_account_id: event.target.value })} placeholder="Optional 12-digit ID" />
            </label>
            <label>
              <span>Deployment baseline</span>
              <input className="inp mono" value={defaults.integration_branch || ''} onChange={event => setDefaults({ ...defaults, integration_branch: event.target.value })} placeholder="main" />
            </label>
            <label>
              <span>Recent branch window</span>
              <input className="inp mono" type="number" min={1} value={defaults.active_branch_window_days ?? ''} onChange={event => setDefaults({ ...defaults, active_branch_window_days: event.target.value ? Number(event.target.value) : undefined })} placeholder="30" />
            </label>
            <label>
              <span>Maximum AI branches</span>
              <input className="inp mono" type="number" min={1} value={defaults.active_branch_limit ?? ''} onChange={event => setDefaults({ ...defaults, active_branch_limit: event.target.value ? Number(event.target.value) : undefined })} placeholder="20" />
            </label>
          </div>
        </div>

        <div className="config-settings-group config-prompt-group">
          <div className="config-settings-group-head">
            <span className="config-settings-icon ai"><IconFlow /></span>
            <div>
              <strong>Reconcile with AI prompt</strong>
              <span>Global instructions used by every repository after tf9 adds live drift context.</span>
            </div>
            <span className="config-prompt-state">{prompt === DEFAULT_RECONCILE_PROMPT ? 'Built-in default' : 'Custom override'}</span>
          </div>
          <div className="config-prompt-editor">
            <div className="config-prompt-toolbar">
              <span>web.reconcile_prompt</span>
              <button className="btn btn-normal btn-sm" disabled={prompt === DEFAULT_RECONCILE_PROMPT} onClick={() => setPrompt(DEFAULT_RECONCILE_PROMPT)}>
                Reset to default
              </button>
              <button className="btn btn-primary btn-sm" disabled={disabled || promptSaving} onClick={savePrompt}>
                {promptSaving ? 'Saving…' : 'Save prompt'}
              </button>
            </div>
            <textarea value={prompt} onChange={event => setPrompt(event.target.value)} aria-label="Global reconcile with AI prompt" spellCheck={false} />
          </div>
          <small>{disabled ? 'Save or reload the YAML changes before editing global settings.' : 'Saving the built-in text clears the YAML override.'}</small>
        </div>

        <div className="config-settings-group config-prompt-group">
          <div className="config-settings-group-head">
            <span className="config-settings-icon ai"><IconFlow /></span>
            <div>
              <strong>AI insights prompt</strong>
              <span>Custom instructions for the run advisory (Risk Assessment, Resources, Blast radius). Leave empty to use the built-in prompt.</span>
            </div>
            <span className="config-prompt-state">{insightsPrompt.trim() === DEFAULT_INSIGHTS_PROMPT.trim() ? 'Built-in default' : 'Custom override'}</span>
          </div>
          <div className="config-prompt-editor">
            <div className="config-prompt-toolbar">
              <span>web.insights_prompt</span>
              <button className="btn btn-normal btn-sm" disabled={insightsPrompt.trim() === DEFAULT_INSIGHTS_PROMPT.trim()} onClick={() => setInsightsPrompt(DEFAULT_INSIGHTS_PROMPT)}>
                Reset to default
              </button>
              <button className="btn btn-primary btn-sm" disabled={disabled || insightsPromptSaving} onClick={() => void saveInsightsPrompt()}>
                {insightsPromptSaving ? 'Saving…' : 'Save prompt'}
              </button>
            </div>
            <textarea value={insightsPrompt} onChange={event => setInsightsPrompt(event.target.value)} aria-label="AI insights prompt" spellCheck={false} />
          </div>
          <small>{disabled ? 'Save or reload the YAML changes before editing global settings.' : 'Stored as web.insights_prompt in config.yaml.'}</small>
        </div>

        <div className="config-settings-group config-models-group">
          <div className="config-settings-group-head">
            <span className="config-settings-icon ai"><IconList /></span>
            <div>
              <strong>AI models</strong>
              <span>Models offered in the workspace AI chat. The ID is passed to <code>claude --model</code> (e.g. a Bedrock inference-profile ID).</span>
            </div>
            <button className="btn btn-normal btn-sm" disabled={disabled || modelsSaving || aiModels.length === 0} onClick={() => void saveAiModels([])}>
              Reset to built-in
            </button>
            <button className="btn btn-primary btn-sm" disabled={disabled || modelsSaving} onClick={() => void saveAiModels(aiModels)}>
              {modelsSaving ? 'Saving…' : 'Save AI models'}
            </button>
          </div>
          <div className="config-models-list">
            {aiModels.length === 0 && (
              <p className="config-models-empty">Using built-in models (Sonnet, Opus, Haiku). Add a model to override the list.</p>
            )}
            {aiModels.map((model, index) => (
              <div className="config-model-row" key={index}>
                <label className="config-model-default" title="Default model for new chats">
                  <input
                    type="radio"
                    name="config-default-ai-model"
                    checked={!!model.default}
                    onChange={() => setDefaultModel(index)}
                  />
                  <span>Default</span>
                </label>
                <input
                  className="inp"
                  value={model.label}
                  onChange={event => updateModel(index, { label: event.target.value })}
                  placeholder="Label (e.g. Sonnet 4.6)"
                  aria-label="Model label"
                />
                <input
                  className="inp mono"
                  value={model.id}
                  onChange={event => updateModel(index, { id: event.target.value })}
                  placeholder="Model ID / inference profile"
                  aria-label="Model ID"
                />
                <button className="btn btn-icon config-model-remove" onClick={() => removeModel(index)} aria-label="Remove model" title="Remove model">
                  <IconTrash />
                </button>
              </div>
            ))}
          </div>
          <button className="btn btn-normal btn-sm config-model-add" onClick={addModel}>
            <IconPlus /> Add model
          </button>
        </div>

        <div className="config-settings-group">
          <div className="config-settings-group-head">
            <span className="config-settings-icon"><IconList /></span>
            <div>
              <strong>Parallel workers</strong>
              <span>Maximum targets run concurrently in parallel mode. Set to 0 for unlimited.</span>
            </div>
            <button className="btn btn-primary btn-sm" disabled={disabled || workersSaving} onClick={() => void saveParallelWorkers()}>
              {workersSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
          <div className="config-settings-fields">
            <label>
              <span>Concurrent targets</span>
              <input
                className="inp mono"
                type="number"
                min={0}
                value={parallelWorkers}
                onChange={event => setParallelWorkers(Math.max(0, Number(event.target.value)))}
                placeholder="0 = unlimited"
              />
            </label>
          </div>
          <small>Stored as <code>web.parallel_workers</code> in config.yaml. Default (unset) is 4.</small>
        </div>
      </div>
    </section>
  );
}
