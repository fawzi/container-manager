'use strict';
module.exports = function(config, File, ResourceUsage){
  const chokidar = require('chokidar');
  const pathModule = require('path');
  const fs = require('fs');
  const getSize = require('get-folder-size');
  
  var watcher = chokidar.watch(config.userInfo.basePathToWatch+ '/**/*.bkr', {
    usePolling: true // more expensive, but works also on GPFS with updates from multiple machines
  });
  watcher.on('add', (path,stats) => {
    addNewFile(path, stats)
  })
    .on('unlink', (path) =>  deleteFile(path))
    .on('ready', () => console.log('Initial scan complete. Ready for changes'))
    .on('change', (path,stats) => changeFile(path,stats));

  verifyPresent();

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

  // scan all database entries and removes those that do not exist anymore
  function verifyPresent() {
    File.find({}).stream().on('data', function(notebook) {
      if (!fs.existsSync(nodebook.path)) {
        File.remove({ path: notebook.path }, function (err) {
          if (err) return errorHandler(err);
          console.log(`Removed ${notebook.path}`)
        });
      }
    }).on('error', function(err) {
      console.log(`Failed to check data in db due to ${err}`);
    })
  }

  // gets the resourceUsage entry for the given user
  function resourceUsage(username, next) {
    ResourceUsage.findOne({user: username}, function(err, user) {
      if (err) {
        errorHandler(err);
      }
      next(user)
    });
  }


  // cache to avoid recalculating sizes too often
  let lastDiskUpdate = {}

  // recomputes the size of the private and public directories of a user
  // if mdate is after the last time the size was recomputed
  function recomputeSize(username, mdate) {
    resourceUsage(username, function (rUsage) {
      if (username in lastDiskUpdate) {
        if (lastDiskUpdate[username] > mdate)
          return;
      }
      var currentDate = new Date();
      if (!rUsage) {
        getSize(config.userInfo.sharedDir + '/' + username, function(err, sharedSize) {
          var sharedSizeGB;
          if (err) {
            console.log(`Could not compute size of ${config.userInfo.sharedDir + '/' + username} due to ${err}`);
            sharedSizeGB = -1;
          } else {
            sharedSizeGB = sharedSize / (1024.0*1024.0*1024.0);
          }
          getSize(config.userInfo.privateDir + '/' + username, function(err, privateSize) {
            var privateSizeGB;
            if (err) {
              console.log(`Could not compute size of ${config.userInfo.privateDir + '/' + username} due to ${err}`);
              privateSizeGB = -1;
            } else {
              privateSizeGB = privateSize / (1024.0*1024.0*1024.0);
            }
            lastDiskUpdate[username] = currentDate
            let r = ResourceUsage({
              user: username,
              fileUsageLastUpdate: currentDate,
              sharedStorageGB: sharedSizeGB,
              privateStorageGB: privateSizeGB,
              cpuUsage: 0.0
            })
            r.save(function(err) {
              if (err) errorHandler(err);
              console.log('Disk usage added for the user: ' + username);
            });
          });
        });
      } else { // if (mdate >= rUsage.fileUsageLastUpdate) { // always recalculate all on startup
        getSize(config.userInfo.sharedDir + '/' + username, function(err, sharedSize) {
          var sharedSizeGB;
          if (err) {
            console.log(`Could not compute size of ${config.userInfo.sharedDir + '/' + username} due to ${err}`);
            sharedSizeGB = -1;
          } else {
            sharedSizeGB = sharedSize / (1024.0*1024.0*1024.0);
          }
          getSize(config.userInfo.privateDir + '/' + username, function(err, privateSize) {
            var privateSizeGB;
            if (err) {
              console.log(`Could not compute size of ${config.userInfo.privateDir + '/' + username} due to ${err}`);
              privateSizeGB = -1;
            } else {
              privateSizeGB = privateSize / (1024.0*1024.0*1024.0);
            }
            lastDiskUpdate[username] = currentDate;
            rUsage.fileUsageLastUpdate = currentDate;
            rUsage.sharedStorageGB = sharedStorageGB;
            rUsage.privateStorageGB = privateStorageGB;
            rUsage.save(function(err) {
              if (err) errorHandler(err);
              console.log('Disk usage updated for user: ' + username);
            });
          });
        });
      }
    });
  }

  // handles a notebook file, updating the db entry accordingly
  // might trigger a size recomputation
  function handleFile(path, stats) {
    console.log('Handling file ' + path);
    findByPath(path, function (file) {
      if(!file){
        var sharedDir = config.userInfo.sharedDir;
        if (sharedDir[sharedDir.length - 1 ] != '/')
          sharedDir = sharedDir + '/';
        var privateDir = config.userInfo.privateDir;
        if (privateDir[privateDir.length - 1] != '/')
          privateDir = privateDir + '/'
        const posPublic = path.indexOf(sharedDir);
        const posPrivate = path.indexOf(privateDir);
        const filename = pathModule.basename(path);
        let linkPrefix, partialPath, user;
        let isPublic = true;
        if (posPublic > -1 && (posPrivate < 0 || posPrivate > posPublic)){
          partialPath = path.substring(posPublic + config.userInfo.sharedDir.length)
          user = partialPath.split('/',1)[0];
          partialPath = partialPath.slice(user.length + 1, partialPath.length)
          linkPrefix = config.userInfo.sharedDirInContainer;
        }
        else if(posPrivate > -1) {
          isPublic = false;
          partialPath = path.substring(posPrivate + config.userInfo.privateDir.length)
          user = partialPath.split('/',1)[0];
          linkPrefix = config.userInfo.privateDirInContainer;
        } else {
          console.log("Received invalid path " + path)
          return;
        }
        if (linkPrefix[linkPrefix.length - 1] != '/')
          linkPrefix = linkPrefix + '/';
        let pathInContainer = linkPrefix + partialPath;
        let shortPath
        if (isPublic)
          shortPath = "shared/"
        else
          shortPath = "private/"
        shortPath += partialPath
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
            pathInContainer: pathInContainer,
            partialPath: partialPath,
            isPublic: isPublic,
            user: user,
            link: '/beaker/#/open?uri=' + pathInContainer,
            filename: filename,
            title: title,
            authors: authors,
            description: description,
            created_at: stats.ctime,
            updated_at: stats.mtime
          };
          var newFile;
          File.findOne({path: path}, function(err, file) {
            newFile = file
            if (file) {
              for (k in f)
                file[k] = f[k];
            } else {
              newFile = File(f);
            }
            // save the file
            newFile.save(function(err) {
              if (err) errorHandler(err);
              console.log('Handled Database entry for the file: ' + path);
              recomputeSize(user, stats.mtime);
            });
          });
        });
      }
    });
  }

  // callback when a file is deleted
  function deleteFile(path) {
    console.log('File deleted!' + path);
    File.remove({ path: path }, function (err) {
      if (err) return errorHandler(err);
      // removed!
    });
  }

  // callback when a file is added (or on the initial startup
  function addNewFile(path, stats) {
    console.log('File added!' + path);
    handleFile(path, stats)
  }

  // callback when a file changes
  function changeFile(path,stats) {
    console.log('File change!' + path);
    handleFile(path, stats)
  }
}
