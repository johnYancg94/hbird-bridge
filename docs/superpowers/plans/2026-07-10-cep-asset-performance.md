# CEP Asset Browser Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the CEP image grid responsive with hundreds of files without changing its user-facing workflow.

**Architecture:** Add a small UMD utility module for bounded asynchronous work and asset comparison. Wire it into the existing controller for asynchronous scans, incremental DOM reconciliation, viewport-driven thumbnail loading, and visibility-aware polling.

**Tech Stack:** CEP HTML/JavaScript, Node.js `fs` and `path`, browser DOM APIs, Node built-in `assert`.

---

### Task 1: Test and add the performance utility module

**Files:**
- Create: `tests/asset-utils.test.js`
- Create: `js/asset-utils.js`

- [x] **Step 1: Write the failing utility tests**

Create tests that require `../js/asset-utils.js`, assert a task queue never exceeds two active operations, assert result order is preserved, and assert an asset with the same path but a new `mtimeMs` appears in `updated` rather than `added` or `removed`.

- [x] **Step 2: Run the test to verify RED**

Run: `node tests/asset-utils.test.js`

Expected: failure because `js/asset-utils.js` does not exist.

- [x] **Step 3: Implement the minimal utility API**

Export these exact functions from a UMD module:

```js
createTaskQueue(maxConcurrent)
mapLimit(items, limit, iterator)
createAssetSnapshot(assets)
diffAssets(previousAssets, nextAssets)
getImageMimeType(filePath)
```

`createTaskQueue().add(task)` must return a Promise. `mapLimit` must preserve input order. Asset identity is `fullPath`; changes compare `size` and `mtimeMs`.

- [x] **Step 4: Run the tests to verify GREEN**

Run: `node tests/asset-utils.test.js`

Expected: all utility tests pass.

### Task 2: Integrate asynchronous scanning and lazy thumbnails

**Files:**
- Modify: `index.html`
- Modify: `js/main.js`
- Create: `tests/integration.test.js`

- [x] **Step 1: Write failing integration assertions**

The test must require the utility module, read `index.html` and `js/main.js`, and assert:

```js
assert(index.indexOf('js/asset-utils.js') < index.indexOf('js/main.js'));
assert(!main.includes('fs.readFileSync(filePath)'));
assert(main.includes('IntersectionObserver'));
assert(main.includes("document.addEventListener('visibilitychange'"));
assert(main.includes('reconcileAssets'));
```

- [x] **Step 2: Run the integration test to verify RED**

Run: `node tests/integration.test.js`

Expected: failure because the utility script and optimized controller wiring are absent.

- [x] **Step 3: Implement controller integration**

Load `js/asset-utils.js` before `js/main.js`. Replace synchronous scans with callback-backed Promises and `mapLimit(..., 16, statCandidate)`. Guard scans with `scanInProgress`. Compare snapshots and call `reconcileAssets(nextAssets)` only when content changed.

Create one grid click listener and one double-click listener. Cards store `data-asset-id` and `data-index`; unchanged card nodes are reused.

Use an IntersectionObserver rooted at `.assets-container` with a generous root margin. Queue thumbnail reads through `createTaskQueue(4)`, apply results only while the card remains visible and connected, and release image nodes that leave the extended viewport. Use a scroll/resize fallback when IntersectionObserver is missing.

Stop the interval while `document.hidden` is true and refresh when visible again.

- [x] **Step 4: Run all tests and syntax checks**

Run:

```powershell
node tests/asset-utils.test.js
node tests/integration.test.js
node --check js/asset-utils.js
node --check js/main.js
```

Expected: every command exits with code 0.

### Task 3: Synchronize and verify deployment

**Files:**
- Copy tested `index.html`, `js/main.js`, and `js/asset-utils.js` to the source package.
- Copy the same files to `C:\Users\t7597\AppData\Roaming\Adobe\CEP\extensions\com.hbird.bridge.ps.panel`.
- Copy `tests` and `docs/superpowers` to the source package only.

- [x] **Step 1: Back up replaced production files**

Create timestamped `.bak-20260710` copies beside the source and installed `index.html` and `js/main.js` before replacement.

- [x] **Step 2: Copy only approved files**

Do not overwrite CSS, manifest, installer, or user settings. Synchronize only the files listed above.

- [x] **Step 3: Verify deployed content**

Run the Node tests from the source package, syntax-check the installed JavaScript, and compare SHA-256 hashes for the three deployed runtime files across staging, source, and installed directories.

Expected: tests pass, syntax checks exit 0, and each three-way hash comparison contains one unique hash.
