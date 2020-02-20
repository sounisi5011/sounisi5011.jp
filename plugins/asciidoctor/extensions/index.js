const asciidoctorHtml5s = require('asciidoctor-html5s');

module.exports = [
  require('./ruby'),
  require('./spacing'),
  require('./fixed-anchor'),
  asciidoctorHtml5s.register,
];
