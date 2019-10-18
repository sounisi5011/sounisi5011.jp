module.exports = {
  "parser": "postcss-scss", 
  "map": {
    "inline": false
  }, 
  "plugins": [
    require("@csstools/postcss-sass")({
      includePaths: [
        'node_modules'
      ],
    }),
    require("autoprefixer")({
      "remove": false
    }),
    require("postcss-clean")({
      "level": 2
    })
  ]
};
