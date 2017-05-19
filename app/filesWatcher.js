'use strict';
module.exports = function(config, models){
  const chokidar = require('chokidar');
  const pathModule = require('path');
  const fs = require('fs');
  const getSize = require('get-folder-size');
  
  const Notebook = models.Notebook
  const Rusage = models.Rusage

  //TODO: Write a better errorHandler
  function errorHandler(err) {
    throw err;
  }

  function findByPath(path, next) {
    Notebook.findOne({path: path}, function(err, notebook) {
      if (err) {
        errorHandler(err);
      }
      next(notebook)
    });
  }

  // scan all database entries and removes those that do not exist anymore
  function verifyPresent() {
    Notebook.find({}).cursor().on('data', function(notebook) {
      if (!fs.existsSync(notebook.path)) {
        Notebook.remove({ path: notebook.path }, function (err) {
          if (err) return errorHandler(err);
          console.log(`Removed ${notebook.path}`)
        });
      }
    }).on('error', function(err) {
      console.log(`Failed to check data in db due to ${err}`);
    })
    /*Rusage.find({}).cursor().on('data', function(rUsage) {
      if (!(username in rUsage) || !rUsage.username) {
        Rusage.remove({ username: username }, function (err) {
          if (err) return errorHandler(err);
          console.log(`Removed resources for ${rUsage.username}`)
        });
      }
      const path = config.userInfo.sharedDir + '/' + rUsage.username
      if (!fs.existsSync(path)) {
        Rusage.remove({ username: username }, function (err) {
          if (err) return errorHandler(err);
          console.log(`Removed resources for ${rUsage.username}`)
        });
      }
    }).on('error', function(err) {
      console.log(`Failed to check resource usage data in db due to ${err}`);
    })*/
  }

  // cache to avoid recalculating sizes too often
  let lastDiskUpdate = {}

  // recomputes the size of the private and public directories of a user
  // if mdate is after the last time the size was recomputed
  function recomputeSize(username, mdate) {
    var currentDate = new Date();
    console.log(`recomputing size for ${username} ${mdate}`)
    if (username in lastDiskUpdate) {
      if (lastDiskUpdate[username] > mdate)
        return;
    } else {
      lastDiskUpdate[username] = currentDate
    }
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
        let rd = {
          username: username,
          fileUsageLastUpdate: currentDate,
          sharedStorageGB: sharedSizeGB,
          privateStorageGB: privateSizeGB,
          cpuUsage: 0.0
        }
        console.log(`Did compute size: ${JSON.stringify(rd)}`)
        models.getRusage(username, function (rUsage) {
          var toUpdate;
          if (rUsage) {
            for (let k in rUsage)
              rUsage[k] = rUsage[k]
            toUpdate = rUsage
          } else {
            toUpdate = new Rusage(rd)
          }
          toUpdate.save(function(err) {
            if (err) errorHandler(err);
            console.log('Disk usage added for the user: ' + username);
          });
        })
      });
    });
  }

  // handles a notebook file, updating the db entry accordingly
  // might trigger a size recomputation
  function handleNotebook(path, stats) {
    // compare updated_at with stats.mdate? currently always update on startup...
    // console.log('Handling notebook ' + path);
    var sharedDir = config.userInfo.sharedDir;
    if (sharedDir[sharedDir.length - 1 ] != '/')
      sharedDir = sharedDir + '/';
    var privateDir = config.userInfo.privateDir;
    if (privateDir[privateDir.length - 1] != '/')
      privateDir = privateDir + '/'
    const posPublic = path.indexOf(sharedDir);
    const posPrivate = path.indexOf(privateDir);
    const filename = pathModule.basename(path);
    let pathInContainer, partialPath, user;
    let isPublic = true;
    if (posPublic > -1 && (posPrivate < 0 || posPrivate > posPublic)){
      partialPath = path.substring(posPublic + sharedDir.length)
      user = partialPath.split('/',1)[0];
      pathInContainer = '/data/shared/' + partialPath
    }
    else if(posPrivate > -1) {
      isPublic = false;
      partialPath = path.substring(posPrivate + privateDir.length)
      user = partialPath.split('/',1)[0];
      pathInContainer = '/data/private/' + partialPath
    } else {
      console.log("Received invalid path " + path)
      return;
    }
    //console.log(`partialPath:${partialPath}, user:${user}`)
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
        logicalPath: pathInContainer,
        isPublic: isPublic,
        username: user,
        editLink: '/beaker/#/open?uri=' + pathInContainer,
        title: title,
        authors: authors,
        description: description,
        created_at: stats.ctime,
        updated_at: stats.mtime
      };
      //console.log(`handling notebook to ${JSON.stringify(f)}`)
      var newNotebook;
      Notebook.findOne({path: path}, function(err, notebook) {
        newNotebook = notebook
        if (newNotebook) {
          for (let k in f)
            newNotebook[k] = f[k];
        } else {
          newNotebook = new Notebook(f);
        }
        // save the notebook
        newNotebook.save(function(err) {
          if (err) errorHandler(err);
          console.log('Handled Database entry for the notebook: ' + path);
          recomputeSize(user, stats.mtime);
        });
      });
    });
  }

  // callback when a notebook is deleted
  function deleteNotebook(path) {
    console.log('Notebook deleted!' + path);
    Notebook.remove({ path: path }, function (err) {
      if (err) return errorHandler(err);
      // removed!
    });
  }

  // callback when a notebook is added (or on the initial startup
  function addNewNotebook(path, stats) {
    console.log('Notebook added!' + path);
    handleNotebook(path, stats)
  }

  // callback when a notebook changes
  function changeNotebook(path,stats) {
    console.log('Notebook change!' + path);
    handleNotebook(path, stats)
  }

  verifyPresent();

  var watcher = chokidar.watch(config.userInfo.basePathToWatch+ '/**/*.bkr', {
    usePolling: true // more expensive, but works also on GPFS with updates from multiple machines
  });
  watcher.on('add', (path,stats) => {
    addNewNotebook(path, stats)
  })
    .on('unlink', (path) =>  deleteNotebook(path))
    .on('ready', () => console.log('Initial scan complete. Ready for changes'))
    .on('change', (path,stats) => changeNotebook(path,stats));

}
