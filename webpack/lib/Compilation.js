const { SyncHook } = require("tapable");
const path = require("path");
const NormalModuleFactory = require("./NormalModuleFactory");
const normalModuleFactory = new NormalModuleFactory();
const Parser = require("./Parser");
const parser = new Parser();
const async = require("neo-async");

class Compilation {
  constructor(compiler) {
    this.compiler = compiler;
    this.options = compiler.options;
    this.context = compiler.context;
    this.inputFileSystem = compiler.inputFileSystem;
    this.outputFileSystem = compiler.outputFileSystem;
    this.entries = [];
    this.modules = [];
    this._module = {};
    this.hooks = {
      succeedModule: new SyncHook(["module"]),
    };
  }

  addEntry(context, entry, name, finalCallback) {
    this._addModuleChain(context, entry, name, (err, module) => {
      finalCallback(err, module);
    });
  }

  _addModuleChain(context, rawRequest, name, callback) {
    this.createModule(
      {
        name,
        context,
        rawRequest,
        parser,
        resource: path.posix.join(context, rawRequest),
        moduleId:
          "./" +
          path.posix.relative(context, path.posix.join(context, rawRequest)),
        async,
      },
      (entryModule) => this.entries.push(entryModule),
      callback
    );
  }

  processModuleDependencies(module, callback) {
    let dependencies = module.dependencies;

    async.forEach(
      dependencies,
      (dependency, done) => {
        let { name, context, rawRequest, resource, moduleId } = dependency;
        this.createModule(
          {
            name,
            context,
            rawRequest,
            parser,
            resource,
            moduleId,
          },
          null,
          done
        );
      },
      callback
    );
  }

  createModule(data, addEntry, callback) {
    let module = normalModuleFactory.create(data);
    addEntry && addEntry(module);
    this.modules.push(module);
    this._modules[module.moduleId] = module;
    const afterBuild = (err, module) => {
      if (module.dependencies.length > 0) {
        this.processModuleDependencies(module, (err) => {
          callback(err, module);
        });
      } else {
        callback(err, module);
      }
    };
    this.buildModule(module, afterBuild);
  }

  buildModule(module, afterBuild) {
    module.build(this, (err) => {
      this.hooks.succeedModule.call(module);
      afterBuild(err, module);
    });
  }
}

module.exports = Compilation;
