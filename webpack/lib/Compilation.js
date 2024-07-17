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
  path.join(__dirname, "templates", "deferMain.ejs"),
  "utf8"
);
const mainRender = ejs.compile(mainTemplate);

const chunkTemplate = fs.readFileSync(
  path.join(__dirname, "templates", "chunk.ejs"),
  "utf8"
);
const chunkRender = ejs.compile(chunkTemplate);

class Compilation {
  constructor(compiler) {
    this.compiler = compiler;
    this.options = compiler.options;
    this.context = compiler.context;
    this.inputFileSystem = compiler.inputFileSystem;
    this.outputFileSystem = compiler.outputFileSystem;
    this.entries = [];
    this.modules = [];
    this._modules = {};
    this.chunks = [];
    this.files = [];
    this.assets = {};
    this.vendors = [];
    this.commons = [];
    this.moduleCount = {};
    this.hooks = {
      succeedModule: new SyncHook(["module"]),
      seal: new SyncHook(),
      beforeChunks: new SyncHook(),
      afterChunks: new SyncHook(),
    };
  }

  addEntry(context, entry, name, finalCallback) {
    this._addModuleChain(context, entry, name, false, (err, module) => {
      finalCallback(err, module);
    });
  }

  _addModuleChain(context, rawRequest, name, async, callback) {
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

    for (const module of this.modules) {
      //如果模块ID中有node_modules内容,说明是一个第三方模块
      if (/node_modules/.test(module.moduleId)) {
        module.name = "vendors";
        if (!this.vendors.find((item) => item.moduleId === module.moduleId))
          this.vendors.push(module);
      } else {
        let count = this.moduleCount[module.moduleId];
        if (count) {
          this.moduleCount[module.moduleId].count++;
        } else {
          //如果没有,则给它赋初始值 {module,count} count是模块的引用次数
          this.moduleCount[module.moduleId] = { module, count: 1 };
        }
      }
    }
    for (let moduleId in this.moduleCount) {
      const { module, count } = this.moduleCount[moduleId];
      if (count >= 2) {
        module.name = "commons";
        this.commons.push(module);
      }
    }

    let deferredModuleIds = [...this.vendors, ...this.commons].map(
      (module) => module.moduleId
    );
    this.modules = this.modules.filter(
      (module) => !deferredModuleIds.includes(module.moduleId)
    );

    for (const entryModule of this.entries) {
      const chunk = new Chunk(entryModule);
      this.chunks.push(chunk);

      chunk.modules = this.modules.filter(
        (module) => module.name === chunk.name
      );
    }
    if (this.vendors.length > 0) {
      const chunk = new Chunk(this.vendors[0]);
      chunk.async = true;
      this.chunks.push(chunk);
      chunk.modules = this.vendors;
    }
    if (this.commons.length > 0) {
      const chunk = new Chunk(this.commons[0]);
      chunk.async = true;
      this.chunks.push(chunk);
      chunk.modules = this.commons;
    }
    this.hooks.afterChunks.call(this.chunks);
    this.createChunkAssets();
    callback();
  }

  createChunkAssets() {
    for (let i = 0; i < this.chunks.length; i++) {
      const chunk = this.chunks[i];
      const file = chunk.name + ".js";
      chunk.files.push(file);

      let source;
      if (chunk.async) {
        source = chunkRender({
          chunkName: chunk.name,
          modules: chunk.modules,
        });
      } else {
        let deferredChunks = [];
        if (this.vendors.length > 0) deferredChunks.push("vendors");
        if (this.commons.length > 0) deferredChunks.push("commons");
        source = mainRender({
          entryModuleId: chunk.entryModule.moduleId,
          deferredChunks,
          modules: chunk.modules,
        });
      }

      this.emitAssets(file, source);
    }
  }

  emitAssets(file, source) {
    this.assets[file] = source;
    this.files.push(file);
  }
}

module.exports = Compilation;
