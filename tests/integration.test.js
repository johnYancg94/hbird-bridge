'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const style = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
const main = fs.readFileSync(path.join(root, 'js', 'main.js'), 'utf8');
const assetUtils = fs.readFileSync(path.join(root, 'js', 'asset-utils.js'), 'utf8');
const browserDownloadUtils = fs.readFileSync(path.join(root, 'js', 'browser-download-utils.js'), 'utf8');
const marqueeRatioUtils = fs.readFileSync(path.join(root, 'js', 'marquee-ratio-utils.js'), 'utf8');
const manifest = fs.readFileSync(path.join(root, 'CSXS', 'manifest.xml'), 'utf8');
const debugConfig = fs.readFileSync(path.join(root, '.debug'), 'utf8');
const installer = fs.readFileSync(path.join(root, '一键安装.bat'), 'utf8');
const installGuide = fs.readFileSync(path.join(root, '安装说明.txt'), 'utf8');
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');

const utilsPosition = index.indexOf('js/asset-utils.js');
const browserUtilsPosition = index.indexOf('js/browser-download-utils.js');
const marqueeRatioUtilsPosition = index.indexOf('js/marquee-ratio-utils.js');
const mainPosition = index.indexOf('js/main.js');

assert(utilsPosition >= 0, 'index.html must load asset-utils.js');
assert(utilsPosition < mainPosition, 'asset-utils.js must load before main.js');
assert(browserUtilsPosition >= 0, 'index.html must load browser-download-utils.js');
assert(browserUtilsPosition < mainPosition, 'browser-download-utils.js must load before main.js');
assert(marqueeRatioUtilsPosition >= 0, 'index.html must load marquee-ratio-utils.js');
assert(marqueeRatioUtilsPosition < mainPosition, 'marquee-ratio-utils.js must load before main.js');
assert(index.includes('<title>Hbird Bridge</title>'), 'document title must use the Hbird Bridge brand');
assert(
    manifest.includes('ExtensionBundleId="com.hbird.bridge.ps.panel"'),
    'manifest bundle id must use the Hbird Bridge identity'
);
assert(
    manifest.includes('<Extension Id="com.hbird.bridge.ps.panel" Version="1.9.4"/>'),
    'manifest extension id and version must be current'
);
const maxSizeMatch = manifest.match(
    /<MaxSize>\s*<Height>(\d+)<\/Height>\s*<Width>(\d+)<\/Width>\s*<\/MaxSize>/
);
const minSizeMatch = manifest.match(
    /<MinSize>\s*<Height>(\d+)<\/Height>\s*<Width>(\d+)<\/Width>\s*<\/MinSize>/
);
assert(maxSizeMatch, 'manifest must declare an explicit maximum panel size');
assert(minSizeMatch, 'manifest must declare an explicit minimum panel size');
assert(
    Number(maxSizeMatch[1]) > Number(minSizeMatch[1]) &&
        Number(maxSizeMatch[2]) > Number(minSizeMatch[2]),
    'panel height and width must each have an independent resizable range'
);
assert(Number(maxSizeMatch[1]) >= 2000, 'panel must support substantial vertical expansion');
assert(Number(maxSizeMatch[2]) >= 2000, 'panel must support substantial horizontal expansion');
assert(manifest.includes('<Menu>Hbird Bridge</Menu>'), 'Photoshop menu must use the Hbird Bridge brand');
assert(debugConfig.includes('<Extension Id="com.hbird.bridge.ps.panel">'), 'debug id must match the manifest');
assert(
    assetUtils.includes('root.HbirdBridgeAssetUtils = api'),
    'browser utility global must use the Hbird Bridge namespace'
);
assert(
    browserDownloadUtils.includes('root.HbirdBridgeBrowserDownloadUtils = api'),
    'browser download utility global must use the Hbird Bridge namespace'
);
assert(
    marqueeRatioUtils.includes('root.HbirdBridgeMarqueeRatioUtils = api'),
    'marquee ratio utility global must use the Hbird Bridge namespace'
);
assert(
    main.includes('const AssetUtils = window.HbirdBridgeAssetUtils'),
    'main controller must consume the renamed utility global'
);
assert(
    main.includes('const MarqueeRatioUtils = window.HbirdBridgeMarqueeRatioUtils'),
    'main controller must consume the marquee ratio utility global'
);
assert(main.includes("path.join(homeDir, 'HbirdBridge')"), 'new installs must use the renamed default asset root');
assert(main.includes("const SETTINGS_FILENAME = 'HbirdBridge_settings.json'"), 'new settings must use the renamed file');
assert(
    main.includes("const LEGACY_SETTINGS_FILENAME = 'Qiaodoumayijiang_settings.json'"),
    'old settings filename must remain as an explicit migration source'
);
assert(main.includes('if (candidate.legacy)'), 'legacy settings must trigger migration');
assert(main.includes('if (saveSettings())'), 'legacy settings migration must persist and verify the new settings file');
assert(installer.includes('set "EXTENSION_NAME=com.hbird.bridge.ps.panel"'), 'installer must target the renamed extension');
assert(
    installer.includes('set "LEGACY_EXTENSION_NAME=com.qiaodoumayijiang.ps.panel"'),
    'installer must know the old extension identity for cleanup'
);
assert(installer.includes('将图片直接放入 %ASSETS_FOLDER% 根目录'), 'installer must preserve root-only image discovery');
assert(installer.includes('/XD "docs" "tests"'), 'installer must omit development-only directories');
assert(installer.includes('"*.bak*"'), 'installer must omit backup files');
assert(installGuide.includes('Hbird Bridge - 安装与使用说明'), 'install guide must use the Hbird Bridge brand');
assert(
    installGuide.includes('智能对象导入：替换当前图层并保持原位置，完成后自动栅格化'),
    'install guide must document smart import rasterization'
);
assert(
    readme.includes('智能对象导入：替换当前图层并保持原位置，完成后自动栅格化目标图层'),
    'README must document smart import rasterization'
);

