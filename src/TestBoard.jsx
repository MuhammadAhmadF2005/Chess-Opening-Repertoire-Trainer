import { useState } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';

export default function TestBoard() {
  const [Game, SetGame] = useState(new Chess());

  function OnPieceDrop(SourceSquare, TargetSquare) {
    console.log("TESTBOARD - Drop attempted:", SourceSquare, "to", TargetSquare);
    const GameCopy = new Chess(Game.fen());
    try {
      const MoveResult = GameCopy.move({ from: SourceSquare, to: TargetSquare, promotion: 'q' });
      if (MoveResult === null) return false;
      SetGame(GameCopy);
      return true;
    } catch (Error) {
      console.error(Error);
      return false;
    }
  }

  return (
    <div style={{ width: '400px', margin: 'auto', marginTop: '50px' }}>
      <h2>Test Board</h2>
      <Chessboard position={Game.fen()} onPieceDrop={OnPieceDrop}/>
    </div>
  );
}
