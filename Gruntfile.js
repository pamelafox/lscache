module.exports = function(grunt) {

  grunt.initConfig({

    jshint: {
      files: ["lscache.js"],
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
    }
  });

  grunt.loadNpmTasks("grunt-contrib-uglify");
  grunt.loadNpmTasks("grunt-contrib-jshint");
  grunt.loadNpmTasks('grunt-bump');

  grunt.registerTask("default", ["jshint", "uglify"]);

};
