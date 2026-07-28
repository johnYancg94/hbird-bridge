# One-click Image Archive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add a safe one-click archive action that keeps the ten newest plugin-visible images, plus a compact button that opens the active asset directory.

**Architecture:** Extend `asset-utils.js` with pure date-bucketing and archive-planning functions. Keep filesystem preflight, confirmation, moves, status updates, and Explorer launching in `main.js`; add only the two requested controls to the existing toolbar.

**Tech Stack:** CEP HTML/CSS/JavaScript, Node.js `fs`, `path`, `child_process`, Node built-in `assert`.

---

### Task 1: Archive planning utilities

**Files:**
- Modify: `tests/asset-utils.test.js`
- Modify: `js/asset-utils.js`

- [x] Add failing tests for `getWeekArchiveFolderName()` and `buildArchivePlan()`.
- [x] Run `node tests/asset-utils.test.js` and verify failure because the functions are absent.
- [x] Implement Thursday-owned month buckets and stable `mtimeMs` sorting.
- [x] Run the utility tests and verify all pass.

### Task 2: Toolbar and controller integration

**Files:**
- Modify: `tests/integration.test.js`
- Modify: `index.html`
- Modify: `css/style.css`
- Modify: `js/main.js`

- [x] Add failing assertions for `openAssetsDirBtn`, `archiveBtn`, exact button ordering, event bindings, `execFile`, collision-safe naming, confirmation, bounded rename work, and forced refresh.
- [x] Run `node tests/integration.test.js` and verify failure against the current UI.
- [x] Add the compact folder button after `browseDirBtn` and archive button after `scanFolderBtn`.
- [x] Implement Explorer launch, archive busy state, collision-safe target naming, confirmation summary, asynchronous rename, and post-move refresh.
- [x] Run all tests plus `node --check js/asset-utils.js` and `node --check js/main.js`.

### Task 3: Deployment

**Files:**
- Deploy: `index.html`, `css/style.css`, `js/main.js`, `js/asset-utils.js`
- Source-only: tests and design/plan documents

- [x] Create timestamped backups of each replaced runtime file in the source and installed plugin directories.
- [x] Copy only the tested runtime files to both destinations and tests/docs to the source package.
- [x] Re-run source tests and installed syntax checks.
- [x] Verify three-way SHA-256 equality for every runtime file.
- [x] Record that Photoshop restart/manual interaction remains required for live CEP verification.
