const path = require('path');

const basePath = path.resolve(__dirname, './');

module.exports = function (config) {
    config.set({
        basePath: '',
        frameworks: ['qunit'],
        files: ['src/index.js', 'test/index.js', { pattern: 'test/module.js', type: 'module' }],
        preprocessors: {
            'src/index.js': ['coverage', 'eslint'],
            'test/**/*.js': ['eslint']
        },
        reporters: ['progress', 'coverage', 'summary'],
        summaryReporter: {
            show: 'all',
            specLength: 100,
            overviewColumn: true
        },
        port: 9876,
        colors: true,
        logLevel: config.LOG_INFO,
        autoWatch: true,
        browsers: ['ChromeHeadless'],
        singleRun: false,
        concurrency: Infinity,
        babelPreprocessor: {
            filename: ({ originalPath }) => originalPath.replace(/\.js$/, '.es5.js'),
            sourceFileName: ({ originalPath }) => originalPath
        }
    });
};
