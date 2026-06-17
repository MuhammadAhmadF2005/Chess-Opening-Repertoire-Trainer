import { Chess } from 'chess.js';
import { openingBook, lookupByMoves } from '@chess-openings/eco.json';

async function test() {
  const openings = await openingBook();
  const chess = new Chess();
  
  // Make first move
  chess.move('e4');
  console.log("History before lookup:", chess.history());
  
  const result = lookupByMoves(chess, openings);
  
  console.log("Opening found:", result.opening?.name);
  console.log("History after lookup:", chess.history());
  
  try {
    // Attempt next move
    chess.move('e5');
    console.log("History after second move:", chess.history());
  } catch (e) {
    console.error("Error making second move:", e.message);
  }
}

test();
