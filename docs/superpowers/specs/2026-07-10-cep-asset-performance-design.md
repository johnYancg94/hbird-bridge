# CEP Asset Browser Performance Design

## Goal

Keep the Hbird Bridge Photoshop CEP panel responsive with hundreds of images while preserving its current import, selection, deletion, directory selection, and auto-refresh behavior.

## Approved scope

Use the balanced optimization approach:

- scan directories asynchronously and prevent overlapping scans;
- compare path, size, and modification time so same-count replacements are detected;
- reconcile only added, removed, or changed cards;
- lazy-load thumbnails near the viewport with a maximum of four concurrent reads;
- release thumbnails that move far outside the viewport;
- pause polling while the panel document is hidden;
- keep Base64 image sources for CEP compatibility;
- add no third-party dependencies.

Persistent on-disk thumbnail generation, full grid virtualization, and `fs.watch` are deliberately outside this change.

## Architecture

`js/asset-utils.js` contains environment-independent scheduling and asset-diff functions. It is exposed as both a browser global and a CommonJS module so the CEP panel can load it with a script tag and Node can test it directly.

`js/main.js` remains the application controller. It performs asynchronous filesystem calls, uses the utility module to limit concurrency and detect changes, reconciles the DOM, and observes card visibility. `index.html` loads the utility module before the controller.

## Data flow

1. A manual refresh, initial load, or timer requests a scan.
2. If another scan is active, the request is skipped rather than overlapped.
3. The selected asset root is read asynchronously as the single active image source.
4. Unsupported extensions are discarded before filesystem metadata calls.
5. Metadata reads run with bounded concurrency and produce a sorted asset list.
6. A snapshot detects path, size, or modification-time changes.
7. The grid removes missing cards, replaces changed cards, preserves unchanged cards, and reorders existing nodes.
8. Visibility observation queues only nearby thumbnails; leaving the extended viewport releases decoded image data.

## Error handling

Missing directories and files that disappear during a scan are ignored and logged at debug level. A failed scan leaves the last successful grid intact and exposes a status message. Failed thumbnail reads retain the placeholder instead of aborting other loads.

## Compatibility

The implementation uses APIs available to the existing CEP/Chromium baseline: callbacks, Promises, Set, Map, and IntersectionObserver. A scroll/resize visibility fallback is included when IntersectionObserver is unavailable. No new package or Photoshop API is introduced.

## Verification

- Node tests prove bounded task concurrency, stable result order, asset snapshots, and same-count update detection.
- Syntax checks parse both JavaScript files.
- Static integration checks verify script ordering and the absence of synchronous image reads in the controller.
- SHA-256 hashes verify that the tested files match both the source package and installed CEP extension after synchronization.
