const { SyncHook } = require("tapable");
const path = require("path");
const NormalModuleFactory = require("./NormalModuleFactory");
const normalModuleFactory = new NormalModuleFactory();
const Parser = require("./Parser");
const parser = new Parser();
const async = require("neo-async");
const ejs = require("ejs");
const fs = require("fs");
const Chunk = require("./Chunk");
const mainTemplate = fs.readFileSync(
  path.join(__dirname, "templates", "main.ejs"),
  "utf8"
);
const mainRender = ejs.compile(mainTemplate);

class Compilation {
  constructor(compiler) {
    this.compiler = compiler;
    this.options = compiler.options;
    this.context = compiler.context;
    this.inputFileSystem = compiler.inputFileSystem;
    this.outputFileSystem = compiler.outputFileSystem;
    this.entries = [];
    this.modules = [];
    this.chunks = [];
    this.files = [];
    this.assets = {};
    this.hooks = {
      succeedModule: new SyncHook(["module"]),
      seal: new SyncHook(),
      beforeChunks: new SyncHook(),
      afterChunks: new SyncHook(),
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

  createModule(data, addEntry, callback) {
    let module = normalModuleFactory.create(data);
    addEntry && addEntry(module);
    this.modules.push(module);
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

  buildModule(module, afterBuild) {
    module.build(this, (err) => {
      this.hooks.succeedModule.call(module);
      afterBuild(err, module);
    });
  }

  seal(callback) {
    this.hooks.seal.call();
    this.hooks.beforeChunks.call();

    for (const entryModule of this.entries) {
      const chunk = new Chunk(entryModule);
      this.chunks.push(chunk);
      chunk.modules = this.modules.filter(
        (module) => module.name === chunk.name
      );
    }

    this.hooks.afterChunks.call(this.chunks);
    this.createChunkAssets();
    callback();
  }

  createChunkAssets() {
    for (let i = 0; i < this.chunks.length; i++) {
      const chunk = this.chunks[i];
      const file = chunk.name + ".js"; //只是拿到了文件名
      chunk.files.push(file);

      let source = mainRender({
        entryModuleId: chunk.entryModule.moduleId, // ./src/index.js
        modules: chunk.modules, //此代码块对应的模块数组[{moduleId:'./src/index.js'},{moduleId:'./src/title.js'}]
      });

      this.emitAssets(file, source);
    }
  }

  emitAssets(file, source) {
    this.assets[file] = source;
    this.files.push(file);
  }
}

module.exports = Compilation;
