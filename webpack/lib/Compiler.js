const {
  AsyncSeriesHook,
  AsyncParallelHook,
  SyncHook,
  SyncBailHook,
} = require("tapable");
const NormalModuleFactory = require("./NormalModuleFactory");
const Compilation = require("./Compilation");
const State = require("./Stats");

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
    };
  }

  run(callback) {
    console.log("Compiler run");

    //最后回调
    const finalCallback = (err, stats) => {
      callback(err, stats);
    };

    const onCompiled = (err, compilation) => {
      console.log("onCompiled");
      finalCallback(err, new State(compilation));
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
        console.log("make完成");
        onCompiled(err, compilation);
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
}

module.exports = Compiler;
