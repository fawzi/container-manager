const stringify = require('fast-json-stable-stringify')
const crypto = require('crypto')

function sha(){
  return crypto.createHash('sha512')
}

function compactSha(hash, prefix='o') {
  const digest = hash.digest('base64').slice(0,28).replace('+','-').replace('/','_')
  return prefix + digest
}

function objectSha(obj, prefix='o') {
  const hash = sha()
  hash.write(stringify(obj))
  return compactSha(hash, prefix)
}


module.exports = {
  stableStringify: stringify,
  objectSha: objectSha,
  sha: sha,
  compactSha: compactSha
}
