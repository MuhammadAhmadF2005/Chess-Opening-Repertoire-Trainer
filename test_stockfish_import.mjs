import Stockfish from 'stockfish.js';
console.log("Stockfish type:", typeof Stockfish);
console.log("Stockfish content:", Stockfish.toString().slice(0, 500));
try {
  const sf = Stockfish();
  console.log("sf keys:", Object.keys(sf));
  console.log("sf methods:", Object.getOwnPropertyNames(sf));
  console.log("sf.postMessage type:", typeof sf.postMessage);
} catch (e) {
  console.error("Error calling Stockfish():", e);
}
