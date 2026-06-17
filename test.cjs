const eco = require('@chess-openings/eco.json');
console.log('Length:', eco.length);
if (eco.length > 0) {
  console.log('Sample:', eco[0]);
} else {
  console.log('Keys:', Object.keys(eco).slice(0, 10));
}
