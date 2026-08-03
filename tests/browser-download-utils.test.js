'use strict';

const assert = require('assert');
const utils = require('../js/browser-download-utils.js');

function testRegistryValueParsing() {
    const output = [
        '',
        'HKEY_CLASSES_ROOT\\https\\shell\\open\\command',
        '    (Default)    REG_SZ    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" "%1"',
        ''
    ].join('\r\n');

    assert.strictEqual(
        utils.extractRegistryString(output),
        '"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" "%1"'
    );
}

function testBrowserIdentification() {
    assert.deepStrictEqual(
        utils.identifyBrowser('"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" "%1"'),
        { id: 'edge', name: 'Microsoft Edge' }
    );
    assert.deepStrictEqual(
        utils.identifyBrowser('"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --single-argument %1'),
        { id: 'chrome', name: 'Google Chrome' }
    );
    assert.deepStrictEqual(
        utils.identifyBrowser('"C:\\Program Files\\Mozilla Firefox\\firefox.exe" -osint -url "%1"'),
        { id: 'firefox', name: 'Mozilla Firefox' }
    );
    assert.deepStrictEqual(
        utils.identifyBrowser('"C:\\Users\\tester\\AppData\\Local\\Programs\\Quark\\quark.exe" --single-argument %1'),
        { id: 'quark', name: '夸克浏览器' }
    );
    assert.deepStrictEqual(
        utils.identifyBrowser('"C:\\Program Files\\Zen Browser\\zen.exe" -osint -url "%1"'),
        { id: 'zen', name: 'Zen Browser' }
    );
    assert.strictEqual(
        utils.extractExecutablePath('"C:\\Program Files\\Mozilla Firefox\\firefox.exe" -osint -url "%1"'),
        'C:\\Program Files\\Mozilla Firefox\\firefox.exe'
    );
    assert.strictEqual(
        utils.extractExecutablePath('C:\\Portable\\Firefox\\firefox.exe -url "%1"'),
        'C:\\Portable\\Firefox\\firefox.exe'
    );
    assert.strictEqual(utils.identifyBrowser('unknown-browser.exe "%1"'), null);
}

function testChromiumPreferences() {
    assert.strictEqual(
        utils.parseChromiumLastUsed('{"profile":{"last_used":"Profile 2"}}'),
        'Profile 2'
    );
    assert.strictEqual(utils.parseChromiumLastUsed('{}'), 'Default');
    assert.strictEqual(
        utils.parseChromiumDownloadDirectory('{"download":{"default_directory":"E:\\\\AI插件导入图片"}}'),
        'E:\\AI插件导入图片'
    );
    assert.strictEqual(
        utils.parseChromiumDownloadDirectory('{"savefile":{"default_directory":"D:\\\\Saved"}}'),
        'D:\\Saved'
    );
}

function testFirefoxProfileAndDirectoryParsing() {
    const profilesIni = [
        '[Profile0]',
        'Name=default-release',
        'IsRelative=1',
        'Path=Profiles/abc.default-release',
        'Default=1',
        '',
        '[Profile1]',
        'Name=other',
        'IsRelative=1',
        'Path=Profiles/other'
    ].join('\n');
    const installsIni = [
        '[Install308046B0AF4A39CB]',
        'Default=Profiles/other',
        'Locked=1'
    ].join('\n');
    const profile = utils.parseFirefoxProfilesIni(profilesIni, installsIni);

    assert.deepStrictEqual(profile, {
        path: 'Profiles/other',
        isRelative: true
    }, 'Firefox installation-specific default must override the legacy profile default');

    const multipleInstallsIni = [
        '[InstallFIRST]',
        'Default=Profiles/other',
        'Locked=1',
        '',
        '[InstallSECOND]',
        'Default=Profiles/abc.default-release',
        'Locked=1'
    ].join('\n');
    const installMatchedProfile = utils.parseFirefoxProfilesIni(
        profilesIni,
        multipleInstallsIni,
        {
            installDirectory: 'C:\\Program Files\\Mozilla Firefox',
            compatibilityByProfile: {
                'Profiles/other': [
                    '[Compatibility]',
                    'LastAppDir=C:\\Program Files\\Firefox Developer Edition\\browser'
                ].join('\n'),
                'Profiles/abc.default-release': [
                    '[Compatibility]',
                    'LastAppDir=C:\\Program Files\\Mozilla Firefox\\browser'
                ].join('\n')
            }
        }
    );
    assert.deepStrictEqual(installMatchedProfile, {
        path: 'Profiles/abc.default-release',
        isRelative: true
    }, 'Firefox must select the profile whose compatibility.ini matches the default browser installation');
    assert.strictEqual(
        utils.parseFirefoxProfilesIni(
            profilesIni,
            multipleInstallsIni,
            {
                installDirectory: 'C:\\Program Files\\Unknown Firefox',
                compatibilityByProfile: {}
            }
        ),
        null,
        'Firefox must not guess a legacy profile when multiple install profiles cannot be matched'
    );
    assert.strictEqual(
        utils.parseFirefoxDownloadDirectory([
            'user_pref("browser.download.folderList", 2);',
            'user_pref("browser.download.dir", "E:\\\\AI插件导入图片");'
        ].join('\n')),
        'E:\\AI插件导入图片'
    );
    assert.strictEqual(
        utils.parseFirefoxDownloadDirectory([
            'user_pref("browser.download.folderList", 1);',
            'user_pref("browser.download.dir", "E:\\\\StaleCustomPath");'
        ].join('\n')),
        '',
        'Firefox must ignore a stale custom path when Downloads is selected'
    );
    assert.strictEqual(
        utils.parseFirefoxDownloadDirectory(
            'user_pref("browser.download.dir", "E:\\\\StaleCustomPath");'
        ),
        '',
        'Firefox must not reuse a stale custom path when folderList is absent'
    );
}

function testEnvironmentExpansion() {
    assert.strictEqual(
        utils.expandEnvironmentVariables('%USERPROFILE%\\Downloads', {
            USERPROFILE: 'C:\\Users\\tester'
        }),
        'C:\\Users\\tester\\Downloads'
    );
    assert.strictEqual(
        utils.expandEnvironmentVariables('%userprofile%\\Downloads', {
            USERPROFILE: 'C:\\Users\\tester'
        }),
        'C:\\Users\\tester\\Downloads'
    );
}

testRegistryValueParsing();
testBrowserIdentification();
testChromiumPreferences();
testFirefoxProfileAndDirectoryParsing();
testEnvironmentExpansion();

console.log('browser-download-utils: all assertions passed');
