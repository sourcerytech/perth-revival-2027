'use strict';

function valuePorts() {
  return {
    'value.describe': ({value}) => ({type: typeof value, array: Array.isArray(value)}),
    'value.string': ({value}) => String(value),
    'value.type': ({value}) => typeof value,
    'record.entries': ({value}) => Object.entries(value),
    'record.fromEntries': ({entries}) => Object.fromEntries(entries),
    'record.put': ({record,key,value}) => Object.assign(Object.create(null),record,{[key]:value}),
    'value.freeze': ({value}) => {
      const freeze=item=>{if(item&&typeof item==='object'&&!Object.isFrozen(item)){Object.values(item).forEach(freeze);Object.freeze(item);}return item;};
      return freeze(value);
    },
    'record.get': ({record, key}) => record != null && Object.hasOwn(record, key) ? record[key] : null,
    'text.replaceAll': ({value, search, replacement}) => value.replaceAll(search, replacement),
    'text.split': ({value, pattern}) => value.split(new RegExp(pattern)),
    'text.trim': ({value}) => value.trim(),
    'text.lowerCase': ({value}) => value.toLowerCase(),
    'text.matches': ({value, pattern, flags}) => new RegExp(pattern, flags).test(value),
  };
}

module.exports = {valuePorts};
