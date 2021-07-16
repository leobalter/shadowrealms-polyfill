module.exports = function (config) {
    config.set({
        basePath: '',
        frameworks: ['qunit'],
        files: ['src/index.js', 'test/**/*.js'],
        preprocessors: {
            'src/index.js': ['coverage', 'eslint', 'babel'],
            'test/**/*.js': ['eslint', 'babel']
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
