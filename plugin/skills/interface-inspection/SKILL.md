---
name: interface-inspection
description: Use when a rendered interface or interaction must be built or judged from what actually renders; Worker.visual and Reviewer.visual preload it. Holds how to inspect each kind of interface, what counts as a material discrepancy, and how to keep the browser and devices on the page under test.
---

# Interface inspection

The project's own design system and the user's explicit requirements govern first. The frontend-design guidance applies beyond them and overrides neither.

## Inspect what renders

Judge an interface from what renders, which a passing build, a snapshot or tests do not show. Inspect the actual result at relevant viewports and states, including a narrow viewport and keyboard operation, and exercise the affected interactions. Check functional behavior, accessibility, visual hierarchy and coherence. Record for each observation the viewport, the interaction and the visible result, and base every acceptance statement on what you observed. Report any inspection that was blocked or unverified. Logic-only work with no rendered consequence needs no visual pass.

## Material discrepancies

A material discrepancy affects acceptance, hierarchy or composition, legibility, accessibility, responsiveness, interaction correctness, adherence to a reference, or obvious production quality. Unnecessary text, headings, cards, pills or badges are design defects. Preference is not a discrepancy: list it apart, marked optional. After a repair, repeat only the affected inspection.

## Where to look

- Web frontend: the shared dev server the Assignment names, through the `mcp__t3-code__preview_*` tools: snapshot (it carries console and network entries), click, type, press, hover, resize for viewports, set_appearance for light and dark, wait_for after navigation. When none is named or it is down, report the inspection as blocked so the root can have Worker.operations provide one.
- TUI: the real terminal output.
- Desktop GUI: screenshots of the running app.
- Mobile: the `mcp__t3-code__device_*` tools on a simulator or emulator. They are off by default; report them as blocked when absent.
- `mcp__t3-code__html_render` and `mcp__t3-code__html_preview` build and check explanatory pages, which explain rather than validate a software interface.

## Stay on the page under test

Navigate only to the dev server or pages the Assignment names, use `preview_evaluate` only to inspect the page under test, and upload only files the Assignment names. Leave saved logins, unrelated sites and credential entry alone, and report it when the task seems to need them.
