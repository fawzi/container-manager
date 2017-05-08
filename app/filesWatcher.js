'use strict';
module.exports = function(config, File){
const chokidar = require('chokidar');
const pathModule = require('path');
const fs = require('fs');
var watcher = chokidar.watch(config.userInfo.basePathToWatch+ '/**/*.bkr', {});
  watcher.on('add', (path,stats) => {
      addNewFile(path, stats)
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
function addNewFile(path, stats) {
  console.log('New file detected!' + path);
  findByPath(path, function (file) {
    if(!file){
    const posPublic = path.indexOf(config.userInfo.sharedDir);
    const posPrivate = path.indexOf(config.userInfo.privateDir);
    const filename = pathModule.basename(path);
    let toReplace, linkPrefix, partialPath, user;
    let isPublic = true;
    if (posPublic > -1){
      partialPath = path.substring(posPublic + config.userInfo.sharedDir.length + 1) // +1 to take care of the forward slash (/) in the path; posPublic should be 0, but added for surety
      user = partialPath.split('/',1)[0];
      linkPrefix = config.userInfo.sharedDirInContainer;
      toReplace = config.userInfo.sharedDir;
    }
    else if(posPrivate > -1) {
      isPublic = false;
      partialPath = path.substring(posPrivate + config.userInfo.privateDir.length + 1) // +1 to take care of the forward slash (/) in the path; posPublic should be 0, but added for surety
      user = partialPath.split('/',1)[0];
      linkPrefix = config.userInfo.privateDirInContainer;
      toReplace = config.userInfo.privateDirInContainer;
    }
    fs.readFile(path, 'utf8', function(err, contents) {
     const tut = JSON.parse(contents);
     let title = tut["cells"][0]["title"];
     let authors = tut["cells"][1]["body"][0];
     let description = tut["cells"][2]["body"][0];
     console.log(title);
     console.log(authors);
     console.log(description);
     let f = {
        path: path,
        isPublic: isPublic,
        user: user,
        link: '/beaker/#/open?uri=' + path.replace(toReplace,linkPrefix),
        filename: filename
       };
       if(tut["cells"][0] && tut["cells"][0]["title"]) {
         f.title = tut["cells"][0]["title"]
       }
       if(tut["cells"][1] && tut["cells"][1]["body"] && tut["cells"][1]["body"][0]) {
         f.authors = tut["cells"][1]["body"][0].replace('Authors:','')
       }
       if(tut["cells"][2] && tut["cells"][2]["body"] && tut["cells"][2]["body"][0]) {
         f.description = tut["cells"][2]["body"][0].replace('Description:','')
       }
       var newFile = File(f);
       // save the file
       newFile.save(function(err) {
        if (err) errorHandler(err);
        console.log('Database entry added for the file: ' + path);
       });
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

