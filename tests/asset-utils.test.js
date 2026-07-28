'use strict';

const assert = require('assert');
const utils = require('../js/asset-utils.js');

async function testTaskQueueLimitsConcurrency() {
    const queue = utils.createTaskQueue(2);
    let active = 0;
    let peak = 0;

    const results = await Promise.all([0, 1, 2, 3, 4].map(value => {
        return queue.add(() => new Promise(resolve => {
            active++;
            peak = Math.max(peak, active);
            setTimeout(() => {
                active--;
                resolve(value * 2);
            }, 5);
        }));
    }));

    assert.strictEqual(peak, 2, 'task queue must respect its concurrency limit');
    assert.deepStrictEqual(results, [0, 2, 4, 6, 8]);
}

async function testMapLimitPreservesInputOrder() {
    let active = 0;
    let peak = 0;
    const results = await utils.mapLimit([3, 1, 2], 2, value => {
        return new Promise(resolve => {
            active++;
            peak = Math.max(peak, active);
            setTimeout(() => {
                active--;
                resolve(value * 10);
            }, value);
        });
    });

    assert.strictEqual(peak, 2);
    assert.deepStrictEqual(results, [30, 10, 20]);
}

function testSnapshotsDetectSameCountChanges() {
    const before = [
        { fullPath: 'C:/a.png', size: 10, mtimeMs: 100 },
        { fullPath: 'C:/b.png', size: 20, mtimeMs: 200 }
    ];
    const reordered = [before[1], before[0]];
    const modified = [
        { fullPath: 'C:/a.png', size: 10, mtimeMs: 101 },
        before[1]
    ];

    assert.strictEqual(
        utils.createAssetSnapshot(before),
        utils.createAssetSnapshot(reordered),
        'snapshot must not depend on display order'
    );
    assert.notStrictEqual(
        utils.createAssetSnapshot(before),
        utils.createAssetSnapshot(modified),
        'mtime changes must be detected even when file count is unchanged'
    );
}

function testDiffClassifiesUpdatedAssets() {
    const before = [
        { fullPath: 'C:/a.png', size: 10, mtimeMs: 100 },
        { fullPath: 'C:/removed.png', size: 20, mtimeMs: 200 }
    ];
    const updated = { fullPath: 'C:/a.png', size: 11, mtimeMs: 101 };
    const added = { fullPath: 'C:/added.png', size: 5, mtimeMs: 50 };
    const diff = utils.diffAssets(before, [updated, added]);

    assert.deepStrictEqual(diff.added.map(asset => asset.fullPath), ['C:/added.png']);
    assert.deepStrictEqual(diff.removed.map(asset => asset.fullPath), ['C:/removed.png']);
    assert.deepStrictEqual(diff.updated.map(asset => asset.fullPath), ['C:/a.png']);
    assert.strictEqual(diff.unchanged.length, 0);
}

function testMimeTypeOnlyAllowsBrowserRenderableImages() {
    assert.strictEqual(utils.getImageMimeType('image.PNG'), 'image/png');
    assert.strictEqual(utils.getImageMimeType('photo.jpeg'), 'image/jpeg');
    assert.strictEqual(utils.getImageMimeType('design.psd'), null);
    assert.strictEqual(utils.getImageMimeType('scan.tiff'), null);
}

function testWeekArchiveFolderUsesThursdayOwnedMonth() {
    assert.strictEqual(
        utils.getWeekArchiveFolderName(new Date(2026, 5, 22, 12).getTime()),
        '2026年6月第4周'
    );
    assert.strictEqual(
        utils.getWeekArchiveFolderName(new Date(2026, 5, 29, 12).getTime()),
        '2026年7月第1周'
    );
    assert.strictEqual(
        utils.getWeekArchiveFolderName(new Date(2026, 6, 5, 12).getTime()),
        '2026年7月第1周'
    );
    assert.strictEqual(
        utils.getWeekArchiveFolderName(new Date(2026, 6, 6, 12).getTime()),
        '2026年7月第2周'
    );
}

function testArchivePlanKeepsNewestAndUsesStableTieBreak() {
    const base = new Date(2026, 5, 22, 12).getTime();
    const assets = Array.from({ length: 12 }, (_, index) => ({
        fullPath: `C:/${String(index).padStart(2, '0')}.png`,
        mtimeMs: base + (index * 1000),
        size: 1
    }));
    assets.push({ fullPath: 'C:/tie-b.png', mtimeMs: base + 50000, size: 1 });
    assets.push({ fullPath: 'C:/tie-a.png', mtimeMs: base + 50000, size: 1 });

    const plan = utils.buildArchivePlan(assets, 10);

    assert.strictEqual(plan.kept.length, 10);
    assert.strictEqual(plan.archive.length, 4);
    assert.deepStrictEqual(plan.kept.slice(0, 2).map(asset => asset.fullPath), [
        'C:/tie-a.png',
        'C:/tie-b.png'
    ]);
    assert(plan.archive.every(item => item.archiveFolderName === '2026年6月第4周'));
}

function testArchivePlanDoesNothingAtOrBelowKeepCount() {
    const assets = Array.from({ length: 10 }, (_, index) => ({
        fullPath: `C:/${index}.png`,
        mtimeMs: index,
        size: 1
    }));
    const plan = utils.buildArchivePlan(assets, 10);

    assert.strictEqual(plan.kept.length, 10);
    assert.strictEqual(plan.archive.length, 0);
}

function testCollisionSafeArchiveNamePreservesEveryFile() {
    const timestamp = new Date(2026, 5, 25, 16, 20, 23).getTime();
    const taken = new Set([
        '图片节点 7.png',
        '图片节点 7__20260625-162023.png',
        '图片节点 7__20260625-162023_2.png'
    ]);

    assert.strictEqual(
        utils.createUniqueArchiveFileName('未冲突.png', timestamp, name => taken.has(name)),
        '未冲突.png'
    );
    assert.strictEqual(
        utils.createUniqueArchiveFileName('图片节点 7.png', timestamp, name => taken.has(name)),
        '图片节点 7__20260625-162023_3.png'
    );
}

async function run() {
    await testTaskQueueLimitsConcurrency();
    await testMapLimitPreservesInputOrder();
    testSnapshotsDetectSameCountChanges();
    testDiffClassifiesUpdatedAssets();
    testMimeTypeOnlyAllowsBrowserRenderableImages();
    testWeekArchiveFolderUsesThursdayOwnedMonth();
    testArchivePlanKeepsNewestAndUsesStableTieBreak();
    testArchivePlanDoesNothingAtOrBelowKeepCount();
    testCollisionSafeArchiveNamePreservesEveryFile();
    console.log('asset-utils: 9 tests passed');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
