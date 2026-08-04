'use strict';

const assert = require('assert');
const utils = require('../js/directory-history-utils.js');

function testMostRecentDirectoryMovesToFront() {
    assert.deepStrictEqual(
        utils.buildDirectoryHistory('E:/New', ['E:/Old', 'E:/New', 'D:/Earlier'], 3),
        ['E:\\New', 'E:\\Old', 'D:\\Earlier']
    );
}

function testHistoryIsCaseInsensitiveAndBounded() {
    assert.deepStrictEqual(
        utils.buildDirectoryHistory('E:\\Assets', ['e:/assets/', 'F:/Two', 'G:/Three', 'H:/Four'], 3),
        ['E:\\Assets', 'F:\\Two', 'G:\\Three']
    );
}

function testDirectoryDisplayNames() {
    assert.strictEqual(utils.getDirectoryDisplayName('E:\\AI插件导入图片\\'), 'AI插件导入图片');
    assert.strictEqual(utils.getDirectoryDisplayName('E:\\'), 'E:');
    assert.strictEqual(utils.getDirectoryDisplayName(''), '未选择目录');
}

function testInvalidHistoryLimitIsRejected() {
    assert.throws(() => utils.buildDirectoryHistory('E:/Assets', [], 0), /positive integer/);
}

testMostRecentDirectoryMovesToFront();
testHistoryIsCaseInsensitiveAndBounded();
testDirectoryDisplayNames();
testInvalidHistoryLimitIsRejected();
console.log('directory-history-utils: all assertions passed');
