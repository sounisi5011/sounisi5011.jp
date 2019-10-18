module.exports = {
  "parser": "postcss-scss", 
  "map": {
    "inline": false
  }, 
  "plugins": [
    require("@csstools/postcss-sass")({
      importer: require('node-sass-package-importer')(),
    }),
    require("autoprefixer")({
      "remove": false
    }),
    require("postcss-clean")({
      "level": 2
    })
  ]
};
