/**
 * Hbird Bridge - browser download directory parsing utilities
 * UMD module: available as window.HbirdBridgeBrowserDownloadUtils and module.exports.
 */
(function(root, factory) {
    const api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }

    root.HbirdBridgeBrowserDownloadUtils = api;
})(typeof self !== 'undefined' ? self : this, function() {
    'use strict';

    function extractRegistryString(output) {
        const match = String(output || '').match(/REG_(?:EXPAND_)?SZ\s+(.+?)\s*$/mi);
        return match ? match[1].trim() : '';
    }

    function identifyBrowser(command) {
        const normalized = String(command || '').toLowerCase();
        const browsers = [
            { pattern: 'msedge.exe', id: 'edge', name: 'Microsoft Edge' },
            { pattern: 'brave.exe', id: 'brave', name: 'Brave' },
            { pattern: 'vivaldi.exe', id: 'vivaldi', name: 'Vivaldi' },
            { pattern: 'opera.exe', id: 'opera', name: 'Opera' },
            { pattern: 'firefox.exe', id: 'firefox', name: 'Mozilla Firefox' },
            { pattern: 'zen.exe', id: 'zen', name: 'Zen Browser' },
            { pattern: 'quark.exe', id: 'quark', name: '夸克浏览器' },
            { pattern: 'chrome.exe', id: 'chrome', name: 'Google Chrome' }
        ];

        for (const browser of browsers) {
            if (normalized.includes(browser.pattern)) {
                return { id: browser.id, name: browser.name };
            }
        }
        return null;
    }

    function extractExecutablePath(command) {
        const source = String(command || '').trim();
        const quotedMatch = source.match(/^"([^"]+\.exe)"/i);
        if (quotedMatch) return quotedMatch[1];

        const unquotedMatch = source.match(/^(.+?\.exe)(?:\s|$)/i);
        return unquotedMatch ? unquotedMatch[1].trim() : '';
    }

    function parseJson(text) {
        try {
            return JSON.parse(String(text || ''));
        } catch (error) {
            return null;
        }
    }

    function parseChromiumLastUsed(localStateText) {
        const localState = parseJson(localStateText);
        if (localState && localState.profile && typeof localState.profile.last_used === 'string') {
            return localState.profile.last_used || 'Default';
        }
        return 'Default';
    }

    function parseChromiumDownloadDirectory(preferencesText) {
        const preferences = parseJson(preferencesText);
        if (!preferences) return '';

        if (preferences.download && typeof preferences.download.default_directory === 'string') {
            return preferences.download.default_directory;
        }
        if (preferences.savefile && typeof preferences.savefile.default_directory === 'string') {
            return preferences.savefile.default_directory;
        }
        return '';
    }

    function parseIniSections(text) {
        const sections = [];
        let current = null;

        String(text || '').split(/\r?\n/).forEach(rawLine => {
            const line = rawLine.trim();
            if (!line || line.charAt(0) === ';' || line.charAt(0) === '#') return;

            const sectionMatch = line.match(/^\[([^\]]+)\]$/);
            if (sectionMatch) {
                current = { name: sectionMatch[1], values: {} };
                sections.push(current);
                return;
            }

            if (!current) return;
            const separatorIndex = line.indexOf('=');
            if (separatorIndex < 0) return;
            current.values[line.slice(0, separatorIndex).trim()] = line.slice(separatorIndex + 1).trim();
        });

        return sections;
    }

    function normalizeFirefoxProfilePath(profilePath) {
        return String(profilePath || '').replace(/\\/g, '/').replace(/^\.?\//, '').toLowerCase();
    }

    function listFirefoxProfileCandidates(text, installsText) {
        const profileSections = parseIniSections(text);
        const installSections = parseIniSections(installsText).concat(
            profileSections.filter(section => /^Install/i.test(section.name))
        );
        const profiles = profileSections.filter(section => /^Profile\d+$/i.test(section.name));
        const seenPaths = {};
        const candidates = [];

        installSections.forEach(section => {
            if (!section.values.Default) return;
            const normalizedDefault = normalizeFirefoxProfilePath(section.values.Default);
            if (seenPaths[normalizedDefault]) return;
            seenPaths[normalizedDefault] = true;
            const matchedProfile = profiles.find(section => {
                return normalizeFirefoxProfilePath(section.values.Path) === normalizedDefault;
            });
            candidates.push({
                path: section.values.Default,
                isRelative: matchedProfile ? matchedProfile.values.IsRelative !== '0' : true,
                locked: section.values.Locked === '1'
            });
        });

        return candidates;
    }

    function parseFirefoxCompatibilityInstallDirectory(text) {
        const compatibility = parseIniSections(text).find(section => {
            return section.name.toLowerCase() === 'compatibility';
        });
        return compatibility && compatibility.values.LastAppDir
            ? compatibility.values.LastAppDir
            : '';
    }

    function normalizeFirefoxInstallDirectory(directory) {
        return String(directory || '')
            .replace(/\\/g, '/')
            .replace(/\/+$/, '')
            .replace(/\/browser$/i, '')
            .toLowerCase();
    }

    function parseFirefoxProfilesIni(text, installsText, options) {
        const profileSections = parseIniSections(text);
        const profiles = profileSections.filter(section => /^Profile\d+$/i.test(section.name));
        const installationCandidates = listFirefoxProfileCandidates(text, installsText);
        const selectionOptions = options || {};
        const targetInstallDirectory = normalizeFirefoxInstallDirectory(
            selectionOptions.installDirectory
        );
        const compatibilityByProfile = selectionOptions.compatibilityByProfile || {};

        if (targetInstallDirectory) {
            const matchedInstallation = installationCandidates.find(candidate => {
                const normalizedCandidatePath = normalizeFirefoxProfilePath(candidate.path);
                const compatibilityText = Object.keys(compatibilityByProfile).reduce(
                    (found, profilePath) => {
                        if (found !== undefined) return found;
                        return normalizeFirefoxProfilePath(profilePath) === normalizedCandidatePath
                            ? compatibilityByProfile[profilePath]
                            : undefined;
                    },
                    undefined
                );
                const candidateInstallDirectory = normalizeFirefoxInstallDirectory(
                    parseFirefoxCompatibilityInstallDirectory(compatibilityText)
                );
                return candidateInstallDirectory &&
                    candidateInstallDirectory === targetInstallDirectory;
            });
            if (matchedInstallation) {
                return {
                    path: matchedInstallation.path,
                    isRelative: matchedInstallation.isRelative
                };
            }
        }

        if (installationCandidates.length === 1 || !targetInstallDirectory) {
            const installationDefault =
                installationCandidates.find(candidate => candidate.locked) ||
                installationCandidates[0];
            if (installationDefault) {
                return {
                    path: installationDefault.path,
                    isRelative: installationDefault.isRelative
                };
            }
        }

        if (targetInstallDirectory && installationCandidates.length > 1) {
            return null;
        }

        const selected = profiles.find(section => section.values.Default === '1') || profiles[0];
        if (!selected || !selected.values.Path) return null;

        return {
            path: selected.values.Path,
            isRelative: selected.values.IsRelative !== '0'
        };
    }

    function parseFirefoxDownloadDirectory(prefsText) {
        const source = String(prefsText || '');
        const folderListMatch = source.match(
            /user_pref\(\s*"browser\.download\.folderList"\s*,\s*(\d+)\s*\);/
        );
        if (!folderListMatch || Number(folderListMatch[1]) !== 2) {
            return '';
        }

        const match = source.match(
            /user_pref\(\s*"browser\.download\.dir"\s*,\s*"((?:\\.|[^"\\])*)"\s*\);/
        );
        if (!match) return '';

        try {
            return JSON.parse('"' + match[1] + '"');
        } catch (error) {
            return match[1].replace(/\\\\/g, '\\');
        }
    }

    function expandEnvironmentVariables(value, environment) {
        const env = environment || {};
        const envByUpperName = {};
        Object.keys(env).forEach(key => {
            envByUpperName[key.toUpperCase()] = env[key];
        });

        return String(value || '').replace(/%([^%]+)%/g, (fullMatch, name) => {
            const replacement = envByUpperName[String(name).toUpperCase()];
            return replacement === undefined ? fullMatch : replacement;
        });
    }

    return {
        extractRegistryString,
        identifyBrowser,
        extractExecutablePath,
        parseChromiumLastUsed,
        parseChromiumDownloadDirectory,
        listFirefoxProfileCandidates,
        parseFirefoxCompatibilityInstallDirectory,
        parseFirefoxProfilesIni,
        parseFirefoxDownloadDirectory,
        expandEnvironmentVariables
    };
});
