/**
 * Hbird Bridge - 主逻辑
 * 版本 1.11.1 - 一键归档按钮层次优化
 */

(function() {
    'use strict';

    // ==================== 配置 ====================
    const CONFIG = {
        assetsDir: '',
        recentAssetsDirs: [],
        clipboardMaxEdge: 2560,
        supportedImages: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff', '.tif', '.psd'],
        autoRefreshInterval: 5000,
        scanConcurrency: 16,
        archiveKeepCount: 10,
        archiveMoveConcurrency: 4,
        maxThumbnailFileSize: 10 * 1024 * 1024,
        lazyLoadMargin: 400
    };

    // CEP 接口
    const csInterface = new CSInterface();

    // Node.js 模块
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const childProcess = require('child_process');

    // 性能工具
    const AssetUtils = window.HbirdBridgeAssetUtils;
    if (!AssetUtils) {
        throw new Error('asset-utils.js 未正确加载');
    }
    const BrowserDownloadUtils = window.HbirdBridgeBrowserDownloadUtils;
    if (!BrowserDownloadUtils) {
        throw new Error('browser-download-utils.js 未正确加载');
    }
    const MarqueeRatioUtils = window.HbirdBridgeMarqueeRatioUtils;
    if (!MarqueeRatioUtils) {
        throw new Error('marquee-ratio-utils.js 未正确加载');
    }
    const DirectoryHistoryUtils = window.HbirdBridgeDirectoryHistoryUtils;
    if (!DirectoryHistoryUtils) {
        throw new Error('directory-history-utils.js 未正确加载');
    }

    const supportedImageSet = new Set(CONFIG.supportedImages);
    const thumbnailQueue = AssetUtils.createTaskQueue(4);

    // 状态
    let currentAssets = [];
    let filteredAssets = [];
    let selectedAssets = new Set();
    let assetById = new Map();
    let assetCards = new Map();
    let lastClickedIndex = -1;
    let lastSnapshot = '';
    let autoRefreshTimer = null;
    let scanInProgress = false;
    let archiveInProgress = false;
    let pendingRefreshOptions = null;
    let thumbnailObserver = null;
    let fallbackLazyCards = new Set();
    let fallbackCheckScheduled = false;
    let browserDirectoryDetectionInProgress = false;
    let marqueeRatioInProgress = false;

    // DOM 元素
    let elements = {};

    // ==================== 初始化 ====================

    function init() {
        const homeDir = os.homedir();
        CONFIG.assetsDir = path.join(homeDir, 'HbirdBridge');

        elements = {
            settingsBtn: document.getElementById('settingsBtn'),
            settingsOverlay: document.getElementById('settingsOverlay'),
            closeSettingsBtn: document.getElementById('closeSettingsBtn'),
            cancelSettingsBtn: document.getElementById('cancelSettingsBtn'),
            saveSettingsBtn: document.getElementById('saveSettingsBtn'),
            settingsClipboardMaxEdge: document.getElementById('settingsClipboardMaxEdge'),
            directoryPicker: document.querySelector('.directory-picker'),
            directoryMenuBtn: document.getElementById('directoryMenuBtn'),
            directoryCurrentName: document.getElementById('directoryCurrentName'),
            directoryMenu: document.getElementById('directoryMenu'),
            directoryHistoryList: document.getElementById('directoryHistoryList'),
            directoryChooseBtn: document.getElementById('directoryChooseBtn'),
            directoryUseBrowserDownloadsBtn: document.getElementById('directoryUseBrowserDownloadsBtn'),
            directoryBrowserButtonLabel: document.getElementById('directoryBrowserButtonLabel'),
            directoryBrowserStatus: document.getElementById('directoryBrowserStatus'),
            openFolderBtn: document.getElementById('openFolderBtn'),
            refreshBtn: document.getElementById('refreshBtn'),
            archiveBtn: document.getElementById('archiveBtn'),
            ratioPresetBar: document.getElementById('ratioPresetBar'),
            ratioMoreBtn: document.getElementById('ratioMoreBtn'),
            ratioMoreMenu: document.getElementById('ratioMoreMenu'),
            assetsContainer: document.querySelector('.assets-container'),
            assetsGrid: document.getElementById('assetsGrid'),
            selectionCount: document.getElementById('selectionCount'),
            deleteBtn: document.getElementById('deleteBtn'),
            openNewBtn: document.getElementById('openNewBtn'),
            placeLayerBtn: document.getElementById('placeLayerBtn'),
            copySelectionBtn: document.getElementById('copySelectionBtn'),
            smartObjectBtn: document.getElementById('smartObjectBtn'),
            statusText: document.getElementById('statusText'),
            autoRefreshIndicator: document.getElementById('autoRefreshIndicator')
        };

        // 固定控件事件
        elements.directoryMenuBtn.addEventListener('click', toggleDirectoryMenu);
        elements.directoryChooseBtn.addEventListener('click', chooseAssetsDirectory);
        elements.directoryUseBrowserDownloadsBtn.addEventListener('click', useBrowserDownloadDirectory);
        elements.directoryHistoryList.addEventListener('click', handleDirectoryHistoryClick);
        elements.openFolderBtn.addEventListener('click', () => openAssetsDirectory(CONFIG.assetsDir));
        elements.refreshBtn.addEventListener('click', scanFolder);
        elements.settingsBtn.addEventListener('click', openSettings);
        elements.closeSettingsBtn.addEventListener('click', closeSettings);
        elements.cancelSettingsBtn.addEventListener('click', closeSettings);
        elements.saveSettingsBtn.addEventListener('click', applySettings);
        elements.settingsOverlay.addEventListener('click', event => {
            if (event.target === elements.settingsOverlay) {
                closeSettings();
            }
        });
        elements.archiveBtn.addEventListener('click', archiveOldImages);
        elements.ratioPresetBar.addEventListener('click', handleRatioPresetClick);
        elements.ratioMoreBtn.addEventListener('click', toggleRatioMenu);
        document.addEventListener('click', handleDirectoryMenuOutsideClick);
        document.addEventListener('click', handleRatioMenuOutsideClick);
        elements.deleteBtn.addEventListener('click', deleteSelectedAssets);
        elements.openNewBtn.addEventListener('click', () => importToPS('open'));
        elements.placeLayerBtn.addEventListener('click', () => importToPS('place'));
        elements.copySelectionBtn.addEventListener('click', copyCurrentSelection);
        elements.smartObjectBtn.addEventListener('click', () => importToPS('smartObject'));

        // 素材卡片使用事件委托，避免每张卡片创建监听器
        elements.assetsGrid.addEventListener('click', handleGridClick);
        elements.assetsGrid.addEventListener('dblclick', handleGridDoubleClick);

        setupThumbnailVisibility();
        loadSettings();
        normalizeDirectoryHistory();
        syncSettingsFields();
        renderDirectoryMenu();
        loadAssets();
        startAutoRefresh();
    }

    // ==================== 自动刷新 ====================

    function startAutoRefresh() {
        stopAutoRefresh();
        if (document.hidden) {
            setAutoRefreshIndicator(false);
            return;
        }

        autoRefreshTimer = setInterval(checkForNewFiles, CONFIG.autoRefreshInterval);
        setAutoRefreshIndicator(true);
    }

    function stopAutoRefresh() {
        if (autoRefreshTimer) {
            clearInterval(autoRefreshTimer);
            autoRefreshTimer = null;
        }
    }

    function setAutoRefreshIndicator(active) {
        if (!elements.autoRefreshIndicator) return;
        elements.autoRefreshIndicator.classList.toggle('is-active', active);
        elements.autoRefreshIndicator.classList.toggle('is-paused', !active);
        const label = active ? '自动监听中' : '监听已暂停';
        elements.autoRefreshIndicator.setAttribute('aria-label', label);
        elements.autoRefreshIndicator.title = label;
    }

    function checkForNewFiles() {
        if (document.hidden || scanInProgress || archiveInProgress) return;
        refreshAssets({ source: 'auto', force: false });
    }

    function flashAutoRefreshIndicator() {
        if (!elements.autoRefreshIndicator) return;
        elements.autoRefreshIndicator.classList.add('is-flashing');
        setTimeout(() => {
            elements.autoRefreshIndicator.classList.remove('is-flashing');
        }, 500);
    }

    function handleVisibilityChange() {
        if (document.hidden) {
            stopAutoRefresh();
            setAutoRefreshIndicator(false);
        } else {
            startAutoRefresh();
            if (!archiveInProgress) {
                refreshAssets({ source: 'auto', force: false });
            }
            scheduleFallbackVisibilityCheck();
        }
    }

    // ==================== 矩形选区比例 ====================

    function findRatioPresetButton(target) {
        let node = target;
        while (node && node !== elements.ratioPresetBar) {
            if (node.classList && node.classList.contains('ratio-preset')) {
                return node;
            }
            node = node.parentNode;
        }
        return null;
    }

    function handleRatioPresetClick(event) {
        const button = findRatioPresetButton(event.target);
        if (!button || marqueeRatioInProgress) return;

        const label = button.getAttribute('data-ratio-label') || '';
        const freeMode = button.getAttribute('data-ratio-mode') === 'free';
        const width = freeMode ? null : Number(button.getAttribute('data-ratio-width'));
        const height = freeMode ? null : Number(button.getAttribute('data-ratio-height'));
        const isOverflowPreset = elements.ratioMoreMenu.contains(button);

        closeRatioMenu();
        applyMarqueeRatio(width, height, label, freeMode, isOverflowPreset);
    }

    function toggleRatioMenu(event) {
        if (event) event.stopPropagation();
        if (marqueeRatioInProgress) return;
        const willOpen = elements.ratioMoreMenu.classList.contains('is-hidden');
        elements.ratioMoreMenu.classList.toggle('is-hidden', !willOpen);
        elements.ratioMoreBtn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    }

    function closeRatioMenu() {
        if (!elements.ratioMoreMenu || !elements.ratioMoreBtn) return;
        elements.ratioMoreMenu.classList.add('is-hidden');
        elements.ratioMoreBtn.setAttribute('aria-expanded', 'false');
    }

    function handleRatioMenuOutsideClick(event) {
        if (!elements.ratioPresetBar || elements.ratioPresetBar.contains(event.target)) return;
        closeRatioMenu();
    }

    function setMarqueeRatioBusy(busy) {
        marqueeRatioInProgress = busy;
        const presetButtons = elements.ratioPresetBar.querySelectorAll('.ratio-preset');
        for (let index = 0; index < presetButtons.length; index += 1) {
            presetButtons[index].disabled = busy;
        }
        elements.ratioMoreBtn.disabled = busy;
    }

    function setActiveMarqueeRatio(label, isOverflowPreset) {
        const presetButtons = elements.ratioPresetBar.querySelectorAll('.ratio-preset');
        for (let index = 0; index < presetButtons.length; index += 1) {
            const button = presetButtons[index];
            button.classList.toggle('is-active', button.getAttribute('data-ratio-label') === label);
        }
        elements.ratioMoreBtn.classList.toggle('has-active-preset', isOverflowPreset);
        elements.ratioMoreBtn.title = isOverflowPreset ? `更多比例 · 当前 ${label}` : '更多比例';
        elements.ratioMoreBtn.setAttribute(
            'aria-label',
            isOverflowPreset ? `更多矩形选区比例，当前 ${label}` : '更多矩形选区比例'
        );
    }

    function applyMarqueeRatio(width, height, label, freeMode, isOverflowPreset) {
        let script;
        try {
            script = MarqueeRatioUtils.buildMarqueeRatioScript(width, height, freeMode);
        } catch (error) {
            alert('矩形选区比例无效：' + error.message);
            setStatus('矩形选区比例无效');
            return;
        }

        setMarqueeRatioBusy(true);
        setStatus(freeMode ? '正在切换矩形选区为自适应...' : `正在设置矩形选区比例 ${label}...`);
        csInterface.evalScript(script, result => {
            setMarqueeRatioBusy(false);
            const response = String(result || '').trim();
            if (response === 'OK') {
                setActiveMarqueeRatio(label, isOverflowPreset);
                setStatus(freeMode ? '矩形选区已切换为自适应' : `矩形选区比例已设为 ${label}`);
                return;
            }

            const detail = response.indexOf('ERROR:') === 0
                ? response.slice(6)
                : (response || 'Photoshop 未返回结果');
            console.log('矩形选区比例设置失败:', detail);
            alert('矩形选区比例设置失败：' + detail);
            setStatus('矩形选区比例设置失败');
        });
    }

    // ==================== 设置管理 ====================

    const SETTINGS_FILENAME = 'HbirdBridge_settings.json';
    const LEGACY_SETTINGS_FILENAME = 'Qiaodoumayijiang_settings.json';
    const MIN_CLIPBOARD_MAX_EDGE = 256;
    const MAX_CLIPBOARD_MAX_EDGE = 16384;
    const MAX_RECENT_ASSET_DIRECTORIES = 3;

    function getSettingsPath(fileName) {
        return path.join(os.homedir(), fileName);
    }

    function loadSettings() {
        const settingsCandidates = [
            { path: getSettingsPath(SETTINGS_FILENAME), legacy: false },
            { path: getSettingsPath(LEGACY_SETTINGS_FILENAME), legacy: true }
        ];

        for (const candidate of settingsCandidates) {
            if (!fs.existsSync(candidate.path)) continue;

            try {
                const settings = JSON.parse(fs.readFileSync(candidate.path, 'utf8'));
                if (settings.assetsDir && fs.existsSync(settings.assetsDir)) {
                    CONFIG.assetsDir = settings.assetsDir;
                }
                if (Array.isArray(settings.recentAssetsDirs)) {
                    CONFIG.recentAssetsDirs = settings.recentAssetsDirs;
                }

                const savedMaxEdge = Number(settings.clipboardMaxEdge);
                if (Number.isFinite(savedMaxEdge)) {
                    CONFIG.clipboardMaxEdge = normalizeClipboardMaxEdge(savedMaxEdge);
                }

                if (candidate.legacy) {
                    if (saveSettings()) {
                        console.log('已将旧版设置迁移到 Hbird Bridge');
                    } else {
                        console.log('旧版设置已载入，但迁移文件写入失败');
                    }
                }
                return;
            } catch(error) {
                console.log('读取设置失败:', candidate.path, error);
            }
        }
    }

    function saveSettings() {
        try {
            const settingsPath = getSettingsPath(SETTINGS_FILENAME);
            fs.writeFileSync(settingsPath, JSON.stringify({
                assetsDir: CONFIG.assetsDir,
                recentAssetsDirs: CONFIG.recentAssetsDirs,
                clipboardMaxEdge: CONFIG.clipboardMaxEdge
            }, null, 2), 'utf8');
            return true;
        } catch(error) {
            console.log('保存设置失败:', error);
            return false;
        }
    }

    // ==================== 目录选择 ====================

    function normalizeClipboardMaxEdge(value) {
        const rounded = Math.round(Number(value));
        if (!Number.isFinite(rounded)) {
            return CONFIG.clipboardMaxEdge;
        }
        return Math.max(MIN_CLIPBOARD_MAX_EDGE, Math.min(MAX_CLIPBOARD_MAX_EDGE, rounded));
    }

    function normalizeDirectoryHistory() {
        const currentDirectory = path.win32.normalize(CONFIG.assetsDir);
        const currentKey = currentDirectory.toLowerCase();
        CONFIG.recentAssetsDirs = DirectoryHistoryUtils.buildDirectoryHistory(
            currentDirectory,
            CONFIG.recentAssetsDirs,
            MAX_RECENT_ASSET_DIRECTORIES
        ).filter(directoryPath => {
            return directoryPath.toLowerCase() === currentKey || fs.existsSync(directoryPath);
        });
    }

    function renderDirectoryMenu() {
        if (!elements.directoryCurrentName || !elements.directoryHistoryList) return;

        normalizeDirectoryHistory();
        const currentDirectory = path.win32.normalize(CONFIG.assetsDir);
        const currentKey = currentDirectory.toLowerCase();
        const currentName = DirectoryHistoryUtils.getDirectoryDisplayName(currentDirectory);

        elements.directoryCurrentName.textContent = currentName;
        elements.directoryMenuBtn.title = `当前素材目录：${currentDirectory}`;
        elements.directoryHistoryList.textContent = '';

        if (CONFIG.recentAssetsDirs.length === 0) {
            const emptyState = document.createElement('p');
            emptyState.className = 'directory-history-empty';
            emptyState.textContent = '暂无历史目录';
            elements.directoryHistoryList.appendChild(emptyState);
            return;
        }

        CONFIG.recentAssetsDirs.forEach(directoryPath => {
            const normalizedPath = path.win32.normalize(directoryPath);
            const isCurrent = normalizedPath.toLowerCase() === currentKey;
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'directory-history-item' + (isCurrent ? ' is-current' : '');
            item.dataset.directoryPath = normalizedPath;
            item.setAttribute('role', 'menuitemradio');
            item.setAttribute('aria-checked', isCurrent ? 'true' : 'false');
            item.title = normalizedPath;
            item.innerHTML = [
                '<svg class="directory-menu-icon" aria-hidden="true"><use xlink:href="#icon-folder"></use></svg>',
                '<span class="directory-item-copy">',
                '<span class="directory-item-name"></span>',
                '<span class="directory-item-path"></span>',
                '</span>',
                '<span class="directory-item-check" aria-hidden="true"></span>'
            ].join('');
            item.querySelector('.directory-item-name').textContent =
                DirectoryHistoryUtils.getDirectoryDisplayName(normalizedPath);
            item.querySelector('.directory-item-path').textContent = normalizedPath;
            item.querySelector('.directory-item-check').textContent = isCurrent ? '✓' : '';
            elements.directoryHistoryList.appendChild(item);
        });
    }

    function closeDirectoryMenu() {
        if (!elements.directoryMenu || !elements.directoryMenuBtn) return;
        elements.directoryMenu.classList.add('is-hidden');
        elements.directoryMenuBtn.setAttribute('aria-expanded', 'false');
    }

    function toggleDirectoryMenu(event) {
        if (event) event.stopPropagation();
        const willOpen = elements.directoryMenu.classList.contains('is-hidden');
        closeRatioMenu();
        if (willOpen) {
            renderDirectoryMenu();
            elements.directoryMenu.classList.remove('is-hidden');
            elements.directoryMenuBtn.setAttribute('aria-expanded', 'true');
        } else {
            closeDirectoryMenu();
        }
    }

    function handleDirectoryMenuOutsideClick(event) {
        if (!elements.directoryPicker || elements.directoryMenu.classList.contains('is-hidden')) return;
        if (!elements.directoryPicker.contains(event.target)) {
            closeDirectoryMenu();
        }
    }

    function chooseAssetsDirectory() {
        if (archiveInProgress) {
            setStatus('归档期间不能切换素材目录');
            return;
        }

        closeDirectoryMenu();
        const result = window.cep.fs.showOpenDialogEx(
            false,
            true,
            '选择素材目录',
            CONFIG.assetsDir,
            null
        );
        if (result.data && result.data.length > 0) {
            activateAssetsDirectory(result.data[0]);
        }
    }

    function handleDirectoryHistoryClick(event) {
        const item = event.target.closest('.directory-history-item');
        if (!item || !elements.directoryHistoryList.contains(item)) return;
        activateAssetsDirectory(item.dataset.directoryPath);
    }

    function activateAssetsDirectory(directoryPath) {
        if (archiveInProgress) {
            setStatus('归档期间不能切换素材目录');
            return false;
        }

        const rawDirectory = String(directoryPath || '').trim();
        const nextDirectory = rawDirectory ? path.win32.normalize(rawDirectory) : '';
        if (!nextDirectory || !fs.existsSync(nextDirectory)) {
            CONFIG.recentAssetsDirs = CONFIG.recentAssetsDirs.filter(item => {
                return path.win32.normalize(item).toLowerCase() !== nextDirectory.toLowerCase();
            });
            saveSettings();
            renderDirectoryMenu();
            alert('该素材目录不存在或无法访问');
            setStatus('素材目录切换失败');
            return false;
        }

        const previousDirectory = CONFIG.assetsDir;
        const previousHistory = CONFIG.recentAssetsDirs.slice();
        const directoryChanged = path.win32.normalize(previousDirectory).toLowerCase() !==
            nextDirectory.toLowerCase();

        CONFIG.assetsDir = nextDirectory;
        CONFIG.recentAssetsDirs = DirectoryHistoryUtils.buildDirectoryHistory(
            nextDirectory,
            previousHistory,
            MAX_RECENT_ASSET_DIRECTORIES
        );

        if (!saveSettings()) {
            CONFIG.assetsDir = previousDirectory;
            CONFIG.recentAssetsDirs = previousHistory;
            renderDirectoryMenu();
            alert('素材目录保存失败，请检查文件权限或磁盘状态后重试');
            setStatus('素材目录切换失败');
            return false;
        }

        syncSettingsFields();
        renderDirectoryMenu();
        closeDirectoryMenu();

        if (directoryChanged) {
            lastSnapshot = '';
            loadAssets();
            startAutoRefresh();
        } else {
            setStatus(`当前素材目录：${DirectoryHistoryUtils.getDirectoryDisplayName(nextDirectory)}`);
        }
        return true;
    }

    function syncSettingsFields() {
        if (!elements.settingsClipboardMaxEdge) return;
        elements.settingsClipboardMaxEdge.value = String(CONFIG.clipboardMaxEdge);
    }

    function openSettings() {
        syncSettingsFields();
        elements.settingsOverlay.classList.remove('is-hidden');
        elements.settingsOverlay.setAttribute('aria-hidden', 'false');
        setTimeout(() => elements.settingsClipboardMaxEdge.focus(), 0);
    }

    function closeSettings() {
        if (!elements.settingsOverlay) return;
        elements.settingsOverlay.classList.add('is-hidden');
        elements.settingsOverlay.setAttribute('aria-hidden', 'true');
    }

    function handleSettingsKeyDown(event) {
        if (event.key === 'Escape') {
            closeDirectoryMenu();
            closeRatioMenu();
        }
        if (event.key === 'Escape' &&
            elements.settingsOverlay &&
            !elements.settingsOverlay.classList.contains('is-hidden')) {
            closeSettings();
        }
    }

    function setDirectoryBrowserStatus(message, tone) {
        if (!elements.directoryBrowserStatus) return;
        elements.directoryBrowserStatus.textContent = message;
        if (tone) {
            elements.directoryBrowserStatus.setAttribute('data-tone', tone);
        } else {
            elements.directoryBrowserStatus.removeAttribute('data-tone');
        }
    }

    function setBrowserDirectoryDetectionBusy(busy) {
        browserDirectoryDetectionInProgress = busy;
        const locked = busy || archiveInProgress;
        const controls = [
            elements.directoryMenuBtn,
            elements.directoryChooseBtn,
            elements.directoryUseBrowserDownloadsBtn,
            elements.openFolderBtn,
            elements.settingsBtn
        ];
        controls.forEach(control => {
            if (control) control.disabled = locked;
        });
        if (elements.directoryBrowserButtonLabel) {
            elements.directoryBrowserButtonLabel.textContent = busy
                ? '正在检测...'
                : '使用浏览器下载目录';
        }
    }

    function queryRegistryString(keyPath, valueName) {
        const powerShellScript = `
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$key = Get-Item -LiteralPath $env:HBIRD_REGISTRY_PATH
$valueName = $env:HBIRD_REGISTRY_VALUE
if ($valueName) {
    $value = $key.GetValue(
        $valueName,
        $null,
        [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames
    )
} else {
    $value = $key.GetValue(
        "",
        $null,
        [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames
    )
}
if ($null -eq $value) {
    exit 2
}
[Console]::Out.Write([string]$value)
        `;

        return new Promise(resolve => {
            childProcess.execFile('powershell.exe', [
                '-NoProfile',
                '-NonInteractive',
                '-WindowStyle',
                'Hidden',
                '-Command',
                powerShellScript
            ], {
                windowsHide: true,
                encoding: 'utf8',
                timeout: 5000,
                env: Object.assign({}, process.env, {
                    HBIRD_REGISTRY_PATH: keyPath,
                    HBIRD_REGISTRY_VALUE: valueName || ''
                })
            }, (error, stdout) => {
                if (error) {
                    resolve('');
                    return;
                }
                resolve(String(stdout || '').trim());
            });
        });
    }

    function readTextFile(filePath) {
        return new Promise((resolve, reject) => {
            fs.readFile(filePath, 'utf8', (error, content) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(content);
            });
        });
    }

    function resolveExistingDirectory(directoryPath) {
        if (!directoryPath) return Promise.resolve('');

        const expandedPath = BrowserDownloadUtils.expandEnvironmentVariables(
            directoryPath,
            process.env
        );
        const normalizedPath = path.win32.normalize(expandedPath);

        return new Promise(resolve => {
            fs.stat(normalizedPath, (error, stats) => {
                resolve(!error && stats.isDirectory() ? normalizedPath : '');
            });
        });
    }

    function getBrowserProfileSpec(browserId) {
        const localAppData = process.env.LOCALAPPDATA ||
            path.join(os.homedir(), 'AppData', 'Local');
        const appData = process.env.APPDATA ||
            path.join(os.homedir(), 'AppData', 'Roaming');

        const specs = {
            edge: {
                type: 'chromium',
                root: path.join(localAppData, 'Microsoft', 'Edge', 'User Data')
            },
            chrome: {
                type: 'chromium',
                root: path.join(localAppData, 'Google', 'Chrome', 'User Data')
            },
            brave: {
                type: 'chromium',
                root: path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'User Data')
            },
            vivaldi: {
                type: 'chromium',
                root: path.join(localAppData, 'Vivaldi', 'User Data')
            },
            quark: {
                type: 'chromium',
                root: path.join(localAppData, 'Quark', 'User Data')
            },
            opera: {
                type: 'chromium',
                preferencesFile: path.join(appData, 'Opera Software', 'Opera Stable', 'Preferences')
            },
            firefox: {
                type: 'firefox',
                root: path.join(appData, 'Mozilla', 'Firefox')
            },
            zen: {
                type: 'firefox',
                root: path.join(appData, 'zen')
            }
        };

        return specs[browserId] || null;
    }

    function detectSingleInstalledBrowser() {
        const browsers = [
            { id: 'edge', name: 'Microsoft Edge' },
            { id: 'chrome', name: 'Google Chrome' },
            { id: 'brave', name: 'Brave' },
            { id: 'vivaldi', name: 'Vivaldi' },
            { id: 'quark', name: '夸克浏览器' },
            { id: 'opera', name: 'Opera' },
            { id: 'firefox', name: 'Mozilla Firefox' },
            { id: 'zen', name: 'Zen Browser' }
        ];
        const installed = browsers.filter(browser => {
            const spec = getBrowserProfileSpec(browser.id);
            const probePath = spec.preferencesFile ||
                (spec.type === 'firefox' ? path.join(spec.root, 'profiles.ini') : spec.root);
            return fs.existsSync(probePath);
        });
        return installed.length === 1 ? installed[0] : null;
    }

    function detectDefaultBrowser() {
        const userChoicePath =
            'Registry::HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\Shell\\Associations\\' +
            'UrlAssociations\\https\\UserChoice';

        function identifyBrowserCommand(command) {
            const browser = BrowserDownloadUtils.identifyBrowser(command);
            if (!browser) return null;

            const executablePath = BrowserDownloadUtils.extractExecutablePath(command);
            return Object.assign({}, browser, {
                executablePath,
                installDirectory: executablePath ? path.win32.dirname(executablePath) : ''
            });
        }

        return queryRegistryString(userChoicePath, 'ProgId').then(progId => {
            if (!progId) {
                return queryRegistryString(
                    'Registry::HKEY_CLASSES_ROOT\\https\\shell\\open\\command',
                    null
                ).then(command => {
                    return identifyBrowserCommand(command) || detectSingleInstalledBrowser();
                });
            }

            const commandPath =
                `Registry::HKEY_CLASSES_ROOT\\${progId}\\shell\\open\\command`;
            return queryRegistryString(commandPath, null).then(command => {
                return identifyBrowserCommand(command) || {
                    id: 'unsupported',
                    name: '当前默认浏览器',
                    executablePath: '',
                    installDirectory: ''
                };
            });
        });
    }

    function readChromiumDownloadDirectory(spec) {
        function parsePreferences(content) {
            try {
                JSON.parse(content);
            } catch (error) {
                return {
                    state: 'error',
                    directory: '',
                    reason: '浏览器 Preferences 格式无效'
                };
            }

            const directory = BrowserDownloadUtils.parseChromiumDownloadDirectory(content);
            return {
                state: directory ? 'configured' : 'not-configured',
                directory,
                reason: ''
            };
        }

        if (spec.preferencesFile) {
            return readTextFile(spec.preferencesFile).then(
                parsePreferences,
                () => ({
                    state: 'error',
                    directory: '',
                    reason: '无法读取浏览器 Preferences'
                })
            );
        }

        const localStatePath = path.join(spec.root, 'Local State');
        return readTextFile(localStatePath).then(content => {
            try {
                JSON.parse(content);
            } catch (error) {
                return {
                    state: 'error',
                    profileName: '',
                    reason: '浏览器 Local State 格式无效'
                };
            }
            return {
                state: 'ready',
                profileName: BrowserDownloadUtils.parseChromiumLastUsed(content),
                reason: ''
            };
        }, () => ({
            state: 'error',
            profileName: '',
            reason: '无法读取浏览器 Local State'
        })).then(profileResult => {
            if (profileResult.state === 'error') {
                return {
                    state: 'error',
                    directory: '',
                    reason: profileResult.reason
                };
            }

            const profileName = profileResult.profileName;
            const preferencesPath = path.join(spec.root, profileName, 'Preferences');
            return readTextFile(preferencesPath).then(
                parsePreferences,
                () => ({
                    state: 'error',
                    directory: '',
                    reason: `无法读取浏览器配置 ${profileName}`
                })
            );
        });
    }

    function readFirefoxDownloadDirectory(spec, browser) {
        return readTextFile(path.join(spec.root, 'profiles.ini')).then(profilesIni => {
            return readTextFile(path.join(spec.root, 'installs.ini')).then(
                installsIni => ({ profilesIni, installsIni }),
                () => ({ profilesIni, installsIni: '' })
            );
        }, () => null).then(profileConfig => {
            if (!profileConfig) {
                return {
                    state: 'error',
                    directory: '',
                    reason: '无法读取 Firefox profiles.ini'
                };
            }

            const candidates = BrowserDownloadUtils.listFirefoxProfileCandidates(
                profileConfig.profilesIni,
                profileConfig.installsIni
            );
            return Promise.all(candidates.map(candidate => {
                const candidatePath = candidate.isRelative
                    ? path.win32.resolve(spec.root, candidate.path)
                    : path.win32.normalize(candidate.path);
                return readTextFile(path.join(candidatePath, 'compatibility.ini')).then(
                    content => ({ profilePath: candidate.path, content }),
                    () => ({ profilePath: candidate.path, content: '' })
                );
            })).then(compatibilityFiles => {
                const compatibilityByProfile = {};
                compatibilityFiles.forEach(file => {
                    compatibilityByProfile[file.profilePath] = file.content;
                });
                return BrowserDownloadUtils.parseFirefoxProfilesIni(
                    profileConfig.profilesIni,
                    profileConfig.installsIni,
                    {
                        installDirectory: browser && browser.installDirectory
                            ? browser.installDirectory
                            : '',
                        compatibilityByProfile
                    }
                );
            });
        }).then(profile => {
            if (!profile || profile.state === 'error') {
                if (profile && profile.state === 'error') return profile;
                return {
                    state: 'error',
                    directory: '',
                    reason: 'Firefox 默认 profile 不存在'
                };
            }

            const profilePath = profile.isRelative
                ? path.win32.resolve(spec.root, profile.path)
                : path.win32.normalize(profile.path);
            return readTextFile(path.join(profilePath, 'prefs.js')).then(
                content => {
                    const directory = BrowserDownloadUtils.parseFirefoxDownloadDirectory(content);
                    return {
                        state: directory ? 'configured' : 'not-configured',
                        directory,
                        reason: ''
                    };
                },
                () => ({
                    state: 'error',
                    directory: '',
                    reason: '无法读取 Firefox prefs.js'
                })
            );
        });
    }

    function readBrowserConfiguredDownloadDirectory(browser) {
        if (!browser) {
            return Promise.resolve({
                state: 'error',
                directory: '',
                reason: '未识别 Windows 默认浏览器'
            });
        }
        const spec = getBrowserProfileSpec(browser.id);
        if (!spec) {
            return Promise.resolve({
                state: 'error',
                directory: '',
                reason: `暂不支持 ${browser.name} 配置`
            });
        }

        const configuredResult = spec.type === 'firefox'
            ? readFirefoxDownloadDirectory(spec, browser)
            : readChromiumDownloadDirectory(spec);
        return configuredResult.then(result => {
            if (result.state !== 'configured') return result;
            return resolveExistingDirectory(result.directory).then(existingDirectory => {
                if (existingDirectory) {
                    return {
                        state: 'configured',
                        directory: existingDirectory,
                        reason: ''
                    };
                }
                return {
                    state: 'error',
                    directory: '',
                    reason: '浏览器下载目录不存在或不可访问'
                };
            });
        });
    }

    function readWindowsDownloadsDirectory() {
        const downloadsRegistryKey =
            'Registry::HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\' +
            'Explorer\\User Shell Folders';
        const downloadsKnownFolder = '{374DE290-123F-4565-9164-39C4925E467B}';

        return queryRegistryString(downloadsRegistryKey, downloadsKnownFolder).then(directoryPath => {
            return resolveExistingDirectory(directoryPath);
        }).then(directoryPath => {
            if (directoryPath) return directoryPath;
            return resolveExistingDirectory(path.join(os.homedir(), 'Downloads'));
        });
    }

    function resolveBrowserDownloadDirectory() {
        return detectDefaultBrowser().then(browser => {
            return readBrowserConfiguredDownloadDirectory(browser).then(browserResult => {
                if (browserResult.state === 'configured') {
                    return {
                        directory: browserResult.directory,
                        browserName: browser ? browser.name : '默认浏览器',
                        source: 'browser',
                        fallbackReason: ''
                    };
                }

                return readWindowsDownloadsDirectory().then(systemDirectory => {
                    if (!systemDirectory) {
                        throw new Error('未找到可用的浏览器或 Windows 下载目录');
                    }
                    return {
                        directory: systemDirectory,
                        browserName: browser ? browser.name : '默认浏览器',
                        source: 'windows',
                        fallbackReason: browserResult.state === 'error'
                            ? 'read-error'
                            : 'not-configured',
                        fallbackDetail: browserResult.reason || ''
                    };
                });
            });
        });
    }

    function useBrowserDownloadDirectory() {
        if (browserDirectoryDetectionInProgress) return;

        setBrowserDirectoryDetectionBusy(true);
        setDirectoryBrowserStatus('正在读取默认浏览器配置...', '');

        function finishBrowserDirectoryDetection() {
            setBrowserDirectoryDetectionBusy(false);
        }

        resolveBrowserDownloadDirectory().then(result => {
            let sourceLabel = '浏览器下载目录';
            if (result.source === 'windows' && result.fallbackReason === 'read-error') {
                sourceLabel = `配置读取失败，已回退 Windows 下载目录：${result.fallbackDetail}`;
            } else if (result.source === 'windows') {
                sourceLabel = '未设置自定义路径，使用 Windows 下载目录';
            }
            finishBrowserDirectoryDetection();
            const activated = activateAssetsDirectory(result.directory);
            if (activated) {
                setDirectoryBrowserStatus(
                    `已切换到 ${result.browserName} · ${sourceLabel}`,
                    'success'
                );
                setStatus(`已切换到 ${result.browserName} 下载目录`);
            } else {
                setDirectoryBrowserStatus('目录识别成功，但切换失败，请手动选择。', 'error');
            }
        }, error => {
            console.log('识别浏览器下载目录失败:', error);
            setDirectoryBrowserStatus(
                '识别失败，请使用“选择目录”手动指定。',
                'error'
            );
            setStatus('浏览器下载目录识别失败');
            finishBrowserDirectoryDetection();
        });
    }

    function applySettings() {
        if (browserDirectoryDetectionInProgress) {
            setStatus('请等待浏览器下载目录检测完成');
            return;
        }
        if (archiveInProgress) {
            alert('正在归档图片，请等待归档完成后再保存设置');
            setStatus('归档期间不能修改设置');
            return;
        }

        const rawMaxEdge = Number(elements.settingsClipboardMaxEdge.value);

        if (!Number.isFinite(rawMaxEdge) ||
            rawMaxEdge < MIN_CLIPBOARD_MAX_EDGE ||
            rawMaxEdge > MAX_CLIPBOARD_MAX_EDGE) {
            alert(`最长边分辨率请输入 ${MIN_CLIPBOARD_MAX_EDGE}–${MAX_CLIPBOARD_MAX_EDGE} 之间的数字`);
            elements.settingsClipboardMaxEdge.focus();
            return;
        }

        const previousClipboardMaxEdge = CONFIG.clipboardMaxEdge;
        CONFIG.clipboardMaxEdge = normalizeClipboardMaxEdge(rawMaxEdge);
        if (!saveSettings()) {
            CONFIG.clipboardMaxEdge = previousClipboardMaxEdge;
            syncSettingsFields();
            alert('设置保存失败，请检查文件权限或磁盘状态后重试');
            setStatus('设置保存失败');
            return;
        }
        syncSettingsFields();
        closeSettings();
        setStatus(`设置已保存 · 拷贝最长边 ${CONFIG.clipboardMaxEdge}px`);
    }

    function openAssetsDirectory(directoryPath) {
        const explorerDirectory = path.win32.normalize(directoryPath || CONFIG.assetsDir);
        if (!fs.existsSync(explorerDirectory)) {
            alert('当前素材目录不存在');
            setStatus('无法打开素材目录');
            return;
        }

        childProcess.execFile('explorer.exe', [explorerDirectory], error => {
            if (!error) return;

            if (typeof error.code === 'number') {
                console.log('资源管理器已接收目录请求，退出码:', error.code);
                return;
            }

            console.log('打开素材目录失败:', error);
            setStatus('打开素材目录失败');
        });
        setStatus('已打开当前素材目录');
    }

    // ==================== 素材加载 ====================

    function loadAssets() {
        setStatus('正在扫描...');
        clearSelection();
        lastClickedIndex = -1;
        lastSnapshot = '';
        refreshAssets({ source: 'initial', force: true });
    }

    function scanFolder() {
        setStatus('正在扫描文件夹...');
        refreshAssets({ source: 'manual', force: true });
    }

    function refreshAssets(options) {
        options = options || {};

        if (scanInProgress) {
            if (options.force) {
                pendingRefreshOptions = options;
            }
            return Promise.resolve(false);
        }

        scanInProgress = true;
        const scannedDirectory = CONFIG.assetsDir;

        return scanFolderInternal(scannedDirectory).then(nextAssets => {
            if (scannedDirectory !== CONFIG.assetsDir) {
                return false;
            }

            const nextSnapshot = AssetUtils.createAssetSnapshot(nextAssets);
            const changed = nextSnapshot !== lastSnapshot;

            if (options.force || changed) {
                reconcileAssets(nextAssets);
                lastSnapshot = nextSnapshot;
            }

            updateRefreshStatus(options, changed);
            return changed;
        }, error => {
            console.log('扫描素材目录失败:', error);
            setStatus('扫描失败，请检查素材目录');
            return false;
        }).then(result => {
            finishRefresh();
            return result;
        }, error => {
            finishRefresh();
            throw error;
        });
    }

    function finishRefresh() {
        scanInProgress = false;
        if (!pendingRefreshOptions) return;

        const nextOptions = pendingRefreshOptions;
        pendingRefreshOptions = null;
        setTimeout(() => refreshAssets(nextOptions), 0);
    }

    function updateRefreshStatus(options, changed) {
        const source = options.source;
        if (source === 'auto') {
            if (changed) {
                flashAutoRefreshIndicator();
                setStatus(`共 ${currentAssets.length} 张图片 (自动监听中)`);
            }
            return;
        }

        if (source === 'manual') {
            setStatus(`扫描完成，共 ${currentAssets.length} 张图片`);
        } else if (source === 'delete') {
            setStatus(`成功删除 ${options.deletedCount || 0} 张图片`);
        } else if (source === 'archive') {
            const failureText = options.failedCount > 0 ? `，失败 ${options.failedCount} 张` : '';
            const renameText = options.renamedCount > 0 ? `，自动改名 ${options.renamedCount} 张` : '';
            setStatus(`归档完成：成功 ${options.archivedCount || 0} 张${renameText}${failureText}，保留 ${options.keptCount || 0} 张`);
        } else {
            setStatus(`共 ${currentAssets.length} 张图片 (自动监听中)`);
        }
    }

    function readDirectory(dirPath, subdir) {
        return new Promise(resolve => {
            fs.readdir(dirPath, (error, filenames) => {
                if (error) {
                    if (error.code !== 'ENOENT') {
                        console.log('读取目录失败:', dirPath, error);
                    }
                    resolve([]);
                    return;
                }

                resolve(filenames.map(filename => ({
                    filename,
                    subdir,
                    dirPath
                })));
            });
        });
    }

    function scanFolderInternal(baseDirectory) {
        const directories = [
            { subdir: '', dirPath: baseDirectory }
        ];

        return Promise.all(directories.map(entry => {
            return readDirectory(entry.dirPath, entry.subdir);
        })).then(groups => {
            const candidates = [];
            const seenPaths = new Set();

            groups.forEach(group => {
                group.forEach(entry => {
                    const extension = path.extname(entry.filename).toLowerCase();
                    if (!supportedImageSet.has(extension)) return;

                    const fullPath = path.join(entry.dirPath, entry.filename);
                    if (seenPaths.has(fullPath)) return;
                    seenPaths.add(fullPath);

                    candidates.push({
                        extension,
                        filename: entry.subdir ? `${entry.subdir}/${entry.filename}` : entry.filename,
                        fullPath
                    });
                });
            });

            return AssetUtils.mapLimit(candidates, CONFIG.scanConcurrency, statAssetCandidate);
        }).then(results => {
            return results.filter(Boolean).sort((a, b) => b.sortTime - a.sortTime);
        });
    }

    function statAssetCandidate(candidate) {
        return new Promise(resolve => {
            fs.stat(candidate.fullPath, (error, stat) => {
                if (error || !stat.isFile()) {
                    resolve(null);
                    return;
                }

                const mtimeMs = typeof stat.mtimeMs === 'number' ? stat.mtimeMs : stat.mtime.getTime();
                const birthtimeMs = typeof stat.birthtimeMs === 'number'
                    ? stat.birthtimeMs
                    : stat.birthtime.getTime();

                resolve({
                    id: candidate.fullPath,
                    type: 'image',
                    filename: candidate.filename,
                    fullPath: candidate.fullPath,
                    size: stat.size,
                    mtimeMs,
                    createdAt: stat.birthtime.toISOString(),
                    sortTime: birthtimeMs || mtimeMs
                });
            });
        });
    }

    // ==================== 增量渲染 ====================

    function reconcileAssets(nextAssets) {
        const grid = elements.assetsGrid;
        const diff = AssetUtils.diffAssets(currentAssets, nextAssets);

        if (diff.added.length || diff.removed.length || diff.updated.length) {
            lastClickedIndex = -1;
        }

        diff.removed.forEach(asset => {
            removeAssetCard(asset.fullPath);
            selectedAssets.delete(asset.id);
        });

        diff.updated.forEach(asset => {
            removeAssetCard(asset.fullPath);
        });

        currentAssets = nextAssets;
        filteredAssets = nextAssets;
        assetById = new Map(nextAssets.map(asset => [asset.id, asset]));

        removeEmptyState();

        if (nextAssets.length === 0) {
            showEmptyState();
            lastClickedIndex = -1;
            updateSelectionCount();
            return;
        }

        nextAssets.forEach((asset, index) => {
            let card = assetCards.get(asset.fullPath);
            const isNewCard = !card;

            if (!card) {
                card = createAssetCard(asset);
                assetCards.set(asset.fullPath, card);
            }

            card.dataset.index = String(index);
            card.classList.toggle('selected', selectedAssets.has(asset.id));
            grid.appendChild(card);

            if (isNewCard) {
                observeThumbnail(card, asset);
            }
        });

        if (lastClickedIndex >= nextAssets.length) {
            lastClickedIndex = -1;
        }

        updateSelectionCount();
        scheduleFallbackVisibilityCheck();
    }

    function removeAssetCard(fullPath) {
        const card = assetCards.get(fullPath);
        if (!card) return;

        unobserveThumbnail(card);
        releaseThumbnail(card);
        if (card.parentNode) {
            card.parentNode.removeChild(card);
        }
        assetCards.delete(fullPath);
    }

    function removeEmptyState() {
        const emptyState = elements.assetsGrid.querySelector('.empty-state');
        if (emptyState && emptyState.parentNode) {
            emptyState.parentNode.removeChild(emptyState);
        }
    }

    function showEmptyState() {
        if (elements.assetsGrid.querySelector('.empty-state')) return;

        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';

        const title = document.createElement('p');
        title.textContent = '暂无图片';

        const hint = document.createElement('p');
        hint.className = 'hint';
            hint.textContent = '点击右上角刷新图标或放入图片';

        emptyState.appendChild(title);
        emptyState.appendChild(hint);
        elements.assetsGrid.appendChild(emptyState);
    }

    function createAssetCard(asset) {
        const card = document.createElement('div');
        card.className = 'asset-card';
        card.dataset.assetId = asset.id;
        card.dataset.thumbnailState = 'idle';
        card.dataset.thumbnailVisible = '0';

        if (selectedAssets.has(asset.id)) {
            card.classList.add('selected');
        }

        const extension = path.extname(asset.fullPath);
        const displayName = path.basename(asset.fullPath, extension);
        const truncatedName = displayName.length > 15
            ? displayName.substring(0, 15) + '...'
            : displayName;

        card.appendChild(createThumbnailPlaceholder());

        const checkbox = document.createElement('div');
        checkbox.className = 'checkbox';
        card.appendChild(checkbox);

        const info = document.createElement('div');
        info.className = 'info';

        const name = document.createElement('div');
        name.className = 'name';
        name.title = displayName;
        name.textContent = truncatedName;
        info.appendChild(name);

        const meta = document.createElement('div');
        meta.className = 'meta';
        meta.textContent = formatSize(asset.size);
        info.appendChild(meta);

        card.appendChild(info);
        return card;
    }

    function createThumbnailPlaceholder() {
        const placeholder = document.createElement('div');
        placeholder.className = 'thumbnail-placeholder';
        placeholder.textContent = '🖼️';
        return placeholder;
    }

    // ==================== 缩略图懒加载 ====================

    function setupThumbnailVisibility() {
        if (typeof window.IntersectionObserver === 'function') {
            thumbnailObserver = new IntersectionObserver(entries => {
                entries.forEach(entry => {
                    const card = entry.target;
                    const asset = assetById.get(card.dataset.assetId);
                    if (asset) {
                        setCardThumbnailVisibility(card, asset, entry.isIntersecting);
                    }
                });
            }, {
                root: elements.assetsContainer,
                rootMargin: `${CONFIG.lazyLoadMargin}px 0px`,
                threshold: 0.01
            });
            return;
        }

        elements.assetsContainer.addEventListener('scroll', scheduleFallbackVisibilityCheck);
        window.addEventListener('resize', scheduleFallbackVisibilityCheck);
    }

    function observeThumbnail(card, asset) {
        if (thumbnailObserver) {
            thumbnailObserver.observe(card);
        } else {
            fallbackLazyCards.add(card);
            scheduleFallbackVisibilityCheck();
        }
    }

    function unobserveThumbnail(card) {
        if (thumbnailObserver) {
            thumbnailObserver.unobserve(card);
        }
        fallbackLazyCards.delete(card);
    }

    function setCardThumbnailVisibility(card, asset, visible) {
        card.dataset.thumbnailVisible = visible ? '1' : '0';
        if (visible) {
            loadThumbnail(card, asset);
        } else {
            releaseThumbnail(card);
        }
    }

    function scheduleFallbackVisibilityCheck() {
        if (thumbnailObserver || fallbackCheckScheduled) return;
        fallbackCheckScheduled = true;

        const schedule = window.requestAnimationFrame || function(callback) {
            return setTimeout(callback, 16);
        };

        schedule(runFallbackVisibilityCheck);
    }

    function runFallbackVisibilityCheck() {
        fallbackCheckScheduled = false;
        const rootRect = elements.assetsContainer.getBoundingClientRect();
        const margin = CONFIG.lazyLoadMargin;

        fallbackLazyCards.forEach(card => {
            if (!document.documentElement.contains(card)) {
                fallbackLazyCards.delete(card);
                return;
            }

            const rect = card.getBoundingClientRect();
            const visible = rect.bottom >= rootRect.top - margin && rect.top <= rootRect.bottom + margin;
            const asset = assetById.get(card.dataset.assetId);
            if (asset) {
                setCardThumbnailVisibility(card, asset, visible);
            }
        });
    }

    function loadThumbnail(card, asset) {
        const state = card.dataset.thumbnailState;
        if (state !== 'idle') return;

        const mimeType = AssetUtils.getImageMimeType(asset.fullPath);
        if (!mimeType || asset.size > CONFIG.maxThumbnailFileSize) {
            card.dataset.thumbnailState = 'unavailable';
            return;
        }

        card.dataset.thumbnailState = 'queued';
        thumbnailQueue.add(() => {
            if (!document.documentElement.contains(card) || card.dataset.thumbnailVisible !== '1') {
                return null;
            }

            card.dataset.thumbnailState = 'loading';
            return getImageDataUrl(asset.fullPath, mimeType);
        }).then(dataUrl => {
            if (!dataUrl || !document.documentElement.contains(card) || card.dataset.thumbnailVisible !== '1') {
                card.dataset.thumbnailState = 'idle';
                return;
            }

            const placeholder = card.querySelector('.thumbnail-placeholder');
            if (!placeholder) {
                card.dataset.thumbnailState = 'idle';
                return;
            }

            const img = document.createElement('img');
            img.className = 'thumbnail';
            img.alt = path.basename(asset.fullPath);
            img.loading = 'lazy';
            img.onerror = function() {
                if (img.parentNode) {
                    img.parentNode.replaceChild(createThumbnailPlaceholder(), img);
                }
                card.dataset.thumbnailState = 'unavailable';
            };
            img.src = dataUrl;
            placeholder.parentNode.replaceChild(img, placeholder);
            card.dataset.thumbnailState = 'loaded';
        }, error => {
            console.log('加载缩略图失败:', asset.fullPath, error);
            card.dataset.thumbnailState = 'idle';
        });
    }

    function releaseThumbnail(card) {
        if (card.dataset.thumbnailState !== 'loaded') return;

        const img = card.querySelector('img.thumbnail');
        if (img && img.parentNode) {
            img.removeAttribute('src');
            img.parentNode.replaceChild(createThumbnailPlaceholder(), img);
        }
        card.dataset.thumbnailState = 'idle';
    }

    function getImageDataUrl(filePath, mimeType) {
        return new Promise(resolve => {
            fs.readFile(filePath, (error, buffer) => {
                if (error) {
                    resolve(null);
                    return;
                }

                resolve(`data:${mimeType};base64,${buffer.toString('base64')}`);
            });
        });
    }

    // ==================== 网格事件 ====================

    function findAssetCard(target) {
        let node = target;
        while (node && node !== elements.assetsGrid) {
            if (node.classList && node.classList.contains('asset-card')) {
                return node;
            }
            node = node.parentNode;
        }
        return null;
    }

    function handleGridClick(event) {
        const card = findAssetCard(event.target);
        if (!card) return;

        const asset = assetById.get(card.dataset.assetId);
        const index = Number(card.dataset.index);
        if (!asset || !Number.isFinite(index)) return;

        handleCardClick(asset, card, index, event);
    }

    function handleGridDoubleClick(event) {
        const card = findAssetCard(event.target);
        if (!card) return;

        const asset = assetById.get(card.dataset.assetId);
        if (!asset) return;

        clearSelection();
        selectedAssets.add(asset.id);
        card.classList.add('selected');
        updateSelectionCount();
        importToPS('open');
    }

    function handleCardClick(asset, card, index, event) {
        if (event.shiftKey && lastClickedIndex !== -1) {
            const start = Math.min(lastClickedIndex, index);
            const end = Math.max(lastClickedIndex, index);

            if (!event.ctrlKey && !event.metaKey) {
                clearSelection();
            }

            for (let i = start; i <= end; i++) {
                const rangeAsset = filteredAssets[i];
                selectedAssets.add(rangeAsset.id);
                const rangeCard = assetCards.get(rangeAsset.fullPath);
                if (rangeCard) {
                    rangeCard.classList.add('selected');
                }
            }
        } else if (event.ctrlKey || event.metaKey) {
            toggleSelection(asset, card);
            lastClickedIndex = index;
        } else {
            clearSelection();
            toggleSelection(asset, card);
            lastClickedIndex = index;
        }

        updateSelectionCount();
    }

    function formatSize(bytes) {
        if (!bytes) return '-';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    // ==================== 选择管理 ====================

    function toggleSelection(asset, card) {
        if (selectedAssets.has(asset.id)) {
            selectedAssets.delete(asset.id);
            card.classList.remove('selected');
        } else {
            selectedAssets.add(asset.id);
            card.classList.add('selected');
        }
        updateSelectionCount();
    }

    function clearSelection() {
        selectedAssets.forEach(assetId => {
            const asset = assetById.get(assetId);
            const card = asset ? assetCards.get(asset.fullPath) : null;
            if (card) {
                card.classList.remove('selected');
            }
        });
        selectedAssets.clear();
        updateSelectionCount();
    }

    function updateSelectionCount() {
        if (elements.selectionCount) {
            elements.selectionCount.textContent = `已选择 ${selectedAssets.size} 个`;
        }
    }

    // ==================== 一键归档 ====================

    function archiveOldImages() {
        if (archiveInProgress) return;
        if (scanInProgress) {
            setStatus('正在扫描，请稍后再归档');
            return;
        }

        archiveInProgress = true;
        setArchiveBusy(true);
        setStatus('正在计算归档计划...');

        const archiveRoot = path.resolve(CONFIG.assetsDir);
        scanFolderInternal(archiveRoot).then(assets => {
            const archivePlan = AssetUtils.buildArchivePlan(assets, CONFIG.archiveKeepCount);
            if (archivePlan.archive.length === 0) {
                setStatus(`当前共 ${assets.length} 张图片，无需归档`);
                return null;
            }

            const movePlan = buildArchiveMovePlan(archivePlan.archive, archiveRoot);
            const confirmed = confirm(buildArchiveConfirmation(assets.length, archivePlan, movePlan));
            if (!confirmed) {
                setStatus('已取消归档');
                return null;
            }

            clearSelection();
            setStatus(`正在归档 ${movePlan.length} 张图片...`);

            return ensureArchiveDirectories(movePlan).then(() => {
                return moveArchiveFiles(movePlan);
            }).then(results => {
                const archivedCount = results.filter(result => result.success).length;
                const failedCount = results.length - archivedCount;
                const renamedCount = results.filter(result => {
                    return result.success && result.item.renamedForCollision;
                }).length;

                results.filter(result => !result.success).forEach(result => {
                    console.log('归档图片失败:', result.item.asset.fullPath, result.error);
                });

                lastSnapshot = '';
                return refreshAssets({
                    source: 'archive',
                    force: true,
                    archivedCount,
                    failedCount,
                    renamedCount,
                    keptCount: archivePlan.kept.length
                });
            });
        }).then(() => {
            finishArchive();
        }, error => {
            console.log('一键归档失败:', error);
            alert('一键归档失败，请查看状态栏或调试日志');
            setStatus('一键归档失败');
            finishArchive();
        });
    }

    function buildArchiveMovePlan(archiveAssets, archiveRoot) {
        const rootPath = path.resolve(archiveRoot);
        const rootKey = rootPath.toLowerCase();
        const reservedNamesByDirectory = new Map();

        return archiveAssets.map(asset => {
            const targetDir = path.resolve(rootPath, asset.archiveFolderName);
            if (path.dirname(targetDir).toLowerCase() !== rootKey) {
                throw new Error(`归档目标越界: ${targetDir}`);
            }

            const directoryKey = targetDir.toLowerCase();
            if (!reservedNamesByDirectory.has(directoryKey)) {
                reservedNamesByDirectory.set(directoryKey, new Set());
            }
            const reservedNames = reservedNamesByDirectory.get(directoryKey);
            const originalName = path.basename(asset.fullPath);
            const targetName = AssetUtils.createUniqueArchiveFileName(
                originalName,
                asset.mtimeMs,
                candidateName => {
                    return reservedNames.has(candidateName.toLowerCase()) ||
                        fs.existsSync(path.join(targetDir, candidateName));
                }
            );
            reservedNames.add(targetName.toLowerCase());

            return {
                asset,
                targetDir,
                targetPath: path.join(targetDir, targetName),
                renamedForCollision: targetName !== originalName
            };
        });
    }

    function buildArchiveConfirmation(totalCount, archivePlan, movePlan) {
        const folderCounts = new Map();
        movePlan.forEach(item => {
            const folderName = path.basename(item.targetDir);
            folderCounts.set(folderName, (folderCounts.get(folderName) || 0) + 1);
        });

        const folderLines = Array.from(folderCounts.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(entry => `${entry[0]}：${entry[1]} 张`)
            .join('\n');
        const renamedCount = movePlan.filter(item => item.renamedForCollision).length;

        return [
            '一键归档预览',
            '',
            `当前图片：${totalCount} 张`,
            `保留最新：${archivePlan.kept.length} 张`,
            `准备归档：${archivePlan.archive.length} 张`,
            `同名自动改名：${renamedCount} 张`,
            '',
            folderLines,
            '',
            '归档图片将从插件面板中消失，是否继续？'
        ].join('\n');
    }

    function ensureArchiveDirectories(movePlan) {
        const directories = Array.from(new Set(movePlan.map(item => item.targetDir)));
        return AssetUtils.mapLimit(directories, CONFIG.archiveMoveConcurrency, directory => {
            return new Promise((resolve, reject) => {
                fs.mkdir(directory, error => {
                    if (error && error.code !== 'EEXIST') {
                        reject(error);
                        return;
                    }
                    resolve();
                });
            });
        });
    }

    function moveArchiveFiles(movePlan) {
        return AssetUtils.mapLimit(movePlan, CONFIG.archiveMoveConcurrency, item => {
            return new Promise(resolve => {
                fs.rename(item.asset.fullPath, item.targetPath, error => {
                    resolve({ item, success: !error, error: error || null });
                });
            });
        });
    }

    function setArchiveBusy(busy) {
        const controls = [
            elements.directoryMenuBtn,
            elements.directoryChooseBtn,
            elements.directoryUseBrowserDownloadsBtn,
            elements.settingsBtn,
            elements.saveSettingsBtn,
            elements.openFolderBtn,
            elements.refreshBtn,
            elements.archiveBtn,
            elements.deleteBtn,
            elements.openNewBtn,
            elements.placeLayerBtn,
            elements.smartObjectBtn
        ];
        controls.forEach(control => {
            if (control) control.disabled = busy;
        });

        if (elements.archiveBtn) {
            elements.archiveBtn.textContent = busy ? '📦 归档中...' : '📦 一键归档';
            elements.archiveBtn.setAttribute('aria-busy', busy ? 'true' : 'false');
        }
    }

    function finishArchive() {
        archiveInProgress = false;
        setArchiveBusy(false);
    }

    // ==================== 删除功能 ====================

    function deleteSelectedAssets() {
        if (selectedAssets.size === 0) {
            alert('请先选择要删除的图片');
            return;
        }

        const count = selectedAssets.size;
        if (!confirm(`确定要删除选中的 ${count} 张图片吗？\n\n此操作无法撤销！`)) {
            return;
        }

        let successCount = 0;
        currentAssets.forEach(asset => {
            if (selectedAssets.has(asset.id)) {
                try {
                    if (fs.existsSync(asset.fullPath)) {
                        fs.unlinkSync(asset.fullPath);
                        successCount++;
                    }
                } catch(error) {
                    console.log('删除图片失败:', asset.fullPath, error);
                }
            }
        });

        selectedAssets.clear();
        lastClickedIndex = -1;
        setStatus(`正在更新，已删除 ${successCount} 张图片...`);
        refreshAssets({ source: 'delete', force: true, deletedCount: successCount });
    }

    // ==================== PS 导入功能 ====================

    const extendScriptStringifyHelper = String.raw`
        function stringifyResponse(value) {
            function escapeString(text) {
                return String(text)
                    .replace(/\\/g, "\\\\")
                    .replace(/"/g, '\\"')
                    .replace(/\r/g, "\\r")
                    .replace(/\n/g, "\\n");
            }

            var parts = [];
            for (var key in value) {
                if (!value.hasOwnProperty(key)) continue;
                var item = value[key];
                var encoded;

                if (typeof item === "string") {
                    encoded = '"' + escapeString(item) + '"';
                } else if (typeof item === "number" || typeof item === "boolean") {
                    encoded = String(item);
                } else if (item === null) {
                    encoded = "null";
                } else {
                    encoded = '"' + escapeString(item) + '"';
                }

                parts.push('"' + escapeString(key) + '":' + encoded);
            }

            return "{" + parts.join(",") + "}";
        }
    `;

    function cleanupTemporaryClipboardFile(imagePath) {
        if (!imagePath) return;
        fs.unlink(imagePath, error => {
            if (error && error.code !== 'ENOENT') {
                console.log('删除临时剪贴板图片失败:', imagePath, error);
            }
        });
    }

    function writeImageFileToWindowsClipboard(imagePath, callback) {
        const powerShellScript = `
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System.Runtime.InteropServices;
public static class HbirdClipboardNative {
    [DllImport("user32.dll")]
    public static extern uint GetClipboardSequenceNumber();
}
'@

$imagePath = $env:HBIRD_CLIPBOARD_IMAGE
if (-not $imagePath -or -not [System.IO.File]::Exists($imagePath)) {
    throw "Clipboard image file not found"
}

$pngStream = $null
$sourceImage = $null
$bitmap = $null
$beforeSequence = [HbirdClipboardNative]::GetClipboardSequenceNumber()

try {
    $pngBytes = [System.IO.File]::ReadAllBytes($imagePath)
    $pngStream = [System.IO.MemoryStream]::new($pngBytes)
    $sourceImage = [System.Drawing.Image]::FromStream($pngStream)
    $bitmap = New-Object System.Drawing.Bitmap -ArgumentList $sourceImage
    $pngStream.Position = 0

    $dataObject = New-Object System.Windows.Forms.DataObject
    $dataObject.SetData([System.Windows.Forms.DataFormats]::Bitmap, $true, $bitmap)
    $dataObject.SetData("PNG", $false, $pngStream)
    [System.Windows.Forms.Clipboard]::SetDataObject($dataObject, $true, 10, 100)

    $afterSequence = [HbirdClipboardNative]::GetClipboardSequenceNumber()
    $hasImage = [System.Windows.Forms.Clipboard]::ContainsImage()
    $hasPng = [System.Windows.Forms.Clipboard]::ContainsData("PNG")
    if ($afterSequence -eq $beforeSequence -or (-not $hasImage -and -not $hasPng)) {
        throw "Clipboard verification failed"
    }

    Write-Output "HBIRD_WINDOWS_CLIPBOARD_IMAGE_READY"
} finally {
    if ($bitmap) { $bitmap.Dispose() }
    if ($sourceImage) { $sourceImage.Dispose() }
    if ($pngStream) { $pngStream.Dispose() }
}
        `;

        childProcess.execFile('powershell.exe', [
            '-NoProfile',
            '-NonInteractive',
            '-STA',
            '-WindowStyle',
            'Hidden',
            '-Command',
            powerShellScript
        ], {
            env: Object.assign({}, process.env, {
                HBIRD_CLIPBOARD_IMAGE: path.win32.normalize(imagePath)
            }),
            windowsHide: true,
            timeout: 15000,
            encoding: 'utf8'
        }, (error, stdout, stderr) => {
            cleanupTemporaryClipboardFile(imagePath);

            const output = String(stdout || '');
            if (error || !output.includes('HBIRD_WINDOWS_CLIPBOARD_IMAGE_READY')) {
                console.log('Windows 剪贴板直写失败:', {
                    error: error && error.message,
                    stderr: String(stderr || '').slice(0, 500)
                });
                callback(new Error('系统剪贴板写入失败，请稍后重试'));
                return;
            }

            callback(null);
        });
    }

    function copyCurrentSelection() {
        setStatus('正在拷贝当前选区...');
        const tempFilePath = path.join(
            os.tmpdir(),
            `HbirdBridge_clipboard_${Date.now()}_${Math.random().toString(36).slice(2)}.png`
        );
        const photoshopTempFilePath = tempFilePath.replace(/\\/g, '/');

        const script = `
            (function() {
                ${extendScriptStringifyHelper}
                var doc = null;
                var originalHistoryState = null;
                var stampLayer = null;
                var selectionLayer = null;
                var tempDocument = null;
                var exportFile = null;
                var clipboardMaxEdge = ${CONFIG.clipboardMaxEdge};
                var tempFilePath = ${JSON.stringify(photoshopTempFilePath)};
                var optimized = false;
                var outputWidth = 0;
                var outputHeight = 0;

                try {
                    if (app.documents.length === 0) {
                        return stringifyResponse({
                            success: false,
                            error: "请先打开一个包含选区的文档"
                        });
                    }

                    doc = app.activeDocument;

                    try {
                        var selectionBounds = doc.selection.bounds;
                        if (!selectionBounds || selectionBounds.length !== 4) {
                            throw new Error("无有效选区");
                        }
                    } catch(selectionError) {
                        return stringifyResponse({
                            success: false,
                            error: "当前没有有效的框选选区"
                        });
                    }

                    originalHistoryState = doc.activeHistoryState;
                    var selectionLeft = selectionBounds[0].as("px");
                    var selectionTop = selectionBounds[1].as("px");
                    var selectionWidth = Math.max(
                        1,
                        Math.round(selectionBounds[2].as("px") - selectionLeft)
                    );
                    var selectionHeight = Math.max(
                        1,
                        Math.round(selectionBounds[3].as("px") - selectionTop)
                    );

                    var mergeDescriptor = new ActionDescriptor();
                    mergeDescriptor.putBoolean(charIDToTypeID("Dplc"), true);
                    executeAction(charIDToTypeID("MrgV"), mergeDescriptor, DialogModes.NO);

                    stampLayer = doc.activeLayer;
                    stampLayer.name = "Hbird Bridge 临时盖印";

                    executeAction(
                        stringIDToTypeID("copyToLayer"),
                        undefined,
                        DialogModes.NO
                    );

                    selectionLayer = doc.activeLayer;
                    if (!selectionLayer || selectionLayer === stampLayer) {
                        throw new Error("无法从当前选区创建新图层");
                    }

                    selectionLayer.name = "选区拷贝";
                    var sourceLayerBounds = selectionLayer.bounds;
                    var desiredContentLeft = sourceLayerBounds[0].as("px") - selectionLeft;
                    var desiredContentTop = sourceLayerBounds[1].as("px") - selectionTop;
                    stampLayer.remove();
                    stampLayer = null;
                    doc.activeLayer = selectionLayer;

                    tempDocument = app.documents.add(
                        UnitValue(selectionWidth, "px"),
                        UnitValue(selectionHeight, "px"),
                        doc.resolution,
                        "Hbird Bridge Clipboard",
                        NewDocumentMode.RGB,
                        DocumentFill.TRANSPARENT
                    );

                    app.activeDocument = doc;
                    var exportLayer = selectionLayer.duplicate(
                        tempDocument,
                        ElementPlacement.PLACEATBEGINNING
                    );
                    app.activeDocument = tempDocument;
                    tempDocument.activeLayer = exportLayer;
                    var exportLayerBounds = exportLayer.bounds;
                    exportLayer.translate(
                        UnitValue(
                            desiredContentLeft - exportLayerBounds[0].as("px"),
                            "px"
                        ),
                        UnitValue(
                            desiredContentTop - exportLayerBounds[1].as("px"),
                            "px"
                        )
                    );

                    outputWidth = selectionWidth;
                    outputHeight = selectionHeight;
                    var longestEdge = Math.max(selectionWidth, selectionHeight);
                    if (longestEdge > clipboardMaxEdge) {
                        executeAction(
                            stringIDToTypeID("newPlacedLayer"),
                            undefined,
                            DialogModes.NO
                        );

                        var resizeRatio = clipboardMaxEdge / longestEdge;
                        outputWidth = Math.max(1, Math.round(selectionWidth * resizeRatio));
                        outputHeight = Math.max(1, Math.round(selectionHeight * resizeRatio));
                        tempDocument.resizeImage(
                            UnitValue(outputWidth, "px"),
                            UnitValue(outputHeight, "px"),
                            tempDocument.resolution,
                            ResampleMethod.BICUBICSHARPER
                        );
                        optimized = true;
                    }

                    exportFile = new File(tempFilePath);
                    if (exportFile.exists) {
                        exportFile.remove();
                    }
                    var pngOptions = new PNGSaveOptions();
                    pngOptions.interlaced = false;
                    tempDocument.saveAs(exportFile, pngOptions, true, Extension.LOWERCASE);
                    if (!exportFile.exists) {
                        throw new Error("临时 PNG 导出失败");
                    }

                    tempDocument.close(SaveOptions.DONOTSAVECHANGES);
                    tempDocument = null;
                    app.activeDocument = doc;
                    doc.activeLayer = selectionLayer;

                    return stringifyResponse({
                        success: true,
                        layerName: selectionLayer.name,
                        tempFilePath: tempFilePath,
                        optimized: optimized,
                        originalWidth: selectionWidth,
                        originalHeight: selectionHeight,
                        outputWidth: outputWidth,
                        outputHeight: outputHeight
                    });
                } catch(error) {
                    try {
                        if (tempDocument) {
                            app.activeDocument = tempDocument;
                            tempDocument.close(SaveOptions.DONOTSAVECHANGES);
                        }
                    } catch(closeTempError) {}

                    try {
                        if (exportFile && exportFile.exists) {
                            exportFile.remove();
                        }
                    } catch(removeTempError) {}

                    try {
                        if (doc && originalHistoryState) {
                            app.activeDocument = doc;
                            doc.activeHistoryState = originalHistoryState;
                        }
                    } catch(rollbackError) {}

                    return stringifyResponse({
                        success: false,
                        error: "拷贝当前选区失败：" + error.message
                    });
                }
            })();
        `;

        csInterface.evalScript(script, result => {
            try {
                const response = JSON.parse(result);
                if (response.success) {
                    setStatus('正在写入 Windows 剪贴板...');
                    writeImageFileToWindowsClipboard(response.tempFilePath, error => {
                        if (!error) {
                            const optimizationNote = response.optimized
                                ? ` · 已优化至 ${response.outputWidth}×${response.outputHeight}`
                                : '';
                            setStatus(`选区已生成新图层并拷贝到 Windows 剪贴板${optimizationNote}`);
                            return;
                        }

                        console.log('Windows 剪贴板复制失败:', error);
                        alert('选区图层已生成，但 Windows 剪贴板复制失败：' + error.message);
                        setStatus('选区已生成，但 Windows 剪贴板复制失败');
                    });
                } else {
                    cleanupTemporaryClipboardFile(tempFilePath);
                    alert(response.error || '拷贝当前选区失败');
                    setStatus('拷贝当前选区失败');
                }
            } catch(error) {
                cleanupTemporaryClipboardFile(tempFilePath);
                const rawResult = String(result || '无返回值').slice(0, 160);
                console.log('拷贝选区脚本返回异常:', rawResult, error);
                setStatus(`拷贝当前选区失败：${rawResult}`);
            }
        });
    }

    function importToPS(mode) {
        if (selectedAssets.size === 0) {
            alert('请先选择要导入的图片');
            return;
        }

        if (mode === 'smartObject' && selectedAssets.size !== 1) {
            alert('智能对象导入每次只能选择一张图片');
            return;
        }

        const assetsToImport = currentAssets.filter(asset => selectedAssets.has(asset.id));
        setStatus(mode === 'smartObject' ? '正在智能对象导入...' : '正在导入...');

        const filePaths = assetsToImport.map(asset => asset.fullPath.replace(/\\/g, '/'));
        let script = '';

        if (mode === 'open') {
            script = `
                (function() {
                    ${extendScriptStringifyHelper}
                    var filePaths = ${JSON.stringify(filePaths)};
                    var successCount = 0;
                    var failCount = 0;

                    for (var i = 0; i < filePaths.length; i++) {
                        try {
                            var file = new File(filePaths[i]);
                            if (file.exists) {
                                app.open(file);
                                successCount++;
                            } else {
                                failCount++;
                            }
                        } catch(e) {
                            failCount++;
                        }
                    }

                    return stringifyResponse({ success: true, imported: successCount, failed: failCount });
                })();
            `;
        } else if (mode === 'place') {
            script = `
                (function() {
                    ${extendScriptStringifyHelper}
                    var filePaths = ${JSON.stringify(filePaths)};
                    var successCount = 0;
                    var failCount = 0;

                    if (app.documents.length === 0) {
                        return stringifyResponse({ success: false, error: "请先打开或新建一个文档" });
                    }

                    var doc = app.activeDocument;

                    for (var i = 0; i < filePaths.length; i++) {
                        try {
                            var file = new File(filePaths[i]);
                            if (file.exists) {
                                var desc = new ActionDescriptor();
                                desc.putPath(charIDToTypeID("null"), file);
                                desc.putEnumerated(charIDToTypeID("FTcs"), charIDToTypeID("QCSt"), charIDToTypeID("Qcsa"));
                                var offsetDesc = new ActionDescriptor();
                                offsetDesc.putUnitDouble(charIDToTypeID("Hrzn"), charIDToTypeID("#Pxl"), 0);
                                offsetDesc.putUnitDouble(charIDToTypeID("Vrtc"), charIDToTypeID("#Pxl"), 0);
                                desc.putObject(charIDToTypeID("Ofst"), charIDToTypeID("Ofst"), offsetDesc);
                                executeAction(charIDToTypeID("Plc "), desc, DialogModes.NO);

                                try {
                                    var confirmDesc = new ActionDescriptor();
                                    executeAction(charIDToTypeID("Plc "), confirmDesc, DialogModes.NO);
                                } catch(e) {}

                                if (doc.activeLayer.typename === "ArtLayer" &&
                                    doc.activeLayer.kind === LayerKind.SMARTOBJECT) {
                                    doc.activeLayer.rasterize(RasterizeType.ENTIRELAYER);
                                }

                                successCount++;
                            } else {
                                failCount++;
                            }
                        } catch(e) {
                            failCount++;
                        }
                    }

                    return stringifyResponse({ success: true, imported: successCount, failed: failCount });
                })();
            `;
        } else if (mode === 'smartObject') {
            script = `
                (function() {
                    ${extendScriptStringifyHelper}
                    try {
                        return (function() {
                            var sourceFile = new File(${JSON.stringify(filePaths[0])});
                            if (!sourceFile.exists) {
                                return stringifyResponse({ success: false, error: "所选素材文件不存在" });
                            }

                            if (app.documents.length === 0) {
                                return stringifyResponse({ success: false, error: "请先打开包含待替换图层的文档" });
                            }

                            var parentDocument = app.activeDocument;
                            var originalLayer = parentDocument.activeLayer;
                            var originalLayerName = originalLayer.name;
                            var originalHistoryState = parentDocument.activeHistoryState;
                            var smartDocument = null;

                            try {
                                var isSmartObject = originalLayer.typename === "ArtLayer" &&
                                    originalLayer.kind === LayerKind.SMARTOBJECT;

                        if (!isSmartObject) {
                            executeAction(stringIDToTypeID("newPlacedLayer"), undefined, DialogModes.NO);
                            parentDocument.activeLayer.name = originalLayerName;
                        }

                        var targetSmartLayer = parentDocument.activeLayer;
                        executeAction(stringIDToTypeID("placedLayerEditContents"), undefined, DialogModes.NO);
                        smartDocument = app.activeDocument;

                        if (smartDocument === parentDocument) {
                            throw new Error("无法打开智能对象内容");
                        }

                        var canvasWidth = smartDocument.width.as("px");
                        var canvasHeight = smartDocument.height.as("px");
                        var originalLayers = [];
                        var i;

                        for (i = 0; i < smartDocument.layers.length; i++) {
                            originalLayers.push(smartDocument.layers[i]);
                        }

                        var placeDescriptor = new ActionDescriptor();
                        placeDescriptor.putPath(charIDToTypeID("null"), sourceFile);
                        placeDescriptor.putEnumerated(
                            charIDToTypeID("FTcs"),
                            charIDToTypeID("QCSt"),
                            charIDToTypeID("Qcsa")
                        );
                        var offsetDescriptor = new ActionDescriptor();
                        offsetDescriptor.putUnitDouble(
                            charIDToTypeID("Hrzn"),
                            charIDToTypeID("#Pxl"),
                            0
                        );
                        offsetDescriptor.putUnitDouble(
                            charIDToTypeID("Vrtc"),
                            charIDToTypeID("#Pxl"),
                            0
                        );
                        placeDescriptor.putObject(
                            charIDToTypeID("Ofst"),
                            charIDToTypeID("Ofst"),
                            offsetDescriptor
                        );
                        executeAction(charIDToTypeID("Plc "), placeDescriptor, DialogModes.NO);

                        var layer = smartDocument.activeLayer;
                        var bounds = layer.bounds;
                        var contentWidth = bounds[2].as("px") - bounds[0].as("px");
                        var contentHeight = bounds[3].as("px") - bounds[1].as("px");

                        if (contentWidth <= 0 || contentHeight <= 0) {
                            throw new Error("导入图片尺寸无效");
                        }

                        var sourceRatio = contentWidth / contentHeight;
                        var canvasRatio = canvasWidth / canvasHeight;
                        var aspectAdjusted = Math.abs(sourceRatio - canvasRatio) / canvasRatio > 0.01;
                        var coverScale = Math.max(
                            canvasWidth / contentWidth,
                            canvasHeight / contentHeight
                        ) * 100;

                        layer.resize(coverScale, coverScale, AnchorPosition.MIDDLECENTER);

                        bounds = layer.bounds;
                        var layerCenterX = (bounds[0].as("px") + bounds[2].as("px")) / 2;
                        var layerCenterY = (bounds[1].as("px") + bounds[3].as("px")) / 2;
                        var offsetX = canvasWidth / 2 - layerCenterX;
                        var offsetY = canvasHeight / 2 - layerCenterY;
                        layer.translate(UnitValue(offsetX, "px"), UnitValue(offsetY, "px"));

                        for (i = originalLayers.length - 1; i >= 0; i--) {
                            if (originalLayers[i] !== layer) {
                                try {
                                    originalLayers[i].remove();
                                } catch(removeError) {
                                    try {
                                        originalLayers[i].visible = false;
                                    } catch(hideError) {}
                                }
                            }
                        }

                        smartDocument.save();
                        smartDocument.close(SaveOptions.SAVECHANGES);
                        smartDocument = null;

                        app.activeDocument = parentDocument;
                        parentDocument.activeLayer = targetSmartLayer;

                        var isReplacedSmartObject = targetSmartLayer.typename === "ArtLayer" &&
                            targetSmartLayer.kind === LayerKind.SMARTOBJECT;
                        if (!isReplacedSmartObject) {
                            throw new Error("替换后的目标图层不是智能对象，无法栅格化");
                        }

                        targetSmartLayer.rasterize(RasterizeType.ENTIRELAYER);
                        targetSmartLayer.name = originalLayerName;

                        return stringifyResponse({
                            success: true,
                            imported: 1,
                            failed: 0,
                            aspectAdjusted: aspectAdjusted,
                            rasterized: true
                        });
                    } catch(error) {
                        try {
                            if (smartDocument && smartDocument !== parentDocument) {
                                app.activeDocument = smartDocument;
                                smartDocument.close(SaveOptions.DONOTSAVECHANGES);
                            }
                        } catch(closeError) {}

                        try {
                            app.activeDocument = parentDocument;
                            parentDocument.activeHistoryState = originalHistoryState;
                        } catch(rollbackError) {}

                                return stringifyResponse({
                                    success: false,
                                    error: "智能对象导入失败：" + error.message
                                });
                            }
                        })();
                    } catch(fatalError) {
                        return "SMART_FATAL|" + fatalError.toString() + "|line=" + fatalError.line;
                    }
                })();
            `;
        }

        csInterface.evalScript(script, result => {
            try {
                const response = JSON.parse(result);
                if (response.success) {
                    const message = mode === 'smartObject'
                        ? (response.aspectAdjusted
                            ? '智能对象导入完成并已栅格化（比例不同，已居中裁切）'
                            : '智能对象导入完成并已栅格化')
                        : (response.failed > 0
                            ? `导入完成: 成功 ${response.imported}, 失败 ${response.failed}`
                            : `成功导入 ${response.imported} 张图片`);
                    setStatus(message);
                } else {
                    alert(response.error || '导入失败');
                    setStatus('导入失败');
                }
            } catch(error) {
                const rawResult = String(result || '无返回值').slice(0, 160);
                console.log('Photoshop 脚本返回异常:', rawResult, error);
                setStatus(mode === 'smartObject'
                    ? `智能对象导入失败：${rawResult}`
                    : '导入完成');
            }
            clearSelection();
        });
    }

    // ==================== 状态 ====================

    function setStatus(text) {
        if (elements.statusText) {
            elements.statusText.textContent = text;
        }
    }

    // ==================== 启动 ====================

    document.addEventListener('DOMContentLoaded', init);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('keydown', handleSettingsKeyDown);

    window.addEventListener('beforeunload', () => {
        stopAutoRefresh();
        if (thumbnailObserver) {
            thumbnailObserver.disconnect();
        }
        fallbackLazyCards.clear();
    });

})();
