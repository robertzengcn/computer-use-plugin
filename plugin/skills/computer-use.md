---
name: computer-use
description: Supervised desktop automation for the W-1 lead-list workflow on Windows Excel, through host-authorized atomic actions only.
---

# Computer Use skill

## When to use

The user asks to read, format, or fill an Excel workbook through the desktop
(lead lists: paste rows, format columns, highlight duplicate emails) on Windows
with Microsoft 365 Apps or Excel 2021, English or Simplified Chinese UI.

## How to work

1. Call `computer_capabilities` to check permissions, planner mode and grounder state.
2. `computer_start_session` on the user-selected workbook window — never on an
   AiFetchly window.
3. `computer_observe` for headers, bounded used range, selection and sheet tabs.
   Cell values come from UI Automation reads, not OCR.
4. `computer_find` for each control you need; use returned **target handles**.
   Never construct coordinates yourself.
5. `computer_act` one atomic action at a time; verify outcomes with
   `computer_verify` before continuing.
6. On protected view, sign-in prompts, co-authoring conflicts, IME composition
   or permission dialogs, call `computer_request_handoff` and wait.

## Hard boundaries

- Never interact with an elevated window or an AiFetchly-owned window.
- Never retry an `uncertain` action outcome; re-observe and ask.
- Save, Share, Close, Delete and Remove Duplicates require explicit host
  authorization handling — hand off instead of improvising.
- Stop immediately when the session is stopped or a generation is revoked.

## Data care

Lead data is sensitive: no cell content in prompts beyond what the task needs;
text formatting preserves leading zeros and long IDs exactly (host owns TSV
escaping and clipboard restoration).
