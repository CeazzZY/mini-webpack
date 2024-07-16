const {
  AsyncSeriesHook,
  AsyncParallelHook,
  SyncHook,
  SyncBailHook,
} = require("tapable");
const NormalModuleFactory = require("./NormalModuleFactory");
const Compilation = require("./Compilation");
const State = require("./Stats");
const { mkdirp } = require("mkdirp");
const path = require("path");

class Compiler {
  constructor(context) {
    this.context = context;
    this.hooks = {
      entryOption: new SyncBailHook(["context", "entry"]),
      beforeRun: new AsyncSeriesHook(["compiler"]),
      run: new AsyncSeriesHook(["compiler"]),
      beforeCompile: new AsyncSeriesHook(["params"]),
      compile: new SyncHook(["params"]),
      make: new AsyncParallelHook(["compilation"]),
      thisCompilation: new SyncHook(["compilation", "params"]),
      compilation: new SyncHook(["compilation", "params"]),
      afterCompile: new AsyncSeriesHook(["compilation"]),
      emit: new AsyncSeriesHook(["compilation"]),
      done: new AsyncSeriesHook(["stats"]),
    };
  }

  run(callback) {
    const onCompiled = (err, compilation) => {
      this.emitAssets(compilation, (err) => {
        let stats = new State(compilation);
        this.hooks.done.callAsync(stats, (err) => {
          callback(err, stats);
        });
      });
    };

    this.hooks.beforeRun.callAsync(this, (err) => {
      this.hooks.run.callAsync(this, (err) => {
        this.compile(onCompiled);
      });
    });
  }

  compile(onCompiled) {
    const params = this.newCompilationParams();
    this.hooks.beforeCompile.callAsync(params, (err) => {
      this.hooks.compile.call(params);
      const compilation = this.newCompilation(params);
      this.hooks.make.callAsync(compilation, (err) => {
        compilation.seal((err) => {
          this.hooks.afterCompile.callAsync(compilation, (err) => {
            onCompiled(err, compilation);
          });
        });
      });
    });
  }

  newCompilationParams() {
    const params = {
      //创建compilation
      normalModuleFactory: new NormalModuleFactory(),
    };
    return params;
  }

  newCompilation(params) {
    const compilation = this.createCompilation();
    this.hooks.thisCompilation.call(compilation, params);
    this.hooks.compilation.call(compilation, params);
    return compilation;
  }

  createCompilation() {
    return new Compilation(this);
  }

  emitAssets(compilation, callback) {
    //把 chunk变成文件,写入硬盘
    const emitFiles = (err) => {
      const assets = compilation.assets;
      let outputPath = this.options.output.path; //dist
      for (let file in assets) {
        let source = assets[file];
        let targetPath = path.posix.join(outputPath, file);
        this.outputFileSystem.writeFileSync(targetPath, source, "utf8");
      }
      callback();
    };
    //先触发emit的回调,在写插件的时候emit用的很多,因为它是我们修改输出内容的最后机会
    this.hooks.emit.callAsync(compilation, () => {
      //先创建输出目录dist,再写入文件
      mkdirp(this.options.output.path, emitFiles);
    });
  }
}

module.exports = Compiler;
