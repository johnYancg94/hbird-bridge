/**
 * Hbird Bridge - performance utilities
 * UMD module: available as window.HbirdBridgeAssetUtils and module.exports.
 */
(function(root, factory) {
    const api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }

    root.HbirdBridgeAssetUtils = api;
})(typeof self !== 'undefined' ? self : this, function() {
    'use strict';

    function createTaskQueue(maxConcurrent) {
        if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) {
            throw new Error('maxConcurrent must be a positive integer');
        }

        const pending = [];
        let activeCount = 0;

        function completeTask() {
            activeCount--;
            runNext();
        }

        function runNext() {
            while (activeCount < maxConcurrent && pending.length > 0) {
                const entry = pending.shift();
                activeCount++;

                let result;
                try {
                    result = entry.task();
                } catch (error) {
                    entry.reject(error);
                    completeTask();
                    continue;
                }

                Promise.resolve(result).then(value => {
                    entry.resolve(value);
                    completeTask();
                }, error => {
                    entry.reject(error);
                    completeTask();
                });
            }
        }

        return {
            add(task) {
                if (typeof task !== 'function') {
                    return Promise.reject(new Error('task must be a function'));
                }

                return new Promise((resolve, reject) => {
                    pending.push({ task, resolve, reject });
                    runNext();
                });
            },
            getActiveCount() {
                return activeCount;
            },
            getPendingCount() {
                return pending.length;
            }
        };
    }

    function mapLimit(items, limit, iterator) {
        const queue = createTaskQueue(limit);
        return Promise.all(items.map((item, index) => {
            return queue.add(() => iterator(item, index));
        }));
    }

    function createAssetSnapshot(assets) {
        const entries = assets.map(asset => {
            return [asset.fullPath, asset.size, asset.mtimeMs];
        });
        entries.sort((a, b) => a[0].localeCompare(b[0]));
        return JSON.stringify(entries);
    }

    function diffAssets(previousAssets, nextAssets) {
        const previousByPath = new Map();
        const nextByPath = new Map();

        previousAssets.forEach(asset => previousByPath.set(asset.fullPath, asset));
        nextAssets.forEach(asset => nextByPath.set(asset.fullPath, asset));

        const added = [];
        const removed = [];
        const updated = [];
        const unchanged = [];

        nextAssets.forEach(asset => {
            const previous = previousByPath.get(asset.fullPath);
            if (!previous) {
                added.push(asset);
            } else if (previous.size !== asset.size || previous.mtimeMs !== asset.mtimeMs) {
                updated.push(asset);
            } else {
                unchanged.push(asset);
            }
        });

        previousAssets.forEach(asset => {
            if (!nextByPath.has(asset.fullPath)) {
                removed.push(asset);
            }
        });

        return { added, removed, updated, unchanged };
    }

    function getImageMimeType(filePath) {
        const match = String(filePath).toLowerCase().match(/\.[^./\\]+$/);
        const extension = match ? match[0] : '';
        const mimeTypes = {
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.bmp': 'image/bmp'
        };
        return mimeTypes[extension] || null;
    }

    function getWeekArchiveFolderName(timestamp) {
        const date = new Date(timestamp);
        if (Number.isNaN(date.getTime())) {
            throw new Error('timestamp must be a valid date value');
        }

        const mondayOffset = (date.getDay() + 6) % 7;
        const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - mondayOffset);
        const thursday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 3);
        const ownerYear = thursday.getFullYear();
        const ownerMonth = thursday.getMonth();

        const firstOfMonth = new Date(ownerYear, ownerMonth, 1);
        const firstMondayOffset = (firstOfMonth.getDay() + 6) % 7;
        const firstMonday = new Date(ownerYear, ownerMonth, 1 - firstMondayOffset);

        const mondayUtc = Date.UTC(monday.getFullYear(), monday.getMonth(), monday.getDate());
        const firstMondayUtc = Date.UTC(
            firstMonday.getFullYear(),
            firstMonday.getMonth(),
            firstMonday.getDate()
        );
        const weekNumber = Math.floor((mondayUtc - firstMondayUtc) / (7 * 24 * 60 * 60 * 1000)) + 1;

        return `${ownerYear}年${ownerMonth + 1}月第${weekNumber}周`;
    }

    function buildArchivePlan(assets, keepCount) {
        const resolvedKeepCount = keepCount === undefined ? 10 : keepCount;
        if (!Number.isInteger(resolvedKeepCount) || resolvedKeepCount < 0) {
            throw new Error('keepCount must be a non-negative integer');
        }

        const sorted = assets.slice().sort((a, b) => {
            const timeDifference = b.mtimeMs - a.mtimeMs;
            if (timeDifference !== 0) return timeDifference;
            return String(a.fullPath).localeCompare(String(b.fullPath));
        });

        const kept = sorted.slice(0, resolvedKeepCount);
        const archive = sorted.slice(resolvedKeepCount).map(asset => {
            return Object.assign({}, asset, {
                archiveFolderName: getWeekArchiveFolderName(asset.mtimeMs)
            });
        });

        return { kept, archive };
    }

    function createUniqueArchiveFileName(fileName, timestamp, isTaken) {
        if (typeof isTaken !== 'function') {
            throw new Error('isTaken must be a function');
        }
        if (!isTaken(fileName)) return fileName;

        const date = new Date(timestamp);
        if (Number.isNaN(date.getTime())) {
            throw new Error('timestamp must be a valid date value');
        }

        const lastDot = fileName.lastIndexOf('.');
        const baseName = lastDot > 0 ? fileName.substring(0, lastDot) : fileName;
        const extension = lastDot > 0 ? fileName.substring(lastDot) : '';
        const pad = value => String(value).padStart(2, '0');
        const stamp = [
            date.getFullYear(),
            pad(date.getMonth() + 1),
            pad(date.getDate())
        ].join('') + '-' + [
            pad(date.getHours()),
            pad(date.getMinutes()),
            pad(date.getSeconds())
        ].join('');

        let suffix = '';
        let counter = 1;
        let candidate;
        do {
            candidate = `${baseName}__${stamp}${suffix}${extension}`;
            counter++;
            suffix = `_${counter}`;
        } while (isTaken(candidate));

        return candidate;
    }

    return {
        createTaskQueue,
        mapLimit,
        createAssetSnapshot,
        diffAssets,
        getImageMimeType,
        getWeekArchiveFolderName,
        buildArchivePlan,
        createUniqueArchiveFileName
    };
});
