module.exports = function(grunt) {

  grunt.initConfig({

    jshint: {
      files: ["lscache.js", "./tests/tests.js"],
    },
    uglify: {
      dist: {
        src: ["lscache.js"],
        dest: "lscache.min.js"
      }
    },
    bump: {
      options: {
        files: ['package.json', 'bower.json'],
        commitMessage: 'Release %VERSION%',
        commitFiles: ['-a'],
        tagName: '%VERSION%',
        push: false
      }
    },
    browserify: {
      app: {
        src: ["./tests/tests.js"],
        dest: "./tests/tests-cjs.js",
        options: {
          shim: {
            qunit: {
              path: "./tests/qunit.js",
              exports: 'qunit'
            }
          }
        }
      }
    }
  });

  grunt.loadNpmTasks("grunt-contrib-uglify");
  grunt.loadNpmTasks("grunt-contrib-jshint");
  grunt.loadNpmTasks('grunt-bump');
  grunt.loadNpmTasks('grunt-browserify');

  grunt.registerTask("default", ["jshint", "uglify", "browserify"]);

};
