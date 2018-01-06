const path = require('path');

module.exports = {
    libraries: [
        path.join(__dirname, '..', 'testLibrary1'),
        [ path.join(__dirname, '..', 'testLibrary2'), { componentName: 'another:component' } ],
        path.join(__dirname, '..', 'testLibrary3')
    ],
    "components": [
        [ "my:component", {
            "module": "my-module",
            "export": "OverriddenComponent"
        } ]
    ]
};
