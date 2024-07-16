const babylon = require("babylon");
class Parser {
  parse(source) {
    return babylon.parse(source, {
      sourceType: "module",
      plugins: ["dynamicImport"],
    });
  }

  traverse() {}
}
module.exports = Parser;
