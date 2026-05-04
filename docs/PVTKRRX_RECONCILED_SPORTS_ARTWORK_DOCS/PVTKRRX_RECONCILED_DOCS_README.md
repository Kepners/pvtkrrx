# PVTKRRX Reconciled Sports Artwork Docs

These replace the earlier confusing/stale artwork docs.

## Use these now

### 1. Reconciled implementation plan

Copy to:

```text
C:\Users\kepne\OneDrive\Documents\GitHub\pvtkrrx\docs\PVTKRRX_SPORTSMETA_ARTWORK_RECONCILED_PLAN.md
```

### 2. Claude reconcile-and-discovery prompt

Copy to:

```text
C:\Users\kepne\OneDrive\Documents\GitHub\pvtkrrx\.claude\briefs\PVTKRRX_CLAUDE_RECONCILE_AND_DISCOVERY_PROMPT.md
```

## Do not start from the older implementation-heavy prompt

The older prompt risks treating examples as fixed tasks and risks ignoring:

- SportsMeta ownership
- removed PVTKRRX sports image cache
- two-runtime topology
- free vs paid poster pipeline
- stale `pvt.kepners.co.uk` references

## Recommended instruction to Claude

Use:

```text
Read .claude/briefs/PVTKRRX_CLAUDE_RECONCILE_AND_DISCOVERY_PROMPT.md and start with Phase -1 only. Do not implement. Reconcile current project truth first, then ask me the template questions using the required popup question mechanism.
```
