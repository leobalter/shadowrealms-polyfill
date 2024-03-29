module.exports = function (config) {
    config.set({
        basePath: '',
        frameworks: ['qunit'],
        files: ['src/index.js', 'test/browser/index.js', { pattern: 'test/browser/module.js', type: 'module' }],
        preprocessors: {
            'src/index.js': ['eslint'],
            'test/browser/**/*.js': ['eslint']
        },
        reporters: ['progress', 'summary'],
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
