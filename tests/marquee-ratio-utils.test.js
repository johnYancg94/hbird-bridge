'use strict';

const assert = require('assert');
const ratioUtils = require('../js/marquee-ratio-utils.js');

assert.deepStrictEqual(
    ratioUtils.PINNED_RATIOS.map(item => item.label),
    ['自由', '1:1', '9:16', '16:9', '3:4', '4:3'],
    'free selection and the five requested ratios must remain pinned'
);
assert.deepStrictEqual(
    ratioUtils.MORE_RATIOS.map(item => item.label),
    ['3:2', '2:3', '4:5', '5:4', '8:1', '1:8', '4:1', '1:4', '21:9'],
    'all secondary ratios must remain in the overflow menu'
);

assert.deepStrictEqual(ratioUtils.normalizeRatio(16, 9), { width: 16, height: 9 });
assert.throws(() => ratioUtils.normalizeRatio(0, 9), /正数/);
assert.throws(() => ratioUtils.normalizeRatio('16', 9), /数字/);

const fixedScript = ratioUtils.buildMarqueeRatioScript(16, 9, false);
assert.doesNotThrow(() => new Function(fixedScript), 'generated fixed-ratio ExtendScript must be syntactically valid');
assert(fixedScript.includes('marqueeRectTool'), 'script must select the rectangular marquee tool');
assert(fixedScript.includes('rectangularMarqueeTool'), 'script must retain a compatibility fallback tool id');
assert(fixedScript.includes('currentToolOptions'), 'script must update the active tool options');
assert(fixedScript.includes('"MrqM"'), 'fixed presets must set the Photoshop marquee style field');
assert(fixedScript.includes('"AspV"'), 'fixed presets must set the Photoshop width-ratio field');
assert(fixedScript.includes('"AspH"'), 'fixed presets must set the Photoshop height-ratio field');
assert(fixedScript.includes('putInteger'), 'fixed ratio values must be written as Photoshop integer descriptor values');
assert(fixedScript.includes(', 16000);'), 'the selected width must use Photoshop thousandths');
assert(fixedScript.includes(', 9000);'), 'the selected height must use Photoshop thousandths');

const freeScript = ratioUtils.buildMarqueeRatioScript(null, null, true);
assert.doesNotThrow(() => new Function(freeScript), 'generated adaptive ExtendScript must be syntactically valid');
assert(freeScript.includes('normal'), 'adaptive mode must restore the unconstrained selection style');
assert(freeScript.includes('putInteger(charIDToTypeID("MrqM"), 1)'), 'adaptive mode must restore marquee mode 1');
assert(!freeScript.includes('charIDToTypeID("AspV")'), 'adaptive mode must not set a width');
assert(!freeScript.includes('charIDToTypeID("AspH")'), 'adaptive mode must not set a height');

console.log('marquee-ratio-utils: all assertions passed');
