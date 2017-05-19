'use strict';

module.exports = function(mongoose) {
var Schema = mongoose.Schema;

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

  const Rusage = mongoose.model('Rusage', resourceSchema);
  return Rusage
};
