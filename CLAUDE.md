# aifetchly-computer-use

First-party Computer Use plugin repository consumed by AiFetchly. TypeScript
toolchain at the root; Python packages under `adapters/windows/` and
`grounding/`; canonical contracts under `contracts/`. See `README.md` for
developer workflows and `doc/` for the PRD/technical design.

Key commands: `npm run check` (lint + typecheck + tests), `npm run build`,
`npm run contracts:check`, `npm run contracts:build`,
`npm run eval -- replay --bundle <path> --runner recorded --dataset w1-smoke`,
`npm run release:verify -- --manifest <path>`. Python: `uv sync && uv run
pytest` inside each package directory.

Python environments are independent per package (adapters/windows ≠ grounding)
and are never mixed. Weights, virtualenvs and caches are never committed.
Platform-bound commands fail closed with exit 3 until their Phase 0 pins exist.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec
