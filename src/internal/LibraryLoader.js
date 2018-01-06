/*
 *  Copyright 2017 Adobe Systems Incorporated. All rights reserved.
 *  This file is licensed to you under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License. You may obtain a copy
 *  of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software distributed under
 *  the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 *  OF ANY KIND, either express or implied. See the License for the specific language
 *  governing permissions and limitations under the License.
 *
 */

const path = require('path');
const fs = require('fs');
const stripJsonComments = require('strip-json-comments');

class LibraryInfo {

    constructor(libraryPath, options, parentLibrary) {
        this.path = libraryPath; // Absolute path to the library
        this.options = options;
        this.parentLibrary = parentLibrary;

        // Load other details from package.json
        // Note that this must exist, because that's how we resolve the library path!
        if (libraryPath) {
            let packageJson = JSON.parse(fs.readFileSync(path.join(libraryPath, 'package.json'), { encoding: 'utf8' }));
            this.name = packageJson.name;
            this.version = packageJson.version;
        }
    }

    /**
     * Return a string describing the list of libraries which loaded this library, much like a stack trace.
     */
    getLibraryChainStackTrace() {
        const stack = [];
        let parent = this;
        let indent = 4;
        let isFirstLine = true;
        while (parent) {
            let line = `${parent.name}${parent.version ? ' ' + parent.version : ''}`;
            let prefix = '';
            for (let i = 0; i < indent; i++) {
                prefix += ' ';
            }
            if (isFirstLine) {
                isFirstLine = false;
            }
            else {
                line = '└─ loaded by ' + line;
            }
            stack.push(prefix + line);
            indent += 2;
            parent = parent.parentLibrary;
        }
        return stack.join('\n');
    }
}

/**
 * LibraryLoader manages library loading, ensuring that multiple versions of the same library are not
 * loaded simultaneously. A library is an npm module with a root `.twistrc` file that contains a JSON configuration.
 * Alternatively, a `.twistrc.js` file can be supplied, which should export an object with the configuration.
 *
 * Libraries should place all their code in a `src` directory - this is used to enforce that the library only adds
 * loaders that are scoped to files contained within that package.
 */
module.exports = class LibraryLoader {

    constructor(config) {
        this.config = config;

        /**
         * All of the loaded libraries.
         * @member {LibraryInfo[]}
         */
        this.libraryInfos = [];
        /**
         * The current library being loaded.
         * @member {LibraryInfo}
         */
        this.currentLibrary = new LibraryInfo();
        this.currentLibrary.name = '(root)';
        this.currentLibrary.version = '';
    }

    /**
     * Add a library. Loads the .twistrc config for `libraryName`, and recursively loads any other libraries
     * referenced in the .twistrc config.
     *
     * Note that sub-libraries are loaded _before_ the rest of the .twistrc configuration is merged, so that
     * you can override the configuration of a given library.
     *
     * Calls `libraryFn(config, options)`. The `addPath` function should be called at least once
     * from within `libraryFn`, so that we can extract the path of the library.
     *
     * @param {string} libraryName The npm name of the library (or an absolute path to the root folder of the library)
     * @param {object} [options] Options to pass to .twistrc.js
     * @return {object} The Twist configuration of the library
     */
    load(libraryName, options = {}) {
        let libraryPath = LibraryLoader.getRootDir(libraryName);

        // Check if we already loaded the library; if so, nothing to do.
        if (this.libraryInfos.find(lib => lib.path === libraryPath && JSON.stringify(lib.options) === JSON.stringify(options))) {
            return;
        }

        // If we haven't already loaded a library with this path and options, load it now:
        let libraryInfo = new LibraryInfo(libraryPath, options, this.currentLibrary);
        this.libraryInfos.push(libraryInfo);
        this.currentLibrary = libraryInfo;

        // If the library we're loading has already been loaded with a different version, throw an error.
        const conflictLib = this.libraryInfos.find(lib => lib.name === libraryInfo.name && lib.version !== libraryInfo.version);
        if (conflictLib) {
            throw new Error(`You're trying to load ${this.currentLibrary.name} ${this.currentLibrary.version}, but `
                + `${conflictLib.name} ${conflictLib.version} was already loaded:\n\n`
                + this.currentLibrary.getLibraryChainStackTrace()
                + '\n\n'
                + conflictLib.getLibraryChainStackTrace() + '\n\n');
        }

        // Load the .twistrc configuration for the library
        let libraryConfig = this.loadConfigFile(options);
        if (libraryConfig) {
            this.config.mergeConfig(libraryConfig);
        }
        else {
            console.warn(`Failed to find .twistrc file for ${libraryName} - make sure that it has a configuration in its root`);
        }

        // Switch back to the parent library
        this.currentLibrary = libraryInfo.parentLibrary;
    }

    /**
     * Starting at `libraryPath`, walk the directory tree until a `package.json` is found.
     * If found, return the parsed version; otherwise return undefined.
     * @param {Object} [options]
     */
    loadConfigFile(options = {}) {

        // First, try .twistrc (JSON)
        let configFile = path.join(this.currentLibrary.path, '.twistrc');
        if (fs.existsSync(configFile)) {
            try {
                return JSON.parse(stripJsonComments(fs.readFileSync(configFile, { encoding: 'utf8' })));
            }
            catch (e) {
                throw new Error(`Invalid .twistrc file at ${configFile} - please ensure it is valid JSON`);
            }
        }

        // If there's no .twistrc file, try .twistrc.js (JavaScript)
        configFile = path.join(this.currentLibrary.path, '.twistrc.js');
        if (fs.existsSync(configFile)) {
            let library = require(configFile);
            library = library.default || library;

            if (typeof library === 'function') {
                // Pass the options to the library
                return library(options);
            }

            return library;
        }
    }

    /**
     * Get the path to the root dir of the library given its npm name
     * @param {string} libraryName
     * @return {string} Path to the root dir of the library
     * @private
     */
    static getRootDir(libraryName) {
        try {
            let packageJSONPath = require.resolve(libraryName + '/package.json');
            return path.normalize(path.dirname(packageJSONPath));
        }
        catch (e) {
            throw new Error(`Failed to resolve ${libraryName} - is it installed?`);
        }
    }
};
