/**
 * CSInterface - Adobe CEP 接口库
 * 版本: 11.0
 */

var CSInterface = function() {};

CSInterface.prototype.evalScript = function(script, callback) {
    if (callback === undefined) {
        callback = function() {};
    }
    window.__adobe_cep__.evalScript(script, callback);
};

CSInterface.prototype.getSystemPath = function(pathType) {
    var retVal = window.__adobe_cep__.getSystemPath(pathType);
    return decodeURIComponent(retVal);
};

CSInterface.prototype.getExtensionID = function() {
    return window.__adobe_cep__.getExtensionId();
};

CSInterface.prototype.addEventListener = function(type, listener, obj) {
    window.__adobe_cep__.addEventListener(type, listener, obj);
};

CSInterface.prototype.removeEventListener = function(type, listener, obj) {
    window.__adobe_cep__.removeEventListener(type, listener, obj);
};

CSInterface.prototype.dispatchEvent = function(event) {
    if (typeof event.data === "object") {
        event.data = JSON.stringify(event.data);
    }
    window.__adobe_cep__.dispatchEvent(event);
};

CSInterface.prototype.requestOpenExtension = function(extensionId, params) {
    window.__adobe_cep__.requestOpenExtension(extensionId, params);
};

CSInterface.prototype.closeExtension = function() {
    window.__adobe_cep__.closeExtension();
};

CSInterface.prototype.getHostEnvironment = function() {
    return JSON.parse(window.__adobe_cep__.getHostEnvironment());
};

CSInterface.prototype.setWindowTitle = function(title) {
    window.__adobe_cep__.invokeSync("setWindowTitle", title);
};

CSInterface.prototype.getWindowTitle = function() {
    return window.__adobe_cep__.invokeSync("getWindowTitle", "");
};

CSInterface.prototype.getScaleFactor = function() {
    return window.__adobe_cep__.getScaleFactor();
};

CSInterface.prototype.setScaleFactorChangedHandler = function(handler) {
    window.__adobe_cep__.setScaleFactorChangedHandler(handler);
};

CSInterface.prototype.getCurrentApiVersion = function() {
    return JSON.parse(window.__adobe_cep__.getCurrentApiVersion());
};

CSInterface.prototype.openURLInDefaultBrowser = function(url) {
    window.cep.util.openURLInDefaultBrowser(url);
};

CSInterface.prototype.getExtensions = function(extensionIds) {
    var retVal = window.__adobe_cep__.getExtensions(extensionIds);
    return JSON.parse(retVal);
};

CSInterface.prototype.getNetworkPreferences = function() {
    var retVal = window.__adobe_cep__.getNetworkPreferences();
    return JSON.parse(retVal);
};

CSInterface.prototype.initResourceBundle = function() {
    var retVal = window.__adobe_cep__.initResourceBundle();
    return JSON.parse(retVal);
};

CSInterface.prototype.registerKeyEventsInterest = function(keyEventsInterest) {
    return window.__adobe_cep__.registerKeyEventsInterest(keyEventsInterest);
};

CSInterface.prototype.setContextMenu = function(menu, callback) {
    window.__adobe_cep__.invokeAsync("setContextMenu", menu, callback);
};

CSInterface.prototype.setContextMenuByJSON = function(menu, callback) {
    window.__adobe_cep__.invokeAsync("setContextMenuByJSON", menu, callback);
};

CSInterface.prototype.updateContextMenuItem = function(menuItemID, enabled, checked) {
    window.__adobe_cep__.invokeSync("updateContextMenuItem", JSON.stringify({menuItemID: menuItemID, enabled: enabled, checked: checked}));
};

CSInterface.prototype.isWindowVisible = function() {
    return window.__adobe_cep__.invokeSync("isWindowVisible", "");
};

CSInterface.prototype.resizeContent = function(width, height) {
    window.__adobe_cep__.resizeContent(width, height);
};

CSInterface.prototype.registerInvalidCertificateCallback = function(callback) {
    return window.__adobe_cep__.registerInvalidCertificateCallback(callback);
};

CSInterface.prototype.launchApplication = function(path, params) {
    window.__adobe_cep__.launchApplication(path, params);
};

// SystemPath 常量
CSInterface.prototype.SYSTEM_PATH = {
    USER_DATA: "userData",
    COMMON_FILES: "commonFiles",
    MY_DOCUMENTS: "myDocuments",
    APPLICATION: "application",
    EXTENSION: "extension",
    HOST_APPLICATION: "hostApplication"
};

// 主题颜色相关
CSInterface.prototype.getHostTheme = function() {
    return JSON.parse(window.__adobe_cep__.getHostEnvironment()).appSkinInfo;
};

// 事件类
function CSEvent(type, scope, appId, extensionId) {
    this.type = type;
    this.scope = scope;
    this.appId = appId;
    this.extensionId = extensionId;
}

// 导出（兼容不同环境）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CSInterface;
}
