# Computer Use — Public Tool Surface (v1)

These nine tools are the complete model-visible surface (design §3.1). They are
host tools implemented by AiFetchly; this repository publishes their contracts,
not a second implementation. No raw backend tool is ever advertised as a planner
tool, and the act schema accepts opaque **target handles only** — raw desktop
coordinates exist solely inside the supervisor (CU-PLUGIN-02).

| Tool | Inputs | Result / semantics |
| --- | --- | --- |
| `computer_capabilities` | none or target query | Backend and protocol versions, supported actions, permissions, grounder state and provider, planner mode, display support |
| `computer_start_session` | user-selected target reference, purpose | Session ID and scoped capabilities; the host takes the desktop lease first |
| `computer_observe` | session ID, region/mode | Observation ID and structured bounded state; in visual planner mode the host attaches a transient image artifact |
| `computer_find` | session ID, observation ID, target description | Opaque target handle, or `target_not_found` / `target_ambiguous`, with grounding source (`accessibility` \| `vision`) |
| `computer_act` | session ID, target handle, typed action, action ID | Dispatched / failed / uncertain with a post-observation reference |
| `computer_verify` | session ID, expected state, observation ID | Satisfied / unsatisfied / unknown with evidence |
| `computer_request_handoff` | session ID, reason | Revokes automatic input until trusted resume |
| `computer_resume_after_handoff` | session ID | Host-approved resume with a fresh observation |
| `computer_stop_session` | session ID | Idempotent cancellation and release |

## Boundary rules

- Keyboard actions without a visual target still require a current session,
  target window focus, and authorization.
- Error results use the stable `desktop/error-v1` code set; safe messages only.
- Action outcomes use `not_dispatched | dispatched | failed | uncertain`; an
  `uncertain` outcome is never automatically retried (PRD §6.1).
