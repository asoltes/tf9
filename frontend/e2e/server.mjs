import { execFileSync, spawn } from 'node:child_process';
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const port = process.argv[2] || '18119';
const fixtureRoot = '/tmp/tf9-playwright';
const repo = join(fixtureRoot, 'repo');
const serviceRepo = join(fixtureRoot, 'service-repo');
const config = join(fixtureRoot, 'config.yaml');
const reports = join(fixtureRoot, 'reports');
const binary = join(fixtureRoot, 'tf9');
const xdgConfig = join(fixtureRoot, 'xdg');
const fakeBin = join(fixtureRoot, 'bin');

function run(command, args, cwd = root) {
  execFileSync(command, args, {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'tf9 e2e',
      GIT_AUTHOR_EMAIL: 'tf9-e2e@example.invalid',
      GIT_COMMITTER_NAME: 'tf9 e2e',
      GIT_COMMITTER_EMAIL: 'tf9-e2e@example.invalid',
    },
    stdio: 'inherit',
  });
}

rmSync(fixtureRoot, { recursive: true, force: true });
mkdirSync(repo, { recursive: true });
mkdirSync(serviceRepo, { recursive: true });
mkdirSync(join(repo, 'modules', 'network'), { recursive: true });
mkdirSync(reports, { recursive: true });
mkdirSync(xdgConfig, { recursive: true });
mkdirSync(fakeBin, { recursive: true });

// ── Terraform target environments ──────────────────────────────────────────
// Each environment uses the built-in `terraform_data` resource: no provider
// download (works fully offline) yet a real change on apply, so the web
// approval gate ("Enter a value:") fires without any AWS credentials.
const envs = ['dev', 'prod', 'staging'];
for (const env of envs) {
  mkdirSync(join(repo, 'environments', env), { recursive: true });
  writeFileSync(join(repo, 'environments', env, 'main.tf'), [
    'terraform {',
    '  required_version = ">= 1.5.0"',
    '}',
    '',
    'resource "terraform_data" "demo" {',
    `  input = "${env}"`,
    '}',
    '',
    'output "environment" {',
    '  value = terraform_data.demo.output',
    '}',
    '',
  ].join('\n'));
}

// A deliberately slow environment: a local-exec provisioner sleeps on apply so
// the run stays in-flight long enough for restart-persistence tests to kill the
// server mid-apply. Still fully offline (no provider download) — terraform_data
// + local-exec only.
mkdirSync(join(repo, 'environments', 'slow'), { recursive: true });
writeFileSync(join(repo, 'environments', 'slow', 'main.tf'), [
  'terraform {',
  '  required_version = ">= 1.5.0"',
  '}',
  '',
  'resource "terraform_data" "slow" {',
  '  input            = "slow"',
  '  triggers_replace = [timestamp()]',
  '  provisioner "local-exec" {',
  '    command = "sleep ${var.sleep_seconds}"',
  '  }',
  '}',
  '',
  'variable "sleep_seconds" {',
  '  default = "30"',
  '}',
  '',
].join('\n'));

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
writeFileSync(join(serviceRepo, 'service.tf'), [
  'terraform {',
  '  required_version = ">= 1.5.0"',
  '}',
  '',
  'locals {',
  '  service = "workspace-tabs"',
  '}',
  '',
].join('\n'));

run('git', ['init', '--initial-branch=main'], repo);
run('git', ['add', '.'], repo);
run('git', ['commit', '-m', 'Initial fixture'], repo);
run('git', ['branch', 'rebase-target'], repo);
run('git', ['init', '--initial-branch=main'], serviceRepo);
run('git', ['add', '.'], serviceRepo);
run('git', ['commit', '-m', 'Initial service fixture'], serviceRepo);
run('git', ['checkout', '-b', 'source-feature'], serviceRepo);
writeFileSync(join(serviceRepo, 'feature.tf'), 'resource "terraform_data" "feature" {}\n');
run('git', ['add', 'feature.tf'], serviceRepo);
run('git', ['commit', '-m', 'Add feature module'], serviceRepo);
run('git', ['checkout', 'main'], serviceRepo);
run('git', ['checkout', '-b', 'base-update'], serviceRepo);
writeFileSync(join(serviceRepo, 'base.tf'), 'resource "terraform_data" "base" {}\n');
run('git', ['add', 'base.tf'], serviceRepo);
run('git', ['commit', '-m', 'Update shared base'], serviceRepo);
run('git', ['checkout', 'main'], serviceRepo);

