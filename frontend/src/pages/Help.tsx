import { useEffect, useRef, useState } from 'react';
import Shell from '../Shell';
import './Help.css';

const COPY_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const CHECK_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const TOC = [
  { id: 'quickstart', text: 'Quick start' },
  { id: 'config', text: 'Configuration' },
  { id: 'runs', text: 'Terraform runs' },
  { id: 'approval', text: 'Approval gate' },
  { id: 'cwd', text: 'CWD mode' },
  { id: 'recursive', text: 'Recursive mode' },
  { id: 'commands', text: 'CLI commands' },
  { id: 'sensitive', text: 'Sensitive data' },
];

function CodeBlock({ children }: { children: React.ReactNode }) {
  const preRef = useRef<HTMLPreElement>(null);
  const onCopy = () => {
    const text = preRef.current?.textContent ?? '';
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); showHelpToast(); } catch { /* ignore */ }
      document.body.removeChild(ta);
    };
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(showHelpToast, fallback);
    } else {
      fallback();
    }
  };
  return (
    <div className="codeblock">
      <button className="cb-copy" onClick={onCopy}>{COPY_ICON}copy</button>
      <pre ref={preRef}>{children}</pre>
    </div>
  );
}

// Shared toast trigger (single toast element rendered by the page).
let showHelpToast: () => void = () => {};

