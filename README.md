# Twist Configuration

[![Build Status](https://travis-ci.org/adobe/twist-configuration.svg?branch=master)](https://travis-ci.org/adobe/twist-configuration)

Configuration of [Twist](http://github.com/adobe/twist) repos - this reads the configuration from `.twistrc`. This is used for configuring Babel.

## Usage

> Note: Most users will not use `@twist/configuration` directly, but will instead include a plugin for the build system and framework that they're targeting - for example `@twist/react-webpack-plugin`. This internally uses Twist configuration.

Usage with Babel:

```js
let TwistConfiguration = require('@twist/configuration');
var config = new TwistConfiguration('node', options);

babel.transform(code, config.babelOptions);
```

By default, `TwistConfiguration` will read the options in the `.twistrc` file in the current working directory (or `.twistrc.js` if it's a JavaScript file). You can specify a different location via the `root` option. Any options you pass in override the `.twistrc` options.


## Options

TODO

## About Twist

[Twist](http://github.com/adobe/twist) is a state-management library for JavaScript applications. It's influenced by [Redux](http://redux.js.org/) and [MobX](https://github.com/mobxjs/mobx), which are two of the popular state-management libraries for React.
