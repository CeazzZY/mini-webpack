const path = require("path");
const types = require("babel-types");
const generate = require("babel-generator").default;
const traverse = require("babel-traverse").default;
const async = require("neo-async");


class NormalModule {
  constructor({ name, context, rawRequest, resource, parser, moduleId }) {
    this.name = name;
    this.context = context;
    this.rawRequest = rawRequest;
    this.resource = resource;
    this.parser = parser;
    this._resource;
    this._ast;
    this.dependencies = [];
    this.moduleId =
      moduleId ||
      "./" + path.posix.relative(context, path.posix.join(context, resource));
  }

  build(compilation, callback) {
    this.doBuild(compilation, (err) => {
      this._ast = this.parser.parse(this._source);

      traverse(this._ast, {
        CallExpression: (nodePath) => {
          let node = nodePath.node;
          if (node.callee.name === "require") {
            node.callee.name = "__webpack_require__";
            let moduleName = node.arguments[0].value;

            let depResource;

            if (moduleName.startsWith(".")) {
              //2.获得可能的扩展名
              let extName =
                moduleName.split(path.posix.sep).pop().indexOf(".") == -1
                  ? ".js"
                  : "";
              depResource = path.posix.join(
                path.posix.dirname(this.resource),
                moduleName + extName
              );
            } else {
              depResource = require.resolve(
                path.posix.join(this.context, "node_modules", moduleName)
              );
              depResource = depResource.replace(/\\/g, "/"); //把window里的 \转成 /
            }
            let depModuleId = "." + depResource.slice(this.context.length);

            node.arguments = [types.stringLiteral(depModuleId)];
            this.dependencies.push({
              name: this.name,
              context: this.context,
              rawRequest: moduleName,
              moduleId: depModuleId,
              resource: depResource,
            });
          } else if (types.isImport(node.callee)) {
            let moduleName = node.arguments[0].value;
            let extName =
              moduleName.split(path.posix.sep).pop().indexOf(".") == -1
                ? ".js"
                : "";
            let depResource = path.posix.join(
              path.posix.dirname(this.resource),
              moduleName + extName
            );
            let depModuleId =
              "./" + path.posix.relative(this.context, depResource);
            let chunkName = compilation.asyncChunkCounter++;
            if (
              Array.isArray(node.arguments[0].leadingComments) &&
              node.arguments[0].leadingComments.length > 0
            ) {
              let leadingComments = node.arguments[0].leadingComments[0].value;
              let regexp = /webpackChunkName:\s*['"]([^'"]+)['"]/;
              chunkName = leadingComments.match(regexp)[1];
            }
            nodePath.replaceWithSourceString(
              `__webpack_require__.e("${chunkName}").then(__webpack_require__.t.bind(null,"${depModuleId}", 7))`
            );
            this.blocks.push({
              context: this.context,
              entry: depModuleId,
              name: chunkName,
              async: true,
            });
          }
        },
      });
      let { code } = generate(this._ast);
      this._source = code;
      async.forEach(
        this.blocks,
        (block, done) => {
          let { context, entry, name, async } = block;
          compilation._addModuleChain(context, entry, name, async, done);
        },
        callback
      );
    });
  }

  doBuild(compilation, callback) {
    this.getSource(compilation, (err, source) => {
      //在这里把硬盘的内容读出来,读出来之后交给loadRunner进行转换
      let {
        module: { rules },
      } = compilation.options;
      let loaders = [];
      for (let i = 0; i < rules.length; i++) {
        let rule = rules[i];
        if (rule.test.test(this.resource)) {
          loaders.push(...rule.use);
        }
      }
      //loader的绝对路径的数组
      const resolveLoader = (loader) =>
        require.resolve(path.posix.join(this.context, "loaders", loader));
      loaders = loaders.map(resolveLoader);
      runLoaders(
        {
          resource: this.resource,
          loaders,
        },
        (err, { result }) => {
          this._source = result.toString();
          console.log(this._source);
          callback();
        }
      );
    });
  }

  getSource(compilation, callback) {
    compilation.inputFileSystem.readFile(this.resource, "utf8", callback);
  }
}

module.exports = NormalModule;
