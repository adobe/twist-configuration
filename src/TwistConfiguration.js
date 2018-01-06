/*
 *  Copyright 2016 Adobe Systems Incorporated. All rights reserved.
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

const BabelConfig = require('./internal/BabelConfig');
const LibraryLoader = require('./internal/LibraryLoader');

const DEFAULT_OPTIONS = {
    includeBabelRuntime: false,
    jsxSourceLines: false,

    polyfill: true,
    regenerator: false,
    targets: { node: 'current' },
    transformImports: true,
    useBabelModuleResolver: true,
};

module.exports = class TwistConfiguration {

    /**
     * Create a Twist configuration. A "contextName" describes the specific context in which this configuration is
     * being applied, such as "node" or "webpack". The default context is "node"; other build systems
     * (like a webpack plugin) may subclass this configuration and provide additional functionality;
     * libraries should switch on `this.context` to decide how to add any plugins/loaders as necessary.
     *
     * @param {string} [contextName]
     * @param {object} [options]
     * @param {object} [env]
     */
    constructor(contextName, options = {}) {
        this.context = contextName || 'node';

        // The options that you can configure (these are the default options below):
        this._options = Object.assign({}, DEFAULT_OPTIONS, options);

        // Twist compiler settings
        this._components = {};
        this._decorators = {};

        /** @property {Array<[ BabelModule, object ]>} */
        this._babelPlugins = [];

        // Path aliases (e.g. mapping an alias to a folder)
        this._pathAliases = {
            'babel-runtime/helpers/inherits': require.resolve('./third_party/inherits')
        };

        this._libraryLoader = new LibraryLoader(this);
        if (options.root !== null) {
            this.addLibrary(options.root || process.cwd());
        }
    }

    /**
     * Get the current library. If not within a library (i.e. not inside an addLibrary() call), returns a
     * root library that has `parentLibrary` set to null.
     * @return {LibraryInfo}
     */
    get currentLibrary() {
        return this._libraryLoader.currentLibrary;
    }

    /**
     * Get the locations on disk of the loaded libraries.
     * @return {Object} A mapping from library name to path.
     */
    get libraryLocations() {
        let libraries = {};
        this._libraryLoader.libraryInfos.forEach(library => {
            libraries[library.name] = library.path;
        });
        return libraries;
    }

    /**
     * Utility for array entries in .twistrc - we support either:
     * * A map of key-value pairs
     * * An array of [key, value] entries
     *
     * If it's an array, we'll skip over any undefined values
     *
     * @param {Array|Object} config An array or map of items to add
     * @param {function} callback Method to apply to each entry
     */
    _forEachConfig(config, callback) {
        if (Array.isArray(config)) {
            config.forEach(entry => {
                if (!entry) {
                    return;
                }
                if (Array.isArray(entry)) {
                    callback(entry[0], entry[1] || {});
                }
                else {
                    callback(entry, {});
                }
            });
        }
        else if (config && typeof config === 'object') {
            Object.keys(config).forEach(key => {
                callback(key, config[key]);
            });
        }
    }

    /**
     * Adds a .twistrc configuration to the Twist configuration
     * This shouldn't be called directly - it's called as a consequence of _libraryLoader.load().
     *
     * @param {Object} config The configuration from the .twistrc file
     */
    mergeConfig(config = {}) {

        // Add sub-libraries first
        this._forEachConfig(config.libraries, this.addLibrary.bind(this));

        // Decorators
        this._forEachConfig(config.decorators, (name, config) => {
            config.module = config.module || this.currentLibrary.name;
            config.export = config.export || name;
            if (config.inherits) {
                config.inherits = typeof config.inherits === 'string' ? { export: config.inherits } : config.inherits;
                config.inherits.module = config.inherits.module || this.currentLibrary.name;
            }
            this.addDecorator(name, config);
        });

        // Components
        this._forEachConfig(config.components, (name, config) => {
            config.module = config.module || this.currentLibrary.name;
            config.export = config.export || name;
            this.addComponent(name, config);
        });

        // Babel plugins
        this._forEachConfig(config.babelPlugins, this.addBabelPlugin.bind(this));

        // Options
        this._forEachConfig(config.options, this.setOption.bind(this));

        // Contextual configuration - if you've provided additional configuration under context[contextname],
        // we'll add that too (e.g. additional options only for a webpack environment).
        if (config.context) {
            this.mergeConfig(config.context[this.context]);
        }
    }

    /**
     * Add more Twist libraries to the configuration, using this method. e.g. `config.addLibrary('@twist/module');`
     * This allows the given library to add to the configuration (e.g. defining new decorators/components). This loads
     * the .twistrc file of the library, and adds it to the configuration.
     *
     * @param {string} library The npm name of the library to add (passes in the configuration to `library/config.js`)
     * @param {Object|value} [options] Options to pass to the library
     */
    addLibrary(library, options) {
        this._libraryLoader.load(library, options);
        return this;
    }

    /**
     * Add a custom Babel plugin.
     *
     * @param {BabelPlugin|string} plugin
     * @param {object} [options]
     */
    addBabelPlugin(plugin, options) {
        // Don't add a plugin more than once.
        if (this._babelPlugins.find(item => item[0] === plugin)) {
            return;
        }
        this._babelPlugins.push([ plugin, options ]);
        return this;
    }

    /**
     * Set an option in the Twist configuration. Supported options are:
     *
     * includeBabelRuntime      [true]      Include Babel runtime.
     * polyfill                 [true]      Include Babel polyfill (if including Babel runtime).
     * regenerator              [false]     Include Babel regenerator (if including Babel runtime).
     * targets                  [undefined] A babel-preset-env `targets` configuration, e.g. `{ browsers: 'last 2 versions' }`.
     * transformImports         [false]     Transforms imports to CommonJS requires.
     * useBabelModuleResolver   [false]     Use the Babel module resolver to resolve imports.
     *
     * @param {string} name
     * @param {string|number|Boolean} value
     */
    setOption(name, value) {
        if (!this._options.hasOwnProperty(name)) {
            throw new Error('Twist Configuration option ' + name + ' is not defined.');
        }
        this._options[name] = value;
        return this;
    }

    /**
     * Get the value of an option in the Twist configuration.
     *
     * @param {string} name
     * @return {string|number|Boolean}
     */
    getOption(name) {
        return this._options[name];
    }

    /**
     * Add a global component to the Twist compiler configuration
     * @param {string} name
     * @param {Object} config
     */
    addComponent(name, config) {
        this._components[name] = config;
        return this;
    }

    /**
     * Add a decorator to the Twist compiler configuration
     * @param {string} name
     * @param {Object} config
     */
    addDecorator(name, config) {
        this._decorators[name] = config;
        return this;
    }

    /**
     * The configured components
     */
    get components() {
        return this._components;
    }

    /**
     * The configured decorators
     */
    get decorators() {
        return this._decorators;
    }

    /**
     * The complete Twist configuration options
     */
    get twistOptions() {
        const aliases = Object.assign({}, this.libraryLocations, this._pathAliases);
        const autoImport = Object.assign({}, this._decorators, this._components);
        const plugins = this._babelPlugins.slice();

        return Object.assign({}, this._options, {
            aliases,
            autoImport,
            plugins
        });
    }

    /**
     * The configuration of Babel (options passed via .babelrc, or to the webpack babel-loader).
     */
    get babelOptions() {
        return BabelConfig.build(this.twistOptions);
    }
};
