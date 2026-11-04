'use strict';

function parseRel(text, file) {
  const facts = [];
  const atom = '"(?:\\\\.|[^"\\\\])*"';
  const tuple = new RegExp('\\s*\\(\\s*(' + atom + ')\\s*,\\s*(' + atom + ')\\s*,\\s*(' + atom + ')(?:\\s*,\\s*(' + atom + '))?\\s*\\)', 'y');
  const source = text.split(/\r?\n/).map(line => line.trim().startsWith('//') ? '' : line).join('\n');
  let offset = 0;
  while (source.slice(offset).trim()) {
    tuple.lastIndex = offset;
    const match = tuple.exec(source);
    if (!match) throw Error(file + ':' + source.slice(0, offset).split('\n').length + ': invalid REL');
    offset = tuple.lastIndex;
    const [s, p, o] = match.slice(1, 4).map(JSON.parse);
    const pol = match[4] ? JSON.parse(match[4]) : 'is';
    if (!['is', 'is-not'].includes(pol)) throw Error('Unknown fact polarity');
    facts.push({s, p, o, pol});
  }
  return facts;
}

module.exports = {parseRel};
