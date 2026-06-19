import { useState, useEffect } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { lookupByMoves } from '@chess-openings/eco.json';
import SharedLayout from '../components/SharedLayout';
import { PopularOpenings } from '../constants';

export default function QuizMode({ AppMode, SetAppMode, Openings }) {
  const [Game, SetGame] = useState(new Chess());
  const [PlayerColor, SetPlayerColor] = useState('w');
  const [QuizTargetMove, SetQuizTargetMove] = useState('');
  const [QuizStats, SetQuizStats] = useState({ Correct: 0, Attempts: 0 });
  const [QuizMistakes, SetQuizMistakes] = useState(0);
  const [LastError, SetLastError] = useState('');

  // Generate an initial quiz when entering mode
  useEffect(() => {
    GenerateQuiz();
    // eslint-disable-next-line
  }, []);

  function GenerateQuiz() {
    const RandomIndex = Math.floor(Math.random() * PopularOpenings.length);
    const SelectedOpening = PopularOpenings[RandomIndex];
    const TempGame = new Chess();
    TempGame.loadPgn(SelectedOpening.Moves);
    const MovesArray = TempGame.history();
    
    const StopIndex = Math.floor(Math.random() * (MovesArray.length - 1));
    const NewGame = new Chess();
    for (let i = 0; i <= StopIndex; i++) {
      NewGame.move(MovesArray[i]);
    }
    
    SetGame(NewGame);
    SetQuizTargetMove(MovesArray[StopIndex + 1]);
    SetQuizMistakes(0);
    
    const CurrentTurn = NewGame.turn();
    SetPlayerColor(CurrentTurn);
    SetLastError(`Quiz ready! It is ${CurrentTurn === 'w' ? 'White' : 'Black'}'s turn. What is the theoretical next move?`);
  }

  function OnPieceDrop({ sourceSquare, targetSquare }) {
    const GameCopy = new Chess();
    GameCopy.loadPgn(Game.pgn());
    try {
      const MoveResult = GameCopy.move({ from: sourceSquare, to: targetSquare, promotion: "q" });
      if (MoveResult === null) {
        const Piece = Game.get(sourceSquare);
        if (Piece && Piece.color !== Game.turn()) {
          SetLastError(`Invalid move! It is ${Game.turn() === 'w' ? 'White' : 'Black'}'s turn.`);
        } else {
          SetLastError("Invalid move according to chess rules. Try again!");
        }
        return false;
      }

      if (MoveResult.san === QuizTargetMove) {
        let NewStats = { ...QuizStats, Attempts: QuizStats.Attempts + 1, Correct: QuizStats.Correct + 1 };
        SetQuizStats(NewStats);
        SetQuizMistakes(0);
        SetLastError("Success! You found the correct theoretical move.");
        SetGame(GameCopy);
        return true;
      } else {
        let NewStats = { ...QuizStats, Attempts: QuizStats.Attempts + 1 };
        SetQuizStats(NewStats);
        
        const CurrentMistakes = QuizMistakes + 1;
        SetQuizMistakes(CurrentMistakes);
        
        if (CurrentMistakes >= 5) {
          SetLastError("Incorrect! You have run out of attempts. The expected move was " + QuizTargetMove);
        } else {
          const AttemptsLeft = 5 - CurrentMistakes;
          let AlternativeOpeningName = null;
          if (Openings) {
            const Result = lookupByMoves(GameCopy, Openings);
            if (Result && Result.opening && Result.opening.name) {
              AlternativeOpeningName = Result.opening.name;
            }
          }
          if (AlternativeOpeningName) {
            SetLastError(`Valid Theory! You played the ${AlternativeOpeningName}. That is a great move, but not the theoretical move we are looking for. Try again. (${AttemptsLeft} attempts left)`);
          } else {
            SetLastError(`Incorrect! That is not the expected move. Try again. (${AttemptsLeft} attempts left)`);
          }
        }
        return false;
      }
    } catch { return false; }
  }

  const ChessboardOptions = {
    position: Game.fen(),
    boardOrientation: PlayerColor === 'w' ? 'white' : 'black',
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
          <h3 className="text-sm text-slate-400 mb-2 uppercase">Current Mode</h3>
          <div className="text-xl font-bold text-purple-300">Interactive Quiz</div>
        </div>
      </div>
      <div className="flex-1 w-full flex flex-col items-center justify-center p-6 bg-slate-900/50">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-200 mb-2">Quiz Dashboard</h2>
          <div className="text-6xl font-extrabold text-purple-400 mb-4">
            {Math.round((QuizStats.Correct / QuizStats.Attempts) * 100) || 0}%
          </div>
          <div className="text-sm text-slate-400 mb-8">
            Mastery ({QuizStats.Correct} / {QuizStats.Attempts} Attempts)
          </div>
          <button 
            onClick={GenerateQuiz}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg shadow-lg transition-colors"
          >
            Generate New Scenario
          </button>
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
      ResetGame={GenerateQuiz}
    />
  );
}
