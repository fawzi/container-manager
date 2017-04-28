'use strict';
module.exports = function(config, File){
var chokidar = require('chokidar');
var watcher = chokidar.watch(config.userInfo.basePathToWatch+ '/**/*.bkr', {});
  watcher.on('add', (path,stats) => {
    const posPublic = path.indexOf(config.userInfo.sharedDir);
    if (posPublic > -1){
      const isPublic = true;
      let partialPath = path.substring(posPublic + config.userInfo.sharedDir.length + 1) // +1 to take care of the forward slash (/) in the path; posPublic should be 0, but added for surety
      const user = partialPath.split('/',1)[0];
      addNewFile(path, stats, isPublic, user)
    }
    else if(path.indexOf(config.userInfo.privateDir) > -1) {
      const isPublic = false;
      const posPrivate = path.indexOf(config.userInfo.privateDir);
      let partialPath = path.substring(posPrivate + config.userInfo.privateDir.length + 1) // +1 to take care of the forward slash (/) in the path; posPublic should be 0, but added for surety
      const user = partialPath.split('/',1)[0];
      addNewFile(path, stats, isPublic, user)
    }
  })
  .on('unlink', (path) =>  deleteFile(path))
  .on('ready', () => console.log('Initial scan complete. Ready for changes'))
  .on('change', (path,stats) => changeFile(path,stats));

//TODO: Write a better errorHandler
function errorHandler(err) {
  throw err;
}

function findByPath(path, next) {
  File.findOne({path: path}, function(err, file) {
  if (err) {
    errorHandler(err);
  }
  next(file)
  });
}
//TODO: Read File and add extra information
function addNewFile(path, stats, isPublic, user) {
  console.log('New file detected!' + path);
  findByPath(path, function (file) {
    if(!file){
      var newFile = File({
        path: path,
        isPublic: isPublic,
        user: user
      });
      // save the file
      newFile.save(function(err) {
        if (err) throw err;
        console.log('Database entry added for the file: ' + path);
      });
    }
  });
}

function deleteFile(path) {
  console.log('File deleted!' + path);
  File.remove({ path: path }, function (err) {
    if (err) return errorHandler(err);
    // removed!
  });
}

//TODO: Handles the changes to the files
function changeFile(path,stats) {
}
}

