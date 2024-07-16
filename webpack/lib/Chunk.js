class Chunk {
  constructor(entryModule) {
    this.entryModule = entryModule; 
    this.async = entryModule.async;
    this.name = entryModule.name; 
    this.files = []; 
    this.modules = []; 
  }
}
module.exports = Chunk;
