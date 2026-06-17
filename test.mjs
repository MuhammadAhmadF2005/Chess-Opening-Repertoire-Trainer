import fs from 'fs';
import path from 'path';

const pkgPath = path.resolve('./node_modules/@chess-openings/eco.json/package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
console.log(pkg.main || pkg.exports);
