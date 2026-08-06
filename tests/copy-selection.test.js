'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const style = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
const main = fs.readFileSync(path.join(root, 'js', 'main.js'), 'utf8');

const clipboardHelpersStart = main.indexOf('function writeImageFileToWindowsClipboard(');
const copyStart = main.indexOf('function copyCurrentSelection()');
const copyEnd = main.indexOf('function importToPS(mode)', copyStart);
const clipboardHelpers = main.slice(clipboardHelpersStart, copyStart);
const copyFunction = main.slice(copyStart, copyEnd);
const createSelectionLayerPosition = copyFunction.indexOf('selectionLayer = doc.activeLayer');
const createMergeGuardPosition = copyFunction.indexOf('mergeGuardLayer = doc.artLayers.add()');
const mergeVisiblePosition = copyFunction.indexOf('executeAction(charIDToTypeID("MrgV"), mergeDescriptor, DialogModes.NO)');
const removeMergeGuardPosition = copyFunction.indexOf('deleteLayerWithoutSelecting(mergeGuardLayerId)');
const removeTemporaryStampPosition = copyFunction.indexOf('deleteLayerWithoutSelecting(stampLayerId)');
const createExportDocumentPosition = copyFunction.indexOf('tempDocument = app.documents.add(');
const saveClipboardPngPosition = copyFunction.indexOf('tempDocument.saveAs(exportFile, pngOptions, true, Extension.LOWERCASE)');

const firstRow = index.match(/<div class="action-button-row action-button-row-main">([\s\S]*?)<\/div>/);
const secondRow = index.match(/<div class="action-button-row action-button-row-secondary">([\s\S]*?)<\/div>/);

