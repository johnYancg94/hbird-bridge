(function(root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
    if (root) {
        root.HbirdBridgeMarqueeRatioUtils = api;
    }
})(typeof window !== 'undefined' ? window : this, function() {
    'use strict';

    var PINNED_RATIOS = [
        { label: '自由', mode: 'free' },
        { label: '1:1', width: 1, height: 1 },
        { label: '9:16', width: 9, height: 16 },
        { label: '16:9', width: 16, height: 9 },
        { label: '3:4', width: 3, height: 4 },
        { label: '4:3', width: 4, height: 3 }
    ];

    var MORE_RATIOS = [
        { label: '3:2', width: 3, height: 2 },
        { label: '2:3', width: 2, height: 3 },
        { label: '4:5', width: 4, height: 5 },
        { label: '5:4', width: 5, height: 4 },
        { label: '8:1', width: 8, height: 1 },
        { label: '1:8', width: 1, height: 8 },
        { label: '4:1', width: 4, height: 1 },
        { label: '1:4', width: 1, height: 4 },
        { label: '21:9', width: 21, height: 9 }
    ];

    function normalizeRatio(width, height) {
        if (typeof width !== 'number' || typeof height !== 'number' || !isFinite(width) || !isFinite(height)) {
            throw new Error('选区比例必须是有效数字');
        }
        if (width <= 0 || height <= 0) {
            throw new Error('选区比例必须是正数');
        }
        return { width: width, height: height };
    }

    function buildMarqueeRatioScript(width, height, freeMode) {
        var ratio = freeMode ? null : normalizeRatio(width, height);
        var widthValue = ratio ? Math.round(ratio.width * 1000) : null;
        var heightValue = ratio ? Math.round(ratio.height * 1000) : null;
        var modeScript = freeMode
            ? 'marqueeOptions.putInteger(charIDToTypeID("MrqM"), 1); // normal\n'
            : [
                'marqueeOptions.putInteger(charIDToTypeID("MrqM"), 2); // fixed ratio',
                'marqueeOptions.putInteger(charIDToTypeID("AspV"), ' + widthValue + ');',
                'marqueeOptions.putInteger(charIDToTypeID("AspH"), ' + heightValue + ');'
            ].join('\n');

        return [
            '(function() {',
            '    try {',
            '        function selectRectangularMarquee(toolId) {',
            '            var selectDescriptor = new ActionDescriptor();',
            '            var selectReference = new ActionReference();',
            '            selectReference.putClass(stringIDToTypeID(toolId));',
            '            selectDescriptor.putReference(charIDToTypeID("null"), selectReference);',
            '            executeAction(charIDToTypeID("slct"), selectDescriptor, DialogModes.NO);',
            '        }',
            '        try {',
            '            selectRectangularMarquee("marqueeRectTool");',
            '        } catch (toolError) {',
            '            selectRectangularMarquee("rectangularMarqueeTool");',
            '        }',
            '',
            '        var getReference = new ActionReference();',
            '        getReference.putProperty(charIDToTypeID("Prpr"), stringIDToTypeID("tool"));',
            '        getReference.putEnumerated(charIDToTypeID("capp"), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));',
            '        var toolDescriptor = executeActionGet(getReference);',
            '        var currentOptions = toolDescriptor.getObjectValue(stringIDToTypeID("currentToolOptions"));',
            '        var marqueeOptions = currentOptions.getObjectValue(charIDToTypeID("MrqI"));',
            '        ' + modeScript.replace(/\n/g, '\n        '),
            '        currentOptions.putObject(charIDToTypeID("MrqI"), charIDToTypeID("MrqC"), marqueeOptions);',
            '',
            '        var setDescriptor = new ActionDescriptor();',
            '        var setReference = new ActionReference();',
            '        var toolType = toolDescriptor.getEnumerationType(stringIDToTypeID("tool"));',
            '        setReference.putClass(toolType);',
            '        setDescriptor.putReference(charIDToTypeID("null"), setReference);',
            '        setDescriptor.putObject(charIDToTypeID("T   "), charIDToTypeID("Ordn"), currentOptions);',
            '        executeAction(charIDToTypeID("setd"), setDescriptor, DialogModes.NO);',
            '        return "OK";',
            '    } catch (error) {',
            '        return "ERROR:" + error.toString();',
            '    }',
            '})();'
        ].join('\n');
    }

    return {
        PINNED_RATIOS: PINNED_RATIOS,
        MORE_RATIOS: MORE_RATIOS,
        normalizeRatio: normalizeRatio,
        buildMarqueeRatioScript: buildMarqueeRatioScript
    };
});
