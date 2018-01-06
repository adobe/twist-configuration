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

/* global describe, it */

const path = require('path');
const assert = require('assert');
const babel = require('babel-core');

const TwistConfiguration = require('../src/TwistConfiguration');

describe('TwistConfiguration', () => {

    it('should be able to load node configuration and get default plugins', () => {

        var config = new TwistConfiguration('node', { root: null });
        assert.equal(config.getOption('includeBabelRuntime'), false);
        assert.equal(config.getOption('transformImports'), true);
        assert.equal(config.getOption('useBabelModuleResolver'), true);
        assert.deepEqual(config.getOption('targets'), { node: 'current' });

        let options = config.babelOptions;
        assert.equal(options.plugins.length, 8);
    });

    it('should be able to pass in options to configuration', () => {
        var config = new TwistConfiguration('node', { root: null, includeBabelRuntime: true });
        assert.equal(config.getOption('includeBabelRuntime'), true);
    });

    it('loads node configuration with no arguments', () => {
        var config = new TwistConfiguration(undefined, { root: null });
        assert.equal(config.context, 'node');
    });

    it('should be able to add load a .twistrc configuration with decorators/components', () => {
        var config = new TwistConfiguration('node', { root: path.join(__dirname, 'testLibrary1') });

        assert.deepEqual(config.decorators.Store, {
            module: '@twist/core',
            export: 'Store',
            inherits: {
                module: '@twist/core',
                export: 'BaseStore'
            }
        });
        assert.deepEqual(config.components['my:component'], {
            module: '@twist/core',
            export: 'MyComponent'
        });

        // Should be present as auto imports in twistOptions too:
        let twistOptions = config.twistOptions;
        assert.deepEqual(twistOptions.autoImport, Object.assign({}, config.decorators, config.components));

        // Should add an override for inherits:
        assert(/src\/third_party\/inherits/.test(twistOptions.aliases['babel-runtime/helpers/inherits']));
        assert.equal(twistOptions.aliases['test-library1'], path.join(__dirname, 'testLibrary1'));
    });

    it('should be able to add load a .twistrc.js configuration with decorators/components', () => {
        var config = new TwistConfiguration('node', { root: path.join(__dirname, 'testLibrary2') });

        assert.deepEqual(config.decorators.Store, {
            module: '@twist/core',
            export: 'Store',
            inherits: {
                module: '@twist/core',
                export: 'BaseStore'
            }
        });
        assert.deepEqual(config.components['default:component'], {
            module: '@twist/core',
            export: 'MyComponent'
        });

        // Should be present as auto imports in twistOptions too:
        let twistOptions = config.twistOptions;
        assert.deepEqual(twistOptions.autoImport, Object.assign({}, config.decorators, config.components));
    });

    it('should be able to add load a .twistrc configuration with implicit decorator module/export', () => {
        var config = new TwistConfiguration('node', { root: path.join(__dirname, 'testLibrary3') });

        assert.deepEqual(config.decorators, {
            Decorator1: { module: 'test-library3', export: 'Decorator1' },
            Decorator2: { module: '@twist/test', export: 'Decorator2' },
            Decorator3: { module: '@twist/test', export: 'Dec' },
            Decorator4: { module: 'test-library3', export: 'Decorator4', inherits: { module: 'test-library3', export: 'BaseClass' } },
            Decorator5: { module: 'test-library3', export: 'Decorator5', inherits: { module: '@twist/test', export: 'BaseClass' } }
        });
    });

    it('should be able to add load a .twistrc configuration with babel plugins', () => {
        var config = new TwistConfiguration('node', { root: path.join(__dirname, 'testLibrary3') });

        assert.deepEqual(config.twistOptions.plugins, [
            [ 'plugin1', {} ],
            [ 'plugin2', { option: true } ]
        ]);
    });

    it('should be able to add load a .twistrc configuration with options', () => {
        // No context options
        var config = new TwistConfiguration('node', { root: path.join(__dirname, 'testLibrary3') });
        assert.equal(config.getOption('polyfill'), 42);
        assert.equal(config.getOption('regenerator'), false);

        // Context options (for the webpack context) should override
        config = new TwistConfiguration('webpack', { root: path.join(__dirname, 'testLibrary3') });
        assert.equal(config.getOption('polyfill'), 1024);
        assert.equal(config.getOption('regenerator'), 'hello');
    });

    it('should be able to add load a .twistrc configuration that loads other libraries', () => {
        var config = new TwistConfiguration('node', { root: path.join(__dirname, 'testLibrary4') });

        assert.deepEqual(config.components, {
            'another:component': {
                export: 'MyComponent',
                module: '@twist/core'
            },
            'my:component': {
                export: 'OverriddenComponent',
                module: 'my-module'
            }
        });
    });

    it('transforms async without the regenerator transform by default', () => {
        var config = new TwistConfiguration('webpack', {
            root: null,
            targets: { browsers: 'IE 9' },
            includeBabelRuntime: true
        });
        assert.equal(babel.transform(`
        async function foo() {
            await Promise.resolve();
        }
        `, config.babelOptions).code.trim(), `
"use strict";

var _promise = require("babel-runtime/core-js/promise");

var _promise2 = _interopRequireDefault(_promise);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function foo() {
    return new Promise(function ($return, $error) {
        return Promise.resolve(_promise2.default.resolve()).then(function ($await_1) {
            try {
                return $return();
            } catch ($boundEx) {
                return $error($boundEx);
            }
        }.bind(this), $error);
    }.bind(this));
}
        `.trim());
    });

    it('transforms async with the regenerator transform if necessary', () => {
        var config = new TwistConfiguration('node', {
            root: null,
            targets: { browsers: 'IE 9' },
            includeBabelRuntime: true,
            regenerator: true
        });
        let code = babel.transform(`
        async function foo() {
            await Promise.resolve();
        }
        `, config.babelOptions).code;

        assert(code.indexOf('require("babel-runtime/regenerator");') !== -1);
    });

});
