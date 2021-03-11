module.exports = function(config) {
  config.set({
    basePath: '',
    frameworks: ['qunit'],
    files: [
      'src/**/*.js',
      'test/**/*.js'
    ],
    exclude: [
      'src/*-example.js'
    ],
    preprocessors: {
      'src/**/*.js': ['coverage']
    },
    reporters: ['progress', 'coverage'],
    port: 9876,
    colors: true,
    logLevel: config.LOG_INFO,
    autoWatch: true,
    browsers: ['ChromeHeadless'], // , 'Firefox', 'Safari'],
    singleRun: false,
    concurrency: Infinity,
    converageReporter: {
      // reporters: ['html', 'text-summary'],
      type: 'text',
      dir: 'coverage/',
      file: 'coverage.txt'
    }
  });
};