// Working-tree changes the workspace git-diff spec relies on: main.tf modified
// (decoration "M") and outputs.tf untracked (decoration "U").
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
  '    targets:',
  ...envs.flatMap(env => [
    `      - name: ${env}`,
    `        directory: environments/${env}`,
    '        aws_profile: e2e-profile',
    '        region: us-east-1',
  ]),
  '      - name: slow',
  '        directory: environments/slow',
  '        aws_profile: e2e-profile',
  '        region: us-east-1',
  '  - name: e2e-service',
  `    path: ${serviceRepo}`,
  '',
].join('\n'));

// ── Fake `aws` CLI ──────────────────────────────────────────────────────────
// The runner calls `aws sts get-caller-identity` before every target (see
// internal/runner ensureSessions). With no real AWS credentials that would
// abort every web run, so we shim a deterministic offline identity. terraform
// itself needs no AWS profile here (no provider), so this is purely to satisfy
// the session pre-check and to render an authenticated STS badge.
const fakeAws = join(fakeBin, 'aws');
writeFileSync(fakeAws, [
  '#!/bin/sh',
  '# Fake aws CLI for tf9 e2e — offline, deterministic.',
  'case "$1 $2" in',
  '  "sts get-caller-identity")',
  '    if printf "%s " "$@" | grep -q -- "--output json"; then',
  '      echo \'{"UserId":"AIDAE2EXAMPLE","Account":"123456789012","Arn":"arn:aws:iam::123456789012:user/e2e"}\'',
  '    else',
  '      echo "123456789012"',
  '    fi',
  '    ;;',
  '  "configure list-profiles")',
  '    echo "e2e-profile"',
  '    ;;',
  '  *)',
  '    echo "fake-aws: unhandled $*" >&2',
  '    ;;',
  'esac',
  'exit 0',
  '',
].join('\n'));
chmodSync(fakeAws, 0o755);

// ── Fake `claude` CLI ───────────────────────────────────────────────────────
// Workspace AI tests exercise the real tf9 process/SSE integration without
// consuming an account session or requiring network access.
const fakeClaude = join(fakeBin, 'claude');
writeFileSync(fakeClaude, [
  '#!/bin/sh',
  'if [ "$1" = "auth" ]; then',
  '  echo \'{"loggedIn":true,"authMethod":"claude.ai"}\'',
  '  exit 0',
  'fi',
  'case "$*" in',
  '  *ai-generated.tf*)',
  '    printf \'resource "terraform_data" "ai_generated" {}\\n\' > ai-generated.tf',
  '    RESPONSE="Created ai-generated.tf in the workspace."',
  '    TOOL="Write"',
  '    SUMMARY="ai-generated.tf"',
  '    ;;',
  '  *)',
  '    RESPONSE="This workspace contains Terraform configuration and reusable modules."',
  '    TOOL="Read"',
  '    SUMMARY="main.tf"',
  '    ;;',
  'esac',
  'echo \'{"type":"system","subtype":"init","session_id":"33333333-3333-3333-3333-333333333333"}\'',
  'printf \'{"type":"assistant","session_id":"33333333-3333-3333-3333-333333333333","message":{"content":[{"type":"tool_use","name":"%s","input":{"file_path":"%s"}}]}}\\n\' "$TOOL" "$SUMMARY"',
  'printf \'{"type":"stream_event","session_id":"33333333-3333-3333-3333-333333333333","event":{"delta":{"type":"text_delta","text":"%s"}}}\\n\' "$RESPONSE"',
  'printf \'{"type":"result","subtype":"success","session_id":"33333333-3333-3333-3333-333333333333","result":"%s"}\\n\' "$RESPONSE"',
  '',
].join('\n'));
chmodSync(fakeClaude, 0o755);

run(process.env.GO_BINARY || '/usr/local/go/bin/go', ['build', '-o', binary, './cmd/tf9']);

const server = spawn(binary, [
  '--config', config,
  'serve',
  '--port', port,
  '--dir', reports,
], {
  cwd: root,
  env: {
    ...process.env,
    PATH: `${fakeBin}:${process.env.PATH}`,
    TF9_CLAUDE_PATH: fakeClaude,
    XDG_CONFIG_HOME: xdgConfig,
    GOCACHE: '/tmp/tf9-go-cache',
    TF_IN_AUTOMATION: '1',
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
