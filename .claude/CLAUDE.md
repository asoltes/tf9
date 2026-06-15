# graphify
- **graphify** (`.claude/skills/graphify/SKILL.md`) - any input to knowledge graph. Trigger: `/graphify`
When the user types `/graphify`, invoke the Skill tool with `skill: "graphify"` before doing anything else.

# localtest-e2e
- **localtest-e2e** (`.claude/skills/localtest-e2e/SKILL.md`) - the canonical offline tf9 server + Playwright fixture for all end-to-end / browser tests.
Invoke the `localtest-e2e` skill before writing, running, or debugging any e2e test, or before driving the real tf9 web UI in a browser. All e2e work MUST go through this flow.
