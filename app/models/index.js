'use strict';

module.exports = function(mongoose) {
  const Rusage = require('./rusage.js')(mongoose)

  const rusageAttributes = ['username', 'fileUsageLastUpdate','privateStorageGB','sharedStorageGB','cpuUsageLastUpdate', 'cpuUsage']

  // returns a json api resource object for a resource usage
  function rusageResObj(rusage) {
    if (null == rusage)
      return null
    let attribs = {}
    for (let k of rusageAttributes)
      attribs[k] = rusage[k]
    return {
      type: "rusages",
      id: rusage.username,
      attributes: attribs
    }
  }

  // returns a res object id of a resource object
  function resId(resObj) {
    return {
      type: resObj.type,
      id: resObj.id
    }
  }

  // returns a json api resource object identifier for a resource usage
  function rusageResId(rusage) {
    return {
      type: "rusages",
      id: rusage.username
    }
  }

  // gets rusage Resource Object
  function getRusage(username, next) {
    Rusage.findOne({ username: username }, function (err, rusage) {
      if (!rusage) {
        if (fs.existsSync(config.userInfo.sharedDir + "/" + username)) {
          next(null, {
            data: {
              type: "rusage",
              id: username,
              attributes: {
                username: username,
                fileUsageLastUpdate: null,
                privateStorageGB: 0,
                sharedStorageGB: 0,
                cpuUsageLastUpdate: null,
                cpuUsage: 0
              }
            }
          })
        } else {
          next(null, { data: null })
        }
      } else {
        next(null, rusageResObj(rusage))
      }
    });
  }

  const Notebook = require('./notebook')(mongoose)

  const notebookAttributes = [ 'title', 'path', 'logicalPath', 'authors', 'editLink', 'isPublic', 'username',
                               'description', 'created_at', 'updated_at']
  // returns a json api Resource Object for a notebook
  function notebookResObj(notebook){
    if (null == notebook)
      return null
    let nAttrib = {}
    for (let k of notebookAttributes)
      nAttrib[k] = notebook[k];
    return {
      id: notebook._id,
      type: "notebooks",
      attributes: nAttrib
    }
  }

  // returns a json api Resource Object Identifier for a notebook
  function notebookResId(notebook){
    return {
      id: notebook._id,
      type: "notebooks"
    }
  }

  // gets user info on username, as seen by selfName in json api format
  function getUserInfo(username, selfName, next) {
    var query;
    if (selfName && username == selfName)
      query = { user: selfName };
    else
      query = { user: username, isPublic: true};
    Notebook.find(query, null, {sort: {updated_at: -1}}, function(err, myNotebooks) {
      if(err) {
        next(err);
      } else {
        Rusage.findOne({username: username}, function(err, rusage) {
          let res = {
            data: {
              type: "users",
              id: username,
              attributes: {
                username: username,
              },
              relationships: {
                notebooks: {
                  data: myNotebooks.map(notebookResId)
                },
                rusage: null
              }
            },
            included: myNotebooks.map(notebookResObj)
          }
          if (rusage) {
            res.data.relationships.rusage = rusageResId(rusage)
            res.data.included.push(rusageResObj(rusage))
          }
          next(null, res);
        });
      }
    });
  }

  // return information on how the user sees himself
  function getMyself(username, next) {
    Notebook.find({isPublic: true}, null, {sort: "user -updated_at"}, function(err,notebooks) {
      if(err) {
        next(err);
      } else {
        let username = selfUserName(req)
        if (!username) {
          next(null, {
            data: {
              type: "myself",
              id: 1,
              attributes: {
                username: ''
              },
              relationships: {
                user: null,
                visibleNotebooks: {
                  data: notebooks.map(notebookResId)
                }
              }
            },
            included: notebooks.map(notebookResObj)
          })
        } else {
          getUserInfo(username, username, function(err, userInfo) {
            if (err) {
              next(err)
            } else {
              var toInclude = notebooks.concat([user.data]).concat(userInfo.included.filter(function(x) {
                return x.type != "notebook" || !x.isPublic
              }));
              next(null,{
                data: {
                  type: "myselfs",
                  id: 1,
                  attributes: {
                    username: username
                  },
                  relationships: {
                    user: {
                      data: { type: "users", id: username }
                    },
                    rusage: {
                      data: userInfo.data.relationships.rusage
                    },
                    visibleNotebooks: {
                      data: notebooks.map(notebookResId)
                    }
                  }
                },
                included: toInclude
              });
            }
          });
        }
      }
    });
  }

  return {
    Rusage: Rusage,
    rusageResObj: rusageResObj,
    rusageResId: rusageResId,
    getRusage: getRusage,
    Notebook: Notebook,
    notebookResObj: notebookResObj,
    notebookResId: notebookResId,
    getUserInfo: getUserInfo,
    getMyself: getMyself
  };
}
