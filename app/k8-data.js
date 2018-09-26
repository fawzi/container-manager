const k8 = require('./kubernetes');

// gets pods with the given labels
function getPods(labels, next) {
  let selector = ""
  let first = true
  for (k in labels) {
    if (first)
      first = false
    else
      selector += ','
    selector += `${k}=${labels[k]}`
  }
  k8.ns(config.k8component.namespace).pods({ qs: { labelSelector: selector } }, next)
}
