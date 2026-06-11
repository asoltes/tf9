import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const port = process.argv[2] || '18119';
const fixtureRoot = '/tmp/tfops-playwright';
const repo = join(fixtureRoot, 'repo');
const config = join(fixtureRoot, 'config.yaml');
const reports = join(fixtureRoot, 'reports');
const binary = join(fixtureRoot, 'tfops');
const xdgConfig = join(fixtureRoot, 'xdg');

function run(command, args, cwd = root) {
  execFileSync(command, args, {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'tfops e2e',
      GIT_AUTHOR_EMAIL: 'tfops-e2e@example.invalid',
      GIT_COMMITTER_NAME: 'tfops e2e',
      GIT_COMMITTER_EMAIL: 'tfops-e2e@example.invalid',
    },
    stdio: 'inherit',
  });
}

rmSync(fixtureRoot, { recursive: true, force: true });
mkdirSync(repo, { recursive: true });
mkdirSync(join(repo, 'modules', 'network'), { recursive: true });
mkdirSync(reports, { recursive: true });
mkdirSync(xdgConfig, { recursive: true });

writeFileSync(join(repo, 'main.tf'), [
  'terraform {',
  '  required_version = ">= 1.5.0"',
  '}',
  '',
  'variable "region" {',
  '  default = "us-east-1"',
  '}',
  '',
].join('\n'));
writeFileSync(join(repo, 'modules', 'network', 'main.tf'), 'terraform {}\n');

run('git', ['init', '--initial-branch=main'], repo);
run('git', ['add', 'main.tf', 'modules/network/main.tf'], repo);
run('git', ['commit', '-m', 'Initial fixture'], repo);

writeFileSync(join(repo, 'main.tf'), [
  'terraform {',
  '  required_version = ">= 1.6.0"',
  '}',
  '',
  'variable "region" {',
  '  default = "us-west-2"',
  '}',
  '',
  'locals {',
  '  environment = "e2e"',
  '}',
  '',
].join('\n'));
writeFileSync(join(repo, 'outputs.tf'), 'output "environment" {\n  value = local.environment\n}\n');

writeFileSync(config, [
  'version: 1',
  'repositories:',
  '  - name: e2e-repo',
  `    path: ${repo}`,
  '',
].join('\n'));

run(process.env.GO_BINARY || '/usr/local/go/bin/go', ['build', '-o', binary, './cmd/tfops']);

const server = spawn(binary, [
  '--config', config,
  'serve',
  '--port', port,
  '--dir', reports,
], {
  cwd: root,
  env: {
    ...process.env,
    XDG_CONFIG_HOME: xdgConfig,
    GOCACHE: '/tmp/tfops-go-cache',
  },
  stdio: 'inherit',
});

server.on('exit', code => {
  process.exit(code ?? 1);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.kill(signal);
  });
}
