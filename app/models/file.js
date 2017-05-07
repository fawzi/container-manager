'use strict';

module.exports = function(mongoose) {
var Schema = mongoose.Schema;
// create the tutorials Schema
var fileSchema = new Schema({
  title: String,
  path: {
    type:String,
	required: true,
    unique: true
  },
  authors: String,
  link: String,
  isPublic: Boolean,
  user: String,
  description: String,
  created_at: Date,
  updated_at: Date
});

fileSchema.pre('save', function(next) {
  var currentDate = new Date();
  this.updated_at = currentDate;
  if (!this.created_at)
    this.created_at = currentDate;
  next();
});

var File = mongoose.model('File', fileSchema);
return(File);
};