assert(!main.includes('fs.readdirSync('), 'directory reads must not block the CEP UI thread');
assert(!main.includes('fs.statSync(fullPath)'), 'asset metadata reads must be asynchronous');
assert(!main.includes('fs.readFileSync(filePath)'), 'thumbnail reads must be asynchronous');
assert(!main.includes("grid.innerHTML = ''"), 'refresh must not clear and rebuild the complete grid');

assert(main.includes('AssetUtils.mapLimit'), 'filesystem metadata work must have bounded concurrency');
assert(main.includes('AssetUtils.createTaskQueue(4)'), 'thumbnail reads must be limited to four at a time');
assert(main.includes('function reconcileAssets'), 'asset changes must reconcile existing cards');
assert(main.includes('IntersectionObserver'), 'thumbnail work must be visibility-driven');
assert(main.includes("document.addEventListener('visibilitychange'"), 'hidden panels must pause polling');
assert(main.includes("elements.assetsGrid.addEventListener('click'"), 'grid clicks must use event delegation');
assert(!main.includes('source.deletedCount'), 'delete status must read deletedCount from refresh options');
assert(
    main.includes("refreshAssets({ source: 'delete', force: true, deletedCount: successCount })"),
    'delete refresh must preserve its success count'
);

const settingsButtonPosition = index.indexOf('id="settingsBtn"');
const openFolderButtonPosition = index.indexOf('id="openFolderBtn"');
const refreshButtonPosition = index.indexOf('id="refreshBtn"');
const archiveButtonPosition = index.indexOf('id="archiveBtn"');
const autoRefreshPosition = index.indexOf('id="autoRefreshIndicator"');
const placeLayerButtonPosition = index.indexOf('id="placeLayerBtn"');
const copySelectionButtonPosition = index.indexOf('id="copySelectionBtn"');
const smartObjectButtonPosition = index.indexOf('id="smartObjectBtn"');
const ratioToolbarPosition = index.indexOf('id="ratioPresetBar"');
const assetsContainerPosition = index.indexOf('class="assets-container"');

