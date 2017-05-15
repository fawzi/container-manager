'use strict';

module.exports = function(mongoose) {
var Schema = mongoose.Schema;
// create the tutorials Schema
var resourceSchema = new Schema({
    username: {
        type: String,
        required: true,
        unique: true
    },
    fileUsageLastUpdate: Date,
    privateStorageGB: Number,
    sharedStorageGB: Number,
    cpuUsageLastUpdate: Date,
    cpuUsage: Number,
});

var ResourceUsage = mongoose.model('ResourceUsage', resourceSchema);

resourceSchema.pre('save', function(next) {
  var currentDate = new Date();
  if (!this.fileUsageLastUpdate)
     this.fileUsageLastUpdate = currentDate;
  if (!this.cpuUsageLastUpdate)
    this.cpuUsageLastUpdate = currentDate;
  next();
});

return(ResourceUsage);
};
