import fs from 'fs';

const text = fs.readFileSync(
  'C:/Users/JOSE MANUEL/.cursor/projects/c-DevConexa/agent-tools/b52f1325-d110-45f1-bff5-04e9908a5c91.txt',
  'utf8',
);
const m = text.match(/literal "DIAN 2\.1: Nota de ajuste[^"]+"/);
if (!m) {
  console.error('not found');
  process.exit(1);
}
const literal = m[0].slice('literal '.length).replace(/^"|"$/g, '');
console.log('len', literal.length);
console.log('last codes', [...literal.slice(-3)].map((c) => c.charCodeAt(0)));
console.log(JSON.stringify(literal));