assert(archiveButtonPosition > openFolderButtonPosition, 'archive button must follow open-folder button');
assert(archiveButtonPosition < autoRefreshPosition, 'archive button must precede auto-refresh status');
assert(refreshButtonPosition > autoRefreshPosition, 'manual refresh icon must follow auto-refresh status');
assert(settingsButtonPosition > refreshButtonPosition, 'settings gear must follow the manual refresh icon');
assert(ratioToolbarPosition > smartObjectButtonPosition, 'ratio presets must follow all main action buttons');
assert(assetsContainerPosition < ratioToolbarPosition, 'ratio presets must sit below the asset grid');
assert(
    index.slice(refreshButtonPosition, settingsButtonPosition).includes('</button>'),
    'manual refresh icon must be immediately before the settings gear'
);
assert(index.includes('id="openFolderBtn" class="btn toolbar-command toolbar-command-open"'));
assert(index.includes('class="toolbar-button-label">打开目录</span>'));
assert(index.includes('class="toolbar-status-dot"'), 'auto monitoring must use the compact cyan status dot');
assert(index.includes('id="refreshBtn"'), 'manual scan must use a dedicated refresh icon');
assert(index.includes('aria-label="重新扫描素材"'), 'manual refresh icon needs an accessible label');
assert(!index.includes('id="scanFolderBtn"'), 'the old scan-folder button identity must be removed');
assert(!index.includes('id="assetsDir"'), 'asset directory must not occupy the main toolbar');
assert(!index.includes('id="browseDirBtn"'), 'directory browsing must move into settings');
assert(!index.includes('id="openAssetsDirBtn"'), 'directory opening must move into settings');
assert(index.includes('id="settingsOverlay"'), 'settings must use an in-panel modal overlay');
assert(index.includes('id="settingsAssetsDir"'), 'settings must contain the asset directory field');
assert(index.includes('id="settingsBrowseDirBtn"'), 'settings must allow selecting an asset directory');
assert(index.includes('id="settingsOpenAssetsDirBtn"'), 'settings must allow opening the selected asset directory');
assert(
    index.includes('id="settingsUseBrowserDownloadsBtn"'),
    'settings must offer automatic browser download directory detection'
);
assert(index.includes('id="browserDownloadStatus"'), 'settings must show the browser directory detection result');
assert(index.includes('id="settingsClipboardMaxEdge"'), 'settings must expose clipboard maximum edge resolution');
assert(index.includes('value="2560"'), 'clipboard optimization must default to 2560 pixels');
assert(index.includes('aria-label="打开设置"'), 'settings gear needs an accessible label');
for (const label of ['自由', '1:1', '9:16', '16:9', '3:4', '4:3']) {
    assert(
        index.includes(`class="ratio-preset" data-ratio-label="${label}"`),
        `${label} must be a pinned ratio preset`
    );
}
assert(index.includes('id="ratioMoreBtn"'), 'secondary presets must be available from an overflow button');
assert(index.includes('id="ratioMoreMenu"'), 'secondary presets must render in an overflow menu');
assert(index.includes('class="ratio-section-title"'), 'the bottom ratio module must have a visible section title');
assert(index.includes('data-ratio-label="自由" data-ratio-mode="free"'), 'pinned presets must include free selection mode');
assert.strictEqual(
    (index.match(/class="ratio-shape/g) || []).length,
    15,
    'every ratio preset, including free mode, must have a white outline shape cue'
);
assert(index.includes('class="button-icon"'), 'primary actions must use consistent line icons');
assert(
    index.includes('id="deleteBtn" class="btn btn-danger action-icon-only"') &&
        index.includes('aria-label="删除已选素材"') &&
        index.includes('data-tooltip="删除已选素材文件"'),
    'delete must be an accessible icon-only action with a custom tooltip'
);
assert(
    index.includes('id="openNewBtn" class="btn btn-open action-icon-only"') &&
        index.includes('aria-label="新建文档打开"') &&
        index.includes('data-tooltip="将已选图片分别打开为新文档"'),
    'new-document open must be an accessible icon-only action with a custom tooltip'
);
assert(!index.includes('<span>删除</span>'), 'delete must not render a visible text label');
assert(!index.includes('<span>新建文档打开</span>'), 'new-document open must not render a visible text label');
assert(
    /class="selection-info"[\s\S]*?class="status-bar"/.test(index),
    'selection count and runtime status must share one summary strip'
);
assert(style.includes('.settings-overlay'), 'settings modal overlay styling must exist');
assert(style.includes('.settings-dialog'), 'settings dialog styling must exist');
assert(style.includes('.btn-settings'), 'compact gear button styling must exist');
assert(style.includes('.btn-refresh'), 'manual refresh icon styling must exist');
assert(
    /\.toolbar\s*\{[^}]*padding:\s*4px;/s.test(style) &&
        /\.toolbar-row-main\s*\{[^}]*min-height:\s*36px;/s.test(style) &&
        /\.toolbar-command\s*\{[^}]*height:\s*36px;/s.test(style),
    'the top toolbar must use the compact 36px control height'
);
assert(
    /\.icon-button\s*\{[^}]*width:\s*36px;[^}]*height:\s*36px;/s.test(style),
    'top icon buttons must shrink with the compact toolbar'
);
assert(style.includes('.ratio-preset-bar'), 'ratio toolbar styling must exist');
assert(style.includes('.ratio-more-menu'), 'ratio overflow menu styling must exist');
assert(
    /\.ratio-primary-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s.test(style),
    'free mode and five pinned ratios must form a three-column, two-row grid'
);
assert(
    /\.ratio-toolbar\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:/s.test(style),
    'the bottom ratio module must separate its title from its controls'
);
assert(
    /\.ratio-more-menu\s*\{[^}]*bottom:/s.test(style),
    'the bottom overflow menu must open upward'
);
assert(!style.includes('inset: 0'), 'settings overlay must remain compatible with CEP 9 Chromium');
assert(
    /\.settings-overlay\s*\{[^}]*(?:top:\s*0;)[^}]*(?:right:\s*0;)[^}]*(?:bottom:\s*0;)[^}]*(?:left:\s*0;)/s.test(style),
    'settings overlay must use legacy-compatible full-panel edges'
);
assert(
    /\.settings-dialog\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*430px;/s.test(style),
    'settings dialog must use a legacy-compatible responsive width'
);
assert(copySelectionButtonPosition > placeLayerButtonPosition, 'copy-selection must be on the lower action row');
assert(smartObjectButtonPosition > copySelectionButtonPosition, 'smart-object import must follow copy-selection');
assert(smartObjectButtonPosition > placeLayerButtonPosition, 'smart-object import must follow normal layer import');
assert(
    index.includes('title="替换当前图层并保持原位置，完成后自动栅格化"'),
    'smart-object import tooltip must disclose rasterization'
);
assert(
    /\.action-button-row-main\s*\{[^}]*grid-template-columns:\s*52px\s+52px\s+minmax\(0,\s*1fr\)/s.test(style),
    'the two icon-only actions must use fixed compact columns'
);
assert(style.includes('.action-icon-only[data-tooltip]::after'), 'icon-only actions must render custom tooltip bubbles');
assert(
    /\.action-icon-only\[data-tooltip\]:hover::after,[\s\S]*?\.action-icon-only\[data-tooltip\]:focus::after/s.test(style),
    'custom tooltips must be available on hover and keyboard focus'
);
assert(
    !/\.action-button-row-main \.btn\s*\{[^}]*min-height:\s*62px/s.test(style),
    'the upper three action buttons must no longer be taller than the second row'
);
assert(
    /\.action-buttons \.btn\s*\{[^}]*height:\s*42px;[^}]*min-height:\s*42px;/s.test(style),
    'standard action rows must use exactly seventy percent of the former 60px height'
);
assert(
    /@media\s*\(max-width:\s*430px\)[\s\S]*?\.action-buttons \.btn\s*\{[^}]*height:\s*41px;[^}]*min-height:\s*41px;/s.test(style),
    'narrow action rows must use the rounded seventy-percent height'
);
assert(
    /@media\s*\(max-height:\s*620px\)[\s\S]*?\.action-buttons \.btn\s*\{[^}]*height:\s*35px;[^}]*min-height:\s*35px;/s.test(style),
    'short-panel action rows must use exactly seventy percent of the former 50px height'
);
assert(
    /\.assets-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,/s.test(style) &&
        !/@media\s*\(max-width:\s*380px\)[\s\S]*?\.assets-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s.test(style),
    'the asset browser must keep three columns as its default at CEP panel widths'
);
assert(
    /@media\s*\(min-width:\s*700px\)[\s\S]*?\.assets-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4,/s.test(style),
    'wide panels must expand the asset grid to four columns'
);
assert(
    /@media\s*\(min-width:\s*1000px\)[\s\S]*?\.assets-grid\s*\{[^}]*grid-template-columns:\s*repeat\(5,/s.test(style),
    'very wide panels must expand the asset grid to five columns'
);
assert(
    !/\.container\s*\{[^}]*aspect-ratio:/s.test(style),
    'the panel root must never impose an aspect ratio'
);
assert(style.includes('--surface-toolbar: #182128'), 'the approved Obsidian toolbar palette must be present');
assert(
    /function setAutoRefreshIndicator\(active\)[\s\S]{0,650}?classList\.toggle\('is-active', active\)/.test(main),
    'auto monitoring state must be represented by a class-driven status dot'
);
assert(
    !/function setAutoRefreshIndicator\(active\)[\s\S]{0,650}?autoRefreshIndicator\.textContent/.test(main),
    'auto monitoring updates must not replace the dot with visible text'
);

assert(main.includes("const childProcess = require('child_process')"), 'Explorer must launch without shell concatenation');
assert(main.includes("settingsBtn: document.getElementById('settingsBtn')"));
assert(main.includes("openFolderBtn: document.getElementById('openFolderBtn')"));
assert(main.includes("refreshBtn: document.getElementById('refreshBtn')"));
assert(main.includes("settingsAssetsDir: document.getElementById('settingsAssetsDir')"));
assert(main.includes("const BrowserDownloadUtils = window.HbirdBridgeBrowserDownloadUtils"));
assert(main.includes("settingsUseBrowserDownloadsBtn: document.getElementById('settingsUseBrowserDownloadsBtn')"));
assert(main.includes("browserDownloadStatus: document.getElementById('browserDownloadStatus')"));
assert(main.includes("settingsClipboardMaxEdge: document.getElementById('settingsClipboardMaxEdge')"));
assert(main.includes("elements.settingsBtn.addEventListener('click', openSettings)"));
assert(
    main.includes("elements.openFolderBtn.addEventListener('click', () => openAssetsDirectory(CONFIG.assetsDir))"),
    'main folder button must open the active asset directory'
);
assert(
    main.includes("elements.refreshBtn.addEventListener('click', scanFolder)"),
    'refresh icon must own the original manual scan action'
);
assert(main.includes("elements.saveSettingsBtn.addEventListener('click', applySettings)"));
assert(main.includes("elements.settingsBrowseDirBtn.addEventListener('click', browseDir)"));
assert(
    main.includes("elements.settingsUseBrowserDownloadsBtn.addEventListener('click', useBrowserDownloadDirectory)")
);
assert(main.includes("elements.settingsOpenAssetsDirBtn.addEventListener('click'"));
assert(main.includes("elements.archiveBtn.addEventListener('click', archiveOldImages)"));
assert(main.includes("smartObjectBtn: document.getElementById('smartObjectBtn')"));
assert(main.includes("copySelectionBtn: document.getElementById('copySelectionBtn')"));
assert(main.includes("elements.copySelectionBtn.addEventListener('click', copyCurrentSelection)"));
assert(main.includes("elements.smartObjectBtn.addEventListener('click', () => importToPS('smartObject'))"));
assert(main.includes("elements.ratioPresetBar.addEventListener('click', handleRatioPresetClick)"));
assert(main.includes("elements.ratioMoreBtn.addEventListener('click', toggleRatioMenu)"));
assert(main.includes('MarqueeRatioUtils.buildMarqueeRatioScript'), 'preset clicks must build a Photoshop ratio script');
assert(main.includes('function applyMarqueeRatio'), 'the ratio action must have a dedicated controller');
assert(main.includes("if (mode === 'smartObject' && selectedAssets.size !== 1)"));
assert(main.includes("} else if (mode === 'smartObject') {"));
const placeBranchStart = main.indexOf("} else if (mode === 'place') {");
const smartBranchStart = main.indexOf("} else if (mode === 'smartObject') {");
const placeBranch = main.slice(placeBranchStart, smartBranchStart);
const smartObjectBranch = main.slice(smartBranchStart);
const closeSmartContentsPosition = smartObjectBranch.indexOf('smartDocument.close(SaveOptions.SAVECHANGES)');
const reactivateSmartLayerPosition = smartObjectBranch.indexOf('parentDocument.activeLayer = targetSmartLayer');
const rasterizeSmartLayerPosition = smartObjectBranch.indexOf('targetSmartLayer.rasterize(RasterizeType.ENTIRELAYER)');
assert(
    placeBranch.includes('doc.activeLayer.rasterize(RasterizeType.ENTIRELAYER)'),
    'normal layer import must rasterize Photoshop Place output'
);
assert(
    smartObjectBranch.includes('var targetSmartLayer = parentDocument.activeLayer'),
    'smart-object import must retain an explicit reference to the replaced outer layer'
);
assert(
    closeSmartContentsPosition >= 0 &&
        closeSmartContentsPosition < reactivateSmartLayerPosition &&
        reactivateSmartLayerPosition < rasterizeSmartLayerPosition,
    'the replaced outer smart-object layer must be reactivated and rasterized after its contents close'
);
assert(
    smartObjectBranch.includes('targetSmartLayer.kind === LayerKind.SMARTOBJECT'),
    'smart-object rasterization must guard the target layer type'
);
assert(
    smartObjectBranch.includes('rasterized: true'),
    'smart-object import response must report rasterization'
);
assert(
    main.includes('智能对象导入完成并已栅格化'),
    'smart-object import status must disclose the destructive rasterization step'
);
assert(main.includes('stringIDToTypeID("newPlacedLayer")'), 'regular layers must be converted automatically');
assert(main.includes('stringIDToTypeID("placedLayerEditContents")'), 'smart-object contents must be opened');
assert(
    /Math\.max\(\s*canvasWidth\s*\/\s*contentWidth,\s*canvasHeight\s*\/\s*contentHeight\s*\)\s*\*\s*100/.test(main)
);
assert(main.includes('layer.translate(UnitValue(offsetX, "px"), UnitValue(offsetY, "px"))'));
assert(main.includes('originalLayers[i].remove()'), 'old smart-object contents must be removed after placement');
assert(main.includes('smartDocument.close(SaveOptions.SAVECHANGES)'));
assert(main.includes('parentDocument.activeHistoryState = originalHistoryState'), 'failed imports must restore history');
assert(
    main.includes("const rawResult = String(result || '无返回值').slice(0, 160)"),
    'unexpected Photoshop script results must be visible for diagnosis'
);
assert(main.includes('"SMART_FATAL|" + fatalError.toString()'), 'fatal ExtendScript errors must include details');
assert(main.includes('function stringifyResponse(value)'), 'ExtendScript needs a JSON-compatible serializer');
assert(!main.includes('return JSON.stringify('), 'ExtendScript must not call its missing JSON global');
assert(main.includes('clipboardMaxEdge: 2560'), 'clipboard maximum edge must default to 2560 pixels');
assert(main.includes('settings.clipboardMaxEdge'), 'clipboard maximum edge must load from settings');
assert(
    main.includes('clipboardMaxEdge: CONFIG.clipboardMaxEdge'),
    'clipboard maximum edge must persist with the asset directory'
);
assert(
    main.includes('const explorerDirectory = path.win32.normalize(directoryPath || CONFIG.assetsDir);'),
    'CEP forward-slash paths must be normalized before launching Explorer'
);
assert(main.includes("childProcess.execFile('explorer.exe', [explorerDirectory]"));
assert(
    !main.includes("childProcess.execFile('explorer.exe', [CONFIG.assetsDir]"),
    'Explorer must never receive the raw CEP path'
);
assert(main.includes('AssetUtils.buildArchivePlan(assets, CONFIG.archiveKeepCount)'));
assert(main.includes('const archiveRoot = path.resolve(CONFIG.assetsDir);'));
assert(main.includes('scanFolderInternal(archiveRoot)'));
assert(main.includes('buildArchiveMovePlan(archivePlan.archive, archiveRoot)'));
assert(main.includes('function buildArchiveMovePlan(archiveAssets, archiveRoot)'));
assert(
    /function setArchiveBusy\(busy\)[\s\S]*?elements\.settingsBtn,[\s\S]*?elements\.saveSettingsBtn/.test(main),
    'archive work must lock settings entry and saving'
);
assert(
    main.includes('UrlAssociations\\\\https\\\\UserChoice'),
    'browser detection must query the current user HTTPS UserChoice'
);
assert(
    main.includes("Registry::HKEY_CLASSES_ROOT\\\\${progId}\\\\shell\\\\open\\\\command"),
    'browser detection must resolve the UserChoice ProgId command'
);
assert(
    main.includes("id: 'unsupported'") &&
        main.includes("name: '当前默认浏览器'"),
    'an unrecognized UserChoice must remain unsupported instead of falling back to another browser'
);
assert(
    main.includes('[System.Text.UTF8Encoding]'),
    'registry values must be emitted as UTF-8 for Chinese paths'
);
assert(
    browserDownloadUtils.includes('download.default_directory'),
    'Chromium download preferences must be supported'
);
assert(main.includes("path.join(localAppData, 'Quark', 'User Data')"), 'Quark Chromium profiles must be supported');
assert(main.includes("root: path.join(appData, 'zen')"), 'Zen Firefox-compatible profiles must be supported');
assert(
    browserDownloadUtils.includes('browser\\.download\\.dir'),
    'Firefox download preferences must be supported'
);
assert(
    main.includes('{374DE290-123F-4565-9164-39C4925E467B}'),
    'browser detection must fall back to the Windows Downloads known folder'
);
assert(
    main.includes('function setBrowserDirectoryDetectionBusy(busy)'),
    'browser detection must lock conflicting settings actions'
);
assert(
    main.includes("? 'read-error'") &&
        main.includes("result.fallbackReason === 'read-error'"),
    'browser configuration read failures must remain distinguishable from an unset custom path'
);
assert(
    /function setArchiveBusy\(busy\)[\s\S]*?elements\.openFolderBtn,[\s\S]*?elements\.refreshBtn/.test(main),
    'archive work must lock both folder and manual-refresh toolbar actions'
);
assert(
    /function applySettings\(\)[\s\S]{0,500}?if \(archiveInProgress\)/.test(main),
    'settings changes must be rejected while an archive is running'
);
assert(main.includes('return true;') && main.includes('return false;'), 'settings persistence must report success or failure');
assert(
    main.includes("if (!saveSettings()) {") &&
        main.includes("setStatus('设置保存失败')"),
    'the settings dialog must stay open and report failed persistence'
);
assert(main.includes('AssetUtils.createUniqueArchiveFileName'));
assert(main.includes('renamedForCollision'), 'collision renames must be visible in archive results');
assert(!main.includes('findArchiveCollisions(movePlan)'), 'collisions must be resolved instead of aborting the archive');
assert(main.includes('const confirmed = confirm('), 'archive action must show a confirmation summary');
assert(main.includes('AssetUtils.mapLimit(movePlan, CONFIG.archiveMoveConcurrency'));
assert(main.includes('fs.rename(item.asset.fullPath, item.targetPath'));
assert(main.includes("source: 'archive'"), 'archive completion must force a panel refresh');
assert(main.includes('archiveInProgress'), 'archive work must prevent overlapping refreshes');
assert(!main.includes("subdir: 'images'"), 'active image scanning must not read the legacy images folder');
assert(
    main.includes("{ subdir: '', dirPath: baseDirectory }"),
    'the selected asset root must be the single active image source'
);

console.log('integration: all assertions passed');
