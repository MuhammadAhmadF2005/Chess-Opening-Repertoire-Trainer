import { useState } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { lookupByMoves } from '@chess-openings/eco.json';
import SharedLayout from '../components/SharedLayout';

export default function ObservationMode({ AppMode, SetAppMode, Openings }) {
  const [Game, SetGame] = useState(new Chess());
  const [DetectedOpening, SetDetectedOpening] = useState('Starting Position');
  const [LastError, SetLastError] = useState('');

  function ResetGame() {
    SetGame(new Chess());
    SetLastError('');
    SetDetectedOpening('Starting Position');
  }

  function OnPieceDrop({ sourceSquare, targetSquare }) {
    const GameCopy = new Chess();
    GameCopy.loadPgn(Game.pgn());

    try {
      const MoveResult = GameCopy.move({ from: sourceSquare, to: targetSquare, promotion: "q" });
      if (MoveResult === null) return false;

      SetLastError('');
      if (Openings) {
        const Result = lookupByMoves(GameCopy, Openings);
        SetDetectedOpening(Result && Result.opening ? Result.opening.name : 'Unknown Position');
      }
      SetGame(GameCopy);
      return true;
    } catch {
      return false;
    }
  }

  const ChessboardOptions = {
    position: Game.fen(),
    boardOrientation: 'white',
    onPieceDrop: OnPieceDrop,
    customDarkSquareStyle: { backgroundColor: 'var(--color-board-dark)' },
    customLightSquareStyle: { backgroundColor: 'var(--color-board-light)' },
    customBoardStyle: { borderRadius: '0.25rem', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.5)' },
    animationDuration: 300
  };

  const SidebarContent = (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-slate-700">
        <div className="text-center">
          <h3 className="text-sm text-slate-400 mb-2 uppercase">Current Opening</h3>
          <div className="text-xl font-bold text-emerald-300">{DetectedOpening}</div>
        </div>
      </div>
    </div>
  );

  return (
    <SharedLayout 
      AppMode={AppMode} 
      SetAppMode={SetAppMode} 
      SidebarContent={SidebarContent}
      BoardContent={<Chessboard {...ChessboardOptions} />}
      LastError={LastError}
      ResetGame={ResetGame}
    />
  );
}