const checks = [
    [copyStart >= 0 && copyEnd > copyStart, 'copyCurrentSelection must be a standalone controller action'],
    [firstRow && firstRow[1].includes('id="deleteBtn"'), 'first row must contain delete'],
    [firstRow && firstRow[1].includes('id="openNewBtn"'), 'first row must contain open-new'],
    [firstRow && firstRow[1].includes('id="placeLayerBtn"'), 'first row must contain normal layer import'],
    [secondRow && secondRow[1].includes('id="copySelectionBtn"'), 'second row must contain copy-selection'],
    [secondRow && secondRow[1].includes('id="smartObjectBtn"'), 'second row must contain smart-object import'],
    [index.includes('class="btn btn-open action-icon-only"'), 'open-new must keep its distinct color class as an icon-only action'],
    [index.includes('class="btn btn-place btn-action-wide"'), 'normal layer import must have a distinct color class'],
    [index.includes('class="btn btn-copy-selection btn-action-wide"'), 'copy-selection must have a distinct color class'],
    [index.includes('class="btn btn-smart btn-action-wide"'), 'smart-object import must have a distinct color class'],
    [/\.action-buttons\s*\{[^}]*flex-direction:\s*column/s.test(style), 'action buttons must use a two-row column layout'],
    [/\.action-button-row\s*\{[^}]*display:\s*grid/s.test(style), 'each action row must remain horizontal'],
    [style.includes('.btn-open') && style.includes('.btn-place'), 'top-row action colors must exist'],
    [style.includes('.btn-copy-selection') && style.includes('.btn-smart'), 'lower-row action colors must exist'],
    [main.includes("elements.copySelectionBtn.addEventListener('click', copyCurrentSelection)"), 'button must bind to copyCurrentSelection'],
    [copyFunction.includes('app.documents.length === 0'), 'action must reject missing documents'],
    [copyFunction.includes('doc.selection.bounds'), 'action must verify an active selection'],
    [copyFunction.includes('mergeDescriptor.putBoolean(charIDToTypeID("Dplc"), true)'), 'merge-visible must duplicate into a temporary stamp'],
    [copyFunction.includes('executeAction(charIDToTypeID("MrgV"), mergeDescriptor, DialogModes.NO)'), 'action must stamp visible layers'],
    [copyFunction.includes('var mergeGuardLayer = null'), 'copying must track the temporary visible merge guard'],
    [copyFunction.includes('var mergeGuardLayerId = null'), 'copying must track the merge guard by Photoshop layer id'],
    [copyFunction.includes('var stampLayerId = null'), 'copying must track the temporary stamp by Photoshop layer id'],
    [copyFunction.includes('function layerExistsById(layerId)'), 'temporary cleanup must tolerate layers consumed by Photoshop'],
    [
        copyFunction.includes('executeActionGet(layerReference)') &&
            copyFunction.includes('catch(layerLookupError)') &&
            copyFunction.includes('return false;'),
        'layer existence checks must use a direct id lookup and treat missing layers as already cleaned'
    ],
    [copyFunction.includes('function deleteLayerWithoutSelecting(layerId)'), 'temporary layers need a no-selection delete helper'],
    [
        copyFunction.includes('deleteReference.putIdentifier(charIDToTypeID("Lyr "), layerId)') &&
            copyFunction.includes('executeAction(charIDToTypeID("Dlt "), deleteDescriptor, DialogModes.NO)'),
        'temporary deletion must target the layer id directly through Action Manager'
    ],
    [copyFunction.includes('var currentStage = "初始化"'), 'Photoshop failures must track the current execution stage'],
    [createMergeGuardPosition >= 0, 'copying must create a temporary empty layer before stamping visible content'],
    [copyFunction.includes('mergeGuardLayer.visible = true'), 'the temporary merge guard must be visible'],
    [copyFunction.includes('mergeGuardLayerId = mergeGuardLayer.id'), 'the merge guard id must be captured before merge-visible'],
    [copyFunction.includes('stampLayerId = stampLayer.id'), 'the stamp id must be captured before creating the selection layer'],
    [
        createMergeGuardPosition < mergeVisiblePosition,
        'Photoshop must create and auto-activate the visible merge guard before merge-visible'
    ],
    [
        !copyFunction.includes('doc.activeLayer = mergeGuardLayer'),
        'the newly created merge guard must not be selected again when the previous layer is hidden'
    ],
    [
        mergeVisiblePosition < removeMergeGuardPosition && removeMergeGuardPosition < createSelectionLayerPosition,
        'only the temporary merge guard must be removed after the stamp is created'
    ],
    [!copyFunction.includes('doc.activeLayer.visible = true'), 'copying must not reveal the user selected layer'],
    [!copyFunction.includes('mergeGuardLayer.remove()'), 'merge guard deletion must not invoke Photoshop DOM selection'],
    [!copyFunction.includes('stampLayer.remove()'), 'stamp deletion must not invoke Photoshop DOM selection'],
    [
        copyFunction.includes('if (layerExistsById(mergeGuardLayerId))') &&
            copyFunction.includes('if (layerExistsById(stampLayerId))'),
        'temporary layers must only be deleted when Photoshop still reports their ids'
    ],
    [
        copyFunction.includes('currentStage = "删除临时合并辅助图层"') &&
            copyFunction.includes('currentStage = "删除临时盖印图层"') &&
            copyFunction.includes('currentStage = "重新激活选区拷贝图层"'),
        'all remaining layer-selection boundaries must identify their diagnostic stage'
    ],
    [
        copyFunction.includes('error: "拷贝当前选区失败（阶段：" + currentStage + "）：" + error.message'),
        'Photoshop errors must report the exact execution stage'
    ],
    [!copyFunction.includes('mergeVisibleLayers()'), 'action must not destructively merge the document'],
    [copyFunction.includes('stringIDToTypeID("copyToLayer")'), 'selection must be copied into a new layer'],
    [copyFunction.includes('selectionLayer.name = "选区拷贝"'), 'new layer must have a recognizable name'],
    [!copyFunction.includes('doc.selection.copy()'), 'clipboard copy must not use the unreliable Selection DOM method'],
    [!copyFunction.includes('executeAction(charIDToTypeID("copy"), undefined, DialogModes.NO)'), 'clipboard copy must not stop at Photoshop internal Copy'],
    [!copyFunction.includes('app.currentTool'), 'clipboard export must not change the user tool'],
    [!clipboardHelpers.includes('SendKeys'), 'clipboard export must not depend on simulated keyboard focus'],
    [!clipboardHelpers.includes('WScript.Shell'), 'clipboard export must not depend on CEP or canvas focus'],
    [createSelectionLayerPosition >= 0 && createSelectionLayerPosition < removeTemporaryStampPosition, 'the selection layer must exist before removing the temporary stamp'],
    [removeTemporaryStampPosition < createExportDocumentPosition, 'the retained selection layer must be finalized before creating a temporary export document'],
    [copyFunction.includes('var clipboardMaxEdge = '), 'Photoshop export must receive the configured maximum edge'],
    [copyFunction.includes('var tempDocument = null'), 'clipboard export must use an isolated temporary document'],
    [
        /selectionLayer\.duplicate\(\s*tempDocument,\s*ElementPlacement\.PLACEATBEGINNING\s*\)/.test(copyFunction),
        'the retained layer must be duplicated instead of resized in place'
    ],
    [copyFunction.includes('var sourceLayerBounds = selectionLayer.bounds'), 'export must capture source content bounds'],
    [copyFunction.includes('var exportLayerBounds = exportLayer.bounds'), 'export must measure the duplicated layer at its actual destination position'],
    [copyFunction.includes('desiredContentLeft - exportLayerBounds[0].as("px")'), 'export positioning must preserve transparent padding inside the selection'],
    [copyFunction.includes('if (longestEdge > clipboardMaxEdge)'), 'only oversized clipboard images should be optimized'],
    [copyFunction.includes('stringIDToTypeID("newPlacedLayer")'), 'oversized temporary exports must be converted to a smart object'],
    [copyFunction.includes('tempDocument.resizeImage('), 'oversized temporary exports must be resized before PNG export'],
    [copyFunction.includes('tempDocument.resolution,'), 'clipboard resize must preserve document resolution'],
    [copyFunction.includes('new PNGSaveOptions()'), 'clipboard transfer must use a transparent PNG intermediary'],
    [saveClipboardPngPosition > createExportDocumentPosition, 'temporary PNG must be saved after the export document is prepared'],
    [copyFunction.includes('tempDocument.close(SaveOptions.DONOTSAVECHANGES)'), 'temporary Photoshop document must always close without user changes'],
    [copyFunction.includes('optimized: optimized'), 'Photoshop response must report whether resolution optimization occurred'],
    [copyFunction.includes('outputWidth: outputWidth'), 'Photoshop response must report output dimensions'],
    [copyFunction.includes('writeImageFileToWindowsClipboard(response.tempFilePath'), 'successful PNG export must trigger direct Windows clipboard writing'],
    [clipboardHelpersStart >= 0 && clipboardHelpers.includes("childProcess.execFile('powershell.exe'"), 'Windows clipboard writing must use the existing CEP child-process bridge'],
    [clipboardHelpers.includes("'-STA'"), 'the clipboard helper must run PowerShell in STA mode'],
    [clipboardHelpers.includes('$env:HBIRD_CLIPBOARD_IMAGE'), 'image path must be passed without shell interpolation'],
    [clipboardHelpers.includes('System.Drawing'), 'the helper must decode the exported image'],
    [clipboardHelpers.includes('System.Windows.Forms.DataObject'), 'the helper must build a multi-format clipboard payload'],
    [clipboardHelpers.includes('DataFormats]::Bitmap'), 'the clipboard payload must include Bitmap format'],
    [clipboardHelpers.includes('$pngStream.Position = 0'), 'PNG clipboard stream must rewind after image decoding'],
    [clipboardHelpers.includes('SetData("PNG"'), 'the clipboard payload must include PNG format'],
    [clipboardHelpers.includes('Clipboard]::SetDataObject'), 'the helper must write directly to the Windows clipboard'],
    [clipboardHelpers.includes('GetClipboardSequenceNumber'), 'the helper must detect whether Windows clipboard ownership changed'],
    [clipboardHelpers.includes('Clipboard]::ContainsImage()'), 'the helper must verify a pasted image is available'],
    [clipboardHelpers.includes('windowsHide: true'), 'the PowerShell helper must not flash a console window'],
    [main.includes('fs.unlink(imagePath'), 'temporary PNG must be deleted after the clipboard attempt'],
    [copyFunction.includes('deleteLayerWithoutSelecting(stampLayerId)'), 'temporary stamp layer must be deleted without selecting it'],
    [copyFunction.includes('doc.activeLayer = selectionLayer'), 'new selection layer must remain active'],
    [copyFunction.includes('doc.activeHistoryState = originalHistoryState'), 'failures must roll back document changes'],
    [copyFunction.includes('当前没有有效的框选选区'), 'missing selections must return a clear message'],
    [copyFunction.includes('选区已生成新图层并拷贝到 Windows 剪贴板'), 'success status must confirm the external clipboard target']
];

for (const [condition, message] of checks) {
    assert(condition, message);
}

console.log(`copy-selection: ${checks.length} assertions passed`);
