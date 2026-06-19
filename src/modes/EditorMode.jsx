import { useState } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import SharedLayout from '../components/SharedLayout';

export default function EditorMode({ AppMode, SetAppMode, CustomOpenings, SetCustomOpenings }) {
  const [Game, SetGame] = useState(new Chess());
  const [EditorOpeningName, SetEditorOpeningName] = useState('');
  const [LastError, SetLastError] = useState('');

  function ResetGame() {
    SetGame(new Chess());
    SetLastError('');
  }

  function SaveCustomOpening() {
    if (!EditorOpeningName.trim()) {
      SetLastError("Please enter a name for your custom opening.");
      return;
    }
    if (Game.history().length === 0) {
      SetLastError("Please make at least one move to save an opening.");
      return;
    }
    
    const NewOpening = { Name: EditorOpeningName, Moves: Game.pgn() };
    const UpdatedOpenings = [...CustomOpenings, NewOpening];
    
    SetCustomOpenings(UpdatedOpenings);
    localStorage.setItem('CustomOpenings', JSON.stringify(UpdatedOpenings));
    
    SetEditorOpeningName('');
    SetLastError(`Successfully saved "${NewOpening.Name}"! You can now practice it in Trainer Mode.`);
  }

  function OnPieceDrop({ sourceSquare, targetSquare }) {
    const GameCopy = new Chess();
    GameCopy.loadPgn(Game.pgn());
    try {
      const MoveResult = GameCopy.move({ from: sourceSquare, to: targetSquare, promotion: "q" });
      if (MoveResult === null) return false;

      SetLastError('');
      SetGame(GameCopy);
      return true;
    } catch { return false; }
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
      <div className="flex-1 w-full flex flex-col p-6 bg-slate-900/50">
        <h2 className="text-xl font-bold text-slate-200 mb-4">Repertoire Builder</h2>
        <p className="text-sm text-slate-400 mb-4">Make moves on the board to record your custom sequence.</p>
        
        <div className="mb-4">
          <label className="text-xs text-slate-400 mb-1 block">Opening Name</label>
          <input 
            type="text" 
            value={EditorOpeningName}
            onChange={(e) => SetEditorOpeningName(e.target.value)}
            placeholder="e.g., My Secret Italian Line"
            className="w-full p-2 bg-slate-800 border border-slate-600 rounded text-sm text-white"
          />
        </div>
        
        <div className="flex gap-2">
          <button 
            onClick={SaveCustomOpening}
            className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-lg transition-colors"
          >
            Save Opening
          </button>
          <button 
            onClick={ResetGame}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
          >
            Clear
          </button>
        </div>
        
        <div className="mt-6">
          <h3 className="text-sm text-slate-400 mb-2 uppercase">Recorded Moves</h3>
          <div className="font-mono text-sm text-orange-300 break-words">
            {Game.pgn() || "No moves recorded yet."}
          </div>
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
