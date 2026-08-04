/**
 * Hbird Bridge - directory history utilities
 * UMD module: available as window.HbirdBridgeDirectoryHistoryUtils and module.exports.
 */
(function(root, factory) {
    const api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }

    root.HbirdBridgeDirectoryHistoryUtils = api;
})(typeof self !== 'undefined' ? self : this, function() {
    'use strict';

    function normalizeDirectoryPath(directoryPath) {
        let normalized = String(directoryPath || '').trim().replace(/\//g, '\\');
        if (!normalized) return '';

        if (/^[A-Za-z]:\\+$/.test(normalized)) {
            return normalized.slice(0, 2) + '\\';
        }

        normalized = normalized.replace(/\\+$/g, '');
        return normalized;
    }

    function buildDirectoryHistory(currentPath, recentPaths, maxCount) {
        const limit = maxCount === undefined ? 3 : maxCount;
        if (!Number.isInteger(limit) || limit < 1) {
            throw new Error('maxCount must be a positive integer');
        }

        const result = [];
        const seen = new Set();
        const candidates = [currentPath].concat(Array.isArray(recentPaths) ? recentPaths : []);

        candidates.forEach(candidate => {
            if (result.length >= limit) return;
            const normalized = normalizeDirectoryPath(candidate);
            if (!normalized) return;
            const key = normalized.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            result.push(normalized);
        });

        return result;
    }

    function getDirectoryDisplayName(directoryPath) {
        const normalized = normalizeDirectoryPath(directoryPath);
        if (!normalized) return '未选择目录';
        if (/^[A-Za-z]:\\$/.test(normalized)) return normalized.slice(0, 2);

        const separatorIndex = normalized.lastIndexOf('\\');
        return separatorIndex >= 0 ? normalized.slice(separatorIndex + 1) : normalized;
    }

    return {
        normalizeDirectoryPath,
        buildDirectoryHistory,
        getDirectoryDisplayName
    };
});
