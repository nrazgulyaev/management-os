# Interview guide — Stage 10 UX research

Reusable script for operator-led 30-45 min sessions with role-holders (current customers, target customers, internal staff). One session per person. **Goal: leave with verbatim quotes about top-3 daily tasks, friction points (timed), and refusal points (where they would abandon a tool that wasted their time).**

---

## Session protocol

**Pre-call (5 min):**
- Record consent (audio or written) — required for verbatim quotes.
- Confirm role + tenure: how long in this role, in this villa-management context, with this kind of tool.
- Set context: "We're redesigning Arconique's [role] surfaces. Goal is to make your top tasks 50%+ faster, not to add features."

**Opening — current state (10 min):**
1. Walk me through your last full work day. What did you do, in order? (Don't filter for tools — narrative first.)
2. Of those tasks, which 3 take the most time? Estimate hours per week.
3. Which task do you dread most? Why?
4. What tool(s) do you currently use for those tasks? (Tools — not features. Excel + paper count.)

**Friction probe (10 min):**
For each of the top-3 tasks, ask:
5. Walk me through doing this task right now, today. **Time it if possible.**
6. Where do you get stuck? What do you wish was already done for you?
7. How often do you re-do work because of bad data / lost data / unclear status?
8. If this task got 50% faster, what would you do with the saved time?

**Refusal probe (5 min):**
9. What's a tool you tried and abandoned? What killed it?
10. What's a feature you've been promised that never delivered? Why didn't it land?
11. If we built something for you and it required 5 extra clicks vs. your current spreadsheet, what would happen?

**Reference-app probe (5 min) — optional, only if interviewee mentions a competitor:**
12. You mentioned [tool]. What does it do well that we should copy? What does it do badly that we should avoid?

**Wrap (3 min):**
13. If we shipped one thing for you in the next 8 weeks, what should it be?
14. Anyone else on your team we should talk to?

---

## Capture template

Save raw notes at `docs/ux-research/interviews/{role}/session-{n}.md` using:

```markdown
# {role} interview — session {n}

**Date:** YYYY-MM-DD
**Interviewer:** {name}
**Subject:** {first name + role + tenure}
**Context:** {company size, # villas, # team members under them}
**Recording:** {y/n, link if y}

## Top-3 daily tasks
1. {task} — {hours/week} — {tool used today}
2. ...
3. ...

## Friction points (timed where possible)
- Task: {task name}
  - Step that hurts: {verbatim quote if possible}
  - Time cost: {minutes}
  - Workaround they invented: {description}
  - Frequency of rework: {%}

## Verbatim quotes
> "{exact quote}"
> — context: what they were doing when they said it

## Refusal points
- Tool abandoned: {name}, reason: {description}
- Anti-feature: {description}

## Wishlist (their words, not yours)
- {item 1}
- {item 2}

## Open questions
- {what we couldn't answer in this session}
```

After 2-3 sessions per role, write `docs/ux-research/interviews/{role}/synthesis.md`:

```markdown
# {role} synthesis

## Convergent themes (named by 2+ subjects)
1. ...

## Divergent themes (named by 1 subject only — flag, don't design for these yet)
1. ...

## Top-3 tasks (consolidated)
1. ...

## Friction ranked by total time cost
1. ... (X hours/week aggregated)

## Verbatim quotes worth surfacing in the brief
> "{quote 1}"
> "{quote 2}"

## Tools currently in use
- ...

## Operator interpretation — what to build, what to avoid
- Build: ...
- Avoid: ...
```

---

## Sampling target

| Role | Min sessions | Stretch | Rationale |
|---|---|---|---|
| bookkeeper | 2 | 3 | Tight scope, tasks are well-known across orgs |
| cleaner | 3 | 5 | Field workflow, varies by villa size + chain length |
| qs | 2 | 3 | Specialized, fewer practitioners |
| project-manager | 3 | 5 | Workflows differ by project phase |
| cfo | 2 | 3 | Decision-makers, hard to get >2 |
| procurement | 2 | 3 | |
| marketing | 2 | 3 | |
| owner | 3 | 5 | Most heterogeneous role — small / medium / institutional |
| front-office | 3 | 5 | Shifts, day vs. night, occupancy-dependent |
| warehouse | 1 | 2 | (Stage 10 backlog) |
| operations-manager | 2 | 3 | (Stage 10 backlog) |

**Minimum to unblock Phase 10.A: 22 sessions.**
