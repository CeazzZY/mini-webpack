const validateSchema = require("./validateSchema");
const Compiler = require("./Compiler");
const NodeEnvironmentPlugin = require("./node/NodeEnvironmentPlugin");
const WebpackOptionsApply = require("./WebpackOptionsApply");

const webpack = (options) => {
  const webpackOptionsValidationError = validateSchema(options);

  if (webpackOptionsValidationError.length) {
    throw new Error();
  }

  let compiler = new Compiler(options.context);
  compiler.options = options;

  //让compiler可以读写文件
  new NodeEnvironmentPlugin().apply(compiler);

  //挂载配置文件里提供的所有的plugins
  if (options.plugins && Array.isArray(options.plugins)) {
    for (const plugins of options.plugins) {
      plugins.apply(compiler);
    }
  }

  new WebpackOptionsApply().process(options, compiler);
  return compiler;
};

exports = module.exports = webpack;
