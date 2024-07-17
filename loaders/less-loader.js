let less = require("less");

module.exports = function (source) {
  let css;
  less.render(source, (err, output) => {
    this.callback(err, output.css);
  });
};
