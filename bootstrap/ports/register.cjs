'use strict';

function selectPorts(available, grants) {
  if (!Array.isArray(grants) || new Set(grants).size !== grants.length) throw Error('Invalid native port grants');
  const selected = Object.create(null);
  for (const name of grants) {
    if (!Object.hasOwn(available, name) || typeof available[name] !== 'function') throw Error('Unavailable native port: ' + name);
    selected[name] = available[name];
  }
  return Object.freeze(selected);
}

module.exports = {selectPorts};
