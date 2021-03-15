module.exports = function (config) {
    config.set({
        basePath: '',
        frameworks: ['qunit'],
        files: ['src/**/*.js', 'test/**/*.js'],
        preprocessors: {
            'src/**/*.js': ['eslint', 'babel'],
            'test/**/*.js': ['eslint', 'babel']
        },
        reporters: ['progress', 'coverage'],
        port: 9876,
        colors: true,
        logLevel: config.LOG_INFO,
        autoWatch: true,
        browsers: ['ChromeHeadless', 'FirefoxHeadless', 'Safari'],
        singleRun: false,
        concurrency: Infinity,
        plugins: ['karma-*', '@onslip/karma-safari-launcher'],
        babelPreprocessor: {
            filename: ({ originalPath }) => originalPath.replace(/\.js$/, '.es5.js'),
            sourceFileName: ({ originalPath }) => originalPath
        }
    });
};