export default function Help() {
  const [active, setActive] = useState('quickstart');
  const [toastShow, setToastShow] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  showHelpToast = () => {
    setToastShow(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastShow(false), 1500);
  };

  // Scroll-spy for the on-this-page TOC.
  useEffect(() => {
    function spy() {
      const y = window.scrollY + 120;
      let cur = TOC[0].id;
      for (const t of TOC) {
        const el = document.getElementById(t.id);
        if (el && el.offsetTop <= y) cur = t.id;
      }
      setActive(cur);
    }
    window.addEventListener('scroll', spy, { passive: true });
    spy();
    return () => window.removeEventListener('scroll', spy);
  }, []);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  function jump(e: React.MouseEvent, id: string) {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  }

  return (
    <Shell>
      <div className="help-page">
        <div className="page-head">
          <div>
            <div className="page-title">Documentation</div>
            <div className="page-desc">
              How tf9 is configured and run. The CLI and this web UI share one <code>config.yaml</code>.
            </div>
          </div>
        </div>

        <div className="help-grid">
          <aside className="toc">
            <div className="toc-h">On this page</div>
            {TOC.map(t => (
              <a
                key={t.id}
                href={`#${t.id}`}
                className={active === t.id ? 'active' : undefined}
                onClick={(e) => jump(e, t.id)}
              >
                {t.text}
              </a>
            ))}
          </aside>

          <div>
            <section className="help-sec" id="quickstart" style={{ marginBottom: 34 }}>
              <h2>Quick start</h2>
              <div className="lead">Three steps from an empty config to a streamed plan.</div>
              <div className="qstart">
                <div className="qcard"><div className="qn">1</div><div className="qt">Register a repository</div><div className="qd">Add your infrastructure repo and its path under <b>Repositories</b>, or with <code>tf9 config repo add</code>.</div></div>
                <div className="qcard"><div className="qn">2</div><div className="qt">Build a pipeline</div><div className="qd">Group Terraform directories into promotion pipelines and order them (dev → staging → prod).</div></div>
                <div className="qcard"><div className="qn">3</div><div className="qt">Run</div><div className="qd">Start a <b>plan</b> or <b>apply</b> from <b>New run</b> and watch each target stream live.</div></div>
              </div>
            </section>

            <section className="help-sec" id="config" style={{ marginBottom: 34 }}>
              <h2>Configuration</h2>
              <div className="lead">Repositories and ordered Terraform targets live in <code>~/.config/tf9/config.yaml</code>. The CLI and web UI read and write the same file.</div>
              <CodeBlock>
                <span className="ck-key">version</span>: 1{'\n'}
                <span className="ck-key">web</span>:{'\n'}
                {'  '}<span className="ck-key">saved_plan_apply</span>: true{'\n'}
                {'  '}<span className="ck-key">approval_timeout_seconds</span>: 300{'\n'}
                {'  '}<span className="ck-key">reviewed_plan_timeout_seconds</span>: 3600{'\n'}
                <span className="ck-key">repositories</span>:{'\n'}
                {'  - '}<span className="ck-key">name</span>: infrastructure{'\n'}
                {'    '}<span className="ck-key">path</span>: /absolute/path/to/infrastructure{'\n'}
                {'    '}<span className="ck-key">default_aws_profile</span>: company-dev{'\n'}
                {'    '}<span className="ck-key">default_account_id</span>: "123456789012"{'\n'}
                {'    '}<span className="ck-key">default_region</span>: eu-west-2{'\n'}
                {'    '}<span className="ck-key">targets</span>:{'\n'}
                {'      - '}<span className="ck-key">name</span>: dev{'\n'}
                {'        '}<span className="ck-key">directory</span>: environments/dev{'\n'}
                {'        '}<span className="ck-key">aws_profile</span>: company-dev{'\n'}
                {'        '}<span className="ck-key">account_id</span>: "123456789012"{'\n'}
                {'        '}<span className="ck-key">region</span>: eu-west-2
              </CodeBlock>
              <div className="kv"><code>default_*</code><span>· optional — copied into targets added from the repository browser.</span></div>
              <div className="kv"><code>account_id</code><span>· optional — verified against STS before runs.</span></div>
              <div className="kv"><code>disabled</code><span>· optional — skips the target in promotion and parallel runs.</span></div>
              <div className="kv"><code>web.saved_plan_apply</code><span>· optional — saves successful web plans and requires applies to use the reviewed plan file.</span></div>
              <div className="kv"><code>web.approval_timeout_seconds</code><span>· optional — automatically denies unattended approval prompts; defaults to 300 seconds.</span></div>
              <div className="kv"><code>web.reviewed_plan_timeout_seconds</code><span>· optional — expires saved reviewed plans and their apply action; defaults to 3600 seconds.</span></div>
            </section>

            <section className="help-sec" id="runs" style={{ marginBottom: 34 }}>
              <h2>Terraform runs</h2>
              <div className="lead">Targets run in YAML order by default, stopping on the first apply failure. <code>--parallel</code> uses up to four workers and is rejected for apply and destroy.</div>
              <CodeBlock>
                <span className="ck-cmd">tf9 plan</span> <span className="ck-flag">--repo</span> infrastructure{'\n'}
                <span className="ck-cmd">tf9 plan</span> dev <span className="ck-flag">--repo</span> infrastructure{'\n'}
                <span className="ck-cmd">tf9 apply</span> prod <span className="ck-flag">--repo</span> infrastructure{'\n'}
                <span className="ck-cmd">tf9 plan</span> <span className="ck-flag">--repo</span> infrastructure <span className="ck-flag">--parallel</span>{'\n'}
                <span className="ck-cmd">tf9 state list</span> <span className="ck-flag">--repo</span> infrastructure <span className="ck-flag">--filter</span> dev
              </CodeBlock>
            </section>

            <section className="help-sec" id="approval" style={{ marginBottom: 34 }}>
              <h2>Approval gate</h2>
              <div className="lead">
                <code>apply</code> and <code>destroy</code> always run terraform without <code>-auto-approve</code>.
                Terraform shows the full plan, then prompts for confirmation — identical to running terraform directly.
              </div>
              <CodeBlock>
                {'Do you want to perform these actions?\n'}
                {'  Terraform will perform the actions described above.\n'}
                {'  Only \'yes\' will be accepted to approve.\n'}
                {'\n'}
                {'  Enter a value: '}
              </CodeBlock>
              <div className="kv"><code>--force</code><span>· adds <code>-auto-approve</code> and skips the prompt — useful in CI/CD.</span></div>
              <div className="kv" style={{ marginTop: 8 }}>
                <span>
                  In the <b>web UI</b>, when an apply or destroy run reaches the <code>Enter a value:</code> prompt, the terminal shows an amber approval bar — click <b>Approve</b> to continue or <b>Deny</b> to abort.
                </span>
              </div>
            </section>

            <section className="help-sec" id="cwd" style={{ marginBottom: 34 }}>
              <h2>CWD mode</h2>
              <div className="lead">
                Run terraform commands from any directory that contains <code>.tf</code> files — no repo registration needed.
                Reports and run history are recorded the same way as managed repo runs.
              </div>
              <CodeBlock>
                <span className="ck-com"># inside any terraform module directory</span>{'\n'}
                <span className="ck-cmd">cd</span> ~/my-infra/staging{'\n'}
                <span className="ck-cmd">tf9 plan</span>{'\n'}
                <span className="ck-cmd">tf9 apply</span>{'\n'}
                <span className="ck-cmd">tf9 apply</span> <span className="ck-flag">--force</span>{'\n'}
                {'\n'}
                <span className="ck-com"># override the AWS profile</span>{'\n'}
                <span className="ck-cmd">tf9 plan</span> <span className="ck-flag">--profile</span> my-aws-profile
              </CodeBlock>
              <div className="kv">
                <span>If the current directory has no <code>.tf</code> files, tf9 falls back to scanning immediate subdirectories — the original behaviour.</span>
              </div>
            </section>

            <section className="help-sec" id="recursive" style={{ marginBottom: 34 }}>
              <h2>Recursive mode</h2>
              <div className="lead">
                <code>--recursive</code> (<code>-R</code>) scans the immediate subdirectories of the current folder for
                Terraform modules and runs the command across all of them — no repo registration needed.
                Pair it with <b>CLI Directory to Profile Mappings</b> (Settings) to automatically assign the
                right AWS profile to each directory.
              </div>
              <CodeBlock>
                <span className="ck-com"># cd into any parent folder and run across all child tf dirs</span>{'\n'}
                <span className="ck-cmd">cd</span> ~/my-infra{'\n'}
                <span className="ck-cmd">tf9 plan</span> <span className="ck-flag">-R</span>{'\n'}
                <span className="ck-cmd">tf9 plan</span> <span className="ck-flag">--recursive</span>{'\n'}
                {'\n'}
                <span className="ck-com"># with a profile override for all dirs</span>{'\n'}
                <span className="ck-cmd">tf9 plan</span> <span className="ck-flag">-R</span> <span className="ck-flag">--profile</span> company-dev{'\n'}
                {'\n'}
                <span className="ck-com"># --recursive and --repo are mutually exclusive</span>
              </CodeBlock>
              <div className="kv" style={{ marginTop: 8 }}>
                <code>profile_mappings</code>
                <span>
                  · defined in <b>Settings → CLI Directory to Profile Mappings</b>.
                  Each entry maps an exact directory base name (e.g. <code>dev</code>) to an AWS CLI profile.
                  Rows are executed in the order shown in the UI — drag to reorder.
                  <code>--profile</code> overrides all mappings.
                </span>
              </div>
              <CodeBlock>
                <span className="ck-com"># config.yaml shape written by the UI</span>{'\n'}
                <span className="ck-key">profile_mappings</span>:{'\n'}
                {'  - '}<span className="ck-key">dir</span>: dev{'\n'}
                {'    '}<span className="ck-key">profile</span>: company-dev{'\n'}
                {'  - '}<span className="ck-key">dir</span>: qa{'\n'}
                {'    '}<span className="ck-key">profile</span>: company-qa{'\n'}
                {'  - '}<span className="ck-key">dir</span>: prod{'\n'}
                {'    '}<span className="ck-key">profile</span>: company-prod
              </CodeBlock>
            </section>

            <section className="help-sec" id="commands" style={{ marginBottom: 34 }}>
              <h2>CLI commands</h2>
              <div className="lead">Manage repositories and targets from the terminal — the web UI edits the same file.</div>
              <CodeBlock>
                <span className="ck-com"># repositories</span>{'\n'}
                <span className="ck-cmd">tf9 config repo list</span>{'\n'}
                <span className="ck-cmd">tf9 config repo add</span> {'<name> <absolute-path>'}{'\n'}
                <span className="ck-cmd">tf9 config repo remove</span> {'<name>'}{'\n'}
                {'\n'}
                <span className="ck-com"># targets</span>{'\n'}
                <span className="ck-cmd">tf9 config target list</span> <span className="ck-flag">--repo</span> {'<name>'}{'\n'}
                <span className="ck-cmd">tf9 config target add</span> <span className="ck-flag">--repo</span> {'<name> <target> <directory> '}<span className="ck-flag">--profile</span> {'<aws-profile>'}{'\n'}
                <span className="ck-cmd">tf9 config target move</span> <span className="ck-flag">--repo</span> {'<name> <target> '}<span className="ck-flag">--after</span> {'<target>'}{'\n'}
                <span className="ck-cmd">tf9 config target remove</span> <span className="ck-flag">--repo</span> {'<name> <target>'}{'\n'}
                {'\n'}
                <span className="ck-cmd">tf9 serve</span> <span className="ck-flag">--report</span> latest
              </CodeBlock>
            </section>

            <section className="help-sec" id="sensitive" style={{ marginBottom: 20 }}>
              <h2>Sensitive data</h2>
              <div className="lead">The YAML stores AWS profile names and optional account metadata — never credentials. Authentication stays in the AWS CLI configuration. Reports can contain infrastructure details and are stored outside the repository under <code>~/.config/tf9/reports</code>; review before sharing.</div>
            </section>
          </div>
        </div>
      </div>

      <div className={`toast${toastShow ? ' show' : ''}`}>
        {CHECK_ICON}Copied
      </div>
    </Shell>
  );
}
