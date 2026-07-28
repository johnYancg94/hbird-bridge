/**
 * Hbird Bridge - 主逻辑
 * 版本 1.5.0 - 新增选区拷贝、双行彩色操作区和智能对象无位移替换
 */

(function() {
    'use strict';

    // ==================== 配置 ====================
    const CONFIG = {
        assetsDir: '',
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

    // DOM 元素
    let elements = {};

    // ==================== 初始化 ====================

    function init() {
        const homeDir = os.homedir();
        CONFIG.assetsDir = path.join(homeDir, 'HbirdBridge');

        elements = {
            assetsDir: document.getElementById('assetsDir'),
            browseDirBtn: document.getElementById('browseDirBtn'),
            openAssetsDirBtn: document.getElementById('openAssetsDirBtn'),
            scanFolderBtn: document.getElementById('scanFolderBtn'),
            archiveBtn: document.getElementById('archiveBtn'),
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

        elements.assetsDir.value = CONFIG.assetsDir;

        // 固定控件事件
        elements.scanFolderBtn.addEventListener('click', scanFolder);
        elements.browseDirBtn.addEventListener('click', browseDir);
        elements.openAssetsDirBtn.addEventListener('click', openAssetsDirectory);
        elements.archiveBtn.addEventListener('click', archiveOldImages);
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
        elements.autoRefreshIndicator.style.color = active ? '#4CAF50' : '#777';
        elements.autoRefreshIndicator.textContent = active ? '● 自动监听中' : '● 已暂停监听';
    }

    function checkForNewFiles() {
        if (document.hidden || scanInProgress || archiveInProgress) return;
        refreshAssets({ source: 'auto', force: false });
    }

    function flashAutoRefreshIndicator() {
        if (!elements.autoRefreshIndicator) return;
        elements.autoRefreshIndicator.style.color = '#FFD700';
        setTimeout(() => {
            if (autoRefreshTimer) {
                elements.autoRefreshIndicator.style.color = '#4CAF50';
            }
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

    // ==================== 设置管理 ====================

    const SETTINGS_FILENAME = 'HbirdBridge_settings.json';
    const LEGACY_SETTINGS_FILENAME = 'Qiaodoumayijiang_settings.json';

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
                    elements.assetsDir.value = CONFIG.assetsDir;
                }

                if (candidate.legacy) {
                    saveSettings();
                    console.log('已将旧版设置迁移到 Hbird Bridge');
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
            fs.writeFileSync(settingsPath, JSON.stringify({ assetsDir: CONFIG.assetsDir }), 'utf8');
        } catch(error) {
            console.log('保存设置失败:', error);
        }
    }

    // ==================== 目录选择 ====================

    function browseDir() {
        const result = window.cep.fs.showOpenDialogEx(false, true, '选择素材目录', CONFIG.assetsDir, null);
        if (result.data && result.data.length > 0) {
            CONFIG.assetsDir = result.data[0];
            elements.assetsDir.value = CONFIG.assetsDir;
            saveSettings();
            lastSnapshot = '';
            loadAssets();
            startAutoRefresh();
        }
    }

    function openAssetsDirectory() {
        const explorerDirectory = path.win32.normalize(CONFIG.assetsDir);
        if (!fs.existsSync(explorerDirectory)) {
            alert('当前素材目录不存在');
            setStatus('无法打开素材目录');
            return;
        }

        childProcess.execFile('explorer.exe', [explorerDirectory], error => {
            if (error) {
                console.log('打开素材目录失败:', error);
                setStatus('打开素材目录失败');
            }
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
        hint.textContent = '点击「扫描文件夹」或放入图片';

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

        scanFolderInternal(CONFIG.assetsDir).then(assets => {
            const archivePlan = AssetUtils.buildArchivePlan(assets, CONFIG.archiveKeepCount);
            if (archivePlan.archive.length === 0) {
                setStatus(`当前共 ${assets.length} 张图片，无需归档`);
                return null;
            }

            const movePlan = buildArchiveMovePlan(archivePlan.archive);
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

    function buildArchiveMovePlan(archiveAssets) {
        const rootPath = path.resolve(CONFIG.assetsDir);
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
            elements.browseDirBtn,
            elements.scanFolderBtn,
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

    function copyCurrentSelection() {
        setStatus('正在拷贝当前选区...');

        const script = `
            (function() {
                ${extendScriptStringifyHelper}
                var doc = null;
                var originalHistoryState = null;
                var stampLayer = null;
                var selectionLayer = null;

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
                    doc.selection.copy();

                    stampLayer.remove();
                    stampLayer = null;
                    doc.activeLayer = selectionLayer;

                    return stringifyResponse({
                        success: true,
                        layerName: selectionLayer.name
                    });
                } catch(error) {
                    try {
                        if (doc && originalHistoryState) {
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
                    setStatus('选区已生成新图层并拷贝到剪贴板');
                } else {
                    alert(response.error || '拷贝当前选区失败');
                    setStatus('拷贝当前选区失败');
                }
            } catch(error) {
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
                        parentDocument.activeLayer.name = originalLayerName;

                        return stringifyResponse({
                            success: true,
                            imported: 1,
                            failed: 0,
                            aspectAdjusted: aspectAdjusted
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
                            ? '智能对象导入完成（比例不同，已居中裁切）'
                            : '智能对象导入完成')
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

    window.addEventListener('beforeunload', () => {
        stopAutoRefresh();
        if (thumbnailObserver) {
            thumbnailObserver.disconnect();
        }
        fallbackLazyCards.clear();
    });

})();
