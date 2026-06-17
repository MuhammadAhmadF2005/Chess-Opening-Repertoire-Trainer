import { Chess } from 'chess.js';
const chess = new Chess();
try {
  const move = chess.move({ from: 'e2', to: 'e4', promotion: 'q' });
  console.log("Move successful:", move);
  console.log("FEN:", chess.fen());
} catch (e) {
  console.log("Error:", e.message);
}
