'use strict';
module.exports = function(config, File, ResourceUsage){
const chokidar = require('chokidar');
const pathModule = require('path');
const fs = require('fs');
const getSize = require('get-folder-size');
    
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

function resourceUsage(username, next) {
    ResourceUsage.findOne({user: username}, function(err, user) {
  if (err) {
    errorHandler(err);
  }
  next(user)
  });
}


let lastDiskUpdate = {}
    
function recomputeSize(username, mdate) {
    resourceUsage(username, function (rUsage) {
        if (username in lastDiskUpdate) {
            if (lastDiskUpdate[username] > mdate)
                return;
        }
        var currentDate = new Date();
        if (!rUsage) {
            lastDiskUpdate[username] = currentDate
            let r = ResourceUsage({
                user: username,
                fileUsageLastUpdate: currentDate,
                sharedStorageGB: getSize(config.userInfo.sharedDir + '/' + username),
                privateStorageGB: getSize(config.userInfo.privateDir + '/' + username),
                cpuUsage: 0.0
            })
            r.save(function(err) {
                if (err) errorHandler(err);
                console.log('Disk usage added for the user: ' + username);
            });
        } else { // if (mdate >= rUsage.fileUsageLastUpdate) { // recalculate on startup...
            lastDiskUpdate[username] = currentDate
            rUsage.fileUsageLastUpdate = currentDate,
            rUsage.sharedStorageGB = getSize(config.userInfo.sharedDir + '/' + username),
            rUsage.privateStorageGB = getSize(config.userInfo.privateDir + '/' + username)
            rUsage.save(function(err) {
                if (err) errorHandler(err);
                console.log('Disk usage added for the user: ' + username);
            })
        }
    })
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
    } else {
        console.log("Received invalid path " + path)
        return;
    }
    fs.readFile(path, 'utf8', function(err, contents) {
     const tut = JSON.parse(contents);
     var title, authors, description;
     try {
         title = tut["cells"][0]["title"];
     } catch (err) {
         if (filename.endsWith(".bkr"))
             title = filename.slice(0, filename.length - 4)
         else
             title = filename
     }
     try {
         authors = tut["cells"][1]["body"][0].replace('Authors:','')
     } catch (err) {
         authors = user
     }
     try {
         description = tut["cells"][2]["body"][0].replace('Description:','');
     } catch (err) {
         description = ""
     }
      let f = {
        path: path,
        isPublic: isPublic,
        user: user,
        link: '/beaker/#/open?uri=' + path.replace(toReplace,linkPrefix),
        filename: filename,
        title: title,
        authors: authors,
        description: description,
        created_at: stats.ctime,
        updated_at: stats.mtime
       };
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

