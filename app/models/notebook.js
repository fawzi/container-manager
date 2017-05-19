'use strict';

module.exports = function(mongoose) {
  var Schema = mongoose.Schema;

  var notebookSchema = new Schema({
    title: String,
    path: {
      type:String,
      required: true,
      unique: true
    },
    logicalPath: String,
    authors: String,
    editLink: String,
    isPublic: Boolean,
    username: String,
    description: String,
    created_at: Date,
    updated_at: Date
  });

  const Notebook = mongoose.model('Notebook', notebookSchema);

  return Notebook
};
