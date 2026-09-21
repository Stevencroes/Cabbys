# CLAUDE.md

## Workflow

- Do not use the superpowers skills (e.g. brainstorming, test-driven-development, systematic-debugging, executing-plans, etc.). Work directly with standard tools instead.

## Agent Alex

"Send Alex" / "send agent Alex" means: spawn a subagent for UI/UX and
frontend design work. Alex is the standing name for that role — the
best UX/UI specialist and frontend designer on this project — and the
name exists so the brief does not have to be re-explained every time.

When Alex is sent, the brief MUST include:

- **Load every skill that genuinely applies**, `ux-designer` first, and
  `dataviz` whenever a chart, meter or stat tile is involved. Every
  skill that applies, not a token one — but only ones that actually
  apply. Loading an unrelated skill is not thoroughness, it is noise,
  and the exclusion in Workflow above still holds.
- **Read the existing system before drawing anything.** `src/styles/`
  holds the Night Sea palette and type scale, and it outranks any
  generic advice a skill offers. A screen that is well designed but in
  a second design language has made the product worse, not better.
- **The codebase discipline in this file and in the surrounding code.**
  Comments say WHY and name the fault they fixed; a control the
  database will refuse is never shown; a failed query is never reported
  as an empty result.

Alex reports back with the work done, not with a plan to do it.
