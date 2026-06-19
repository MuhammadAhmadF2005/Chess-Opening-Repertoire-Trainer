import { useState, useEffect, useRef } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { lookupByMoves } from '@chess-openings/eco.json';
import Tree from 'react-d3-tree';
import SharedLayout from '../components/SharedLayout';
import StockfishWorker from '../stockfishWorker?worker';
import { PopularOpenings } from '../constants';
import { Trash2 } from 'lucide-react';

export default function TrainerMode({ AppMode, SetAppMode, Openings, CustomOpenings, SetCustomOpenings }) {
  const [Game, SetGame] = useState(new Chess());
  const [PlayerColor, SetPlayerColor] = useState('w');
  const [TargetOpening, SetTargetOpening] = useState(PopularOpenings[0]);
  const [ExpectedMoves, SetExpectedMoves] = useState([]);
  const [TreeData, SetTreeData] = useState({ name: 'Start' });
  const [LastError, SetLastError] = useState('');
  const TreeContainerRef = useRef(null);
  const EngineWorkerRef = useRef(null);

  useEffect(() => {
    EngineWorkerRef.current = new StockfishWorker();
    return () => {
      if (EngineWorkerRef.current) {
        EngineWorkerRef.current.terminate();
      }
    };
  }, []);

  useEffect(() => {
    if (TargetOpening) {
      const TempGame = new Chess();
      try {
        TempGame.loadPgn(TargetOpening.Moves);
        const MovesArray = TempGame.history();
        SetExpectedMoves(MovesArray);
        ResetGame(MovesArray);
      } catch (err) {
        console.error("Error parsing target opening PGN", err);
      }
    }
    // eslint-disable-next-line
  }, [TargetOpening, PlayerColor]);

  function BuildMoveTree(MovesArray, CurrentIndex) {
    let RootNode = { name: 'Start', attributes: { status: 'Played' } };
    let CurrentNode = RootNode;

    MovesArray.forEach((Move, Index) => {
      const NewNode = { 
        name: Move, 
        attributes: { status: Index < CurrentIndex ? 'Played' : (Index === CurrentIndex ? 'Next' : 'Pending') },
        nodeSvgShape: {
          shape: 'circle',
          shapeProps: {
            r: 10,
            fill: Index < CurrentIndex ? '#a7f3d0' : (Index === CurrentIndex ? '#60a5fa' : '#475569')
          }
        }
      };
      CurrentNode.children = [NewNode];
      CurrentNode = NewNode;
    });
    SetTreeData(RootNode);
  }

  function ResetGame(OverrideMoves = ExpectedMoves) {
    const NewGame = new Chess();
    SetLastError('');
    BuildMoveTree(OverrideMoves, 0);

    if (PlayerColor === 'b' && OverrideMoves.length > 0) {
      NewGame.move(OverrideMoves[0]);
      BuildMoveTree(OverrideMoves, 1);
    }
    SetGame(NewGame);
  }

  const AutoPlayOpponentMove = (CurrentGameCopy, MoveIndex) => {
    if (MoveIndex >= ExpectedMoves.length) {
      SetLastError("Opening sequence completed!");
      return;
    }
    const NextMove = ExpectedMoves[MoveIndex];
    setTimeout(() => {
      const AutoGameCopy = new Chess();
      AutoGameCopy.loadPgn(CurrentGameCopy.pgn());
      AutoGameCopy.move(NextMove);
      SetGame(AutoGameCopy);
      BuildMoveTree(ExpectedMoves, MoveIndex + 1);
    }, 500);
  };

  const EvaluateFen = (Fen) => {
    return new Promise((resolve) => {
      let FinalScore = 0;
      let TimeoutId = null;
      const Cleanup = () => {
        if (TimeoutId) clearTimeout(TimeoutId);
        EngineWorkerRef.current.removeEventListener('message', Listener);
      };
      const Listener = (e) => {
        const Line = e.data;
        if (typeof Line !== 'string') return;
        if (Line.includes('info depth')) {
          const CpMatch = Line.match(/score cp (-?\d+)/);
          const MateMatch = Line.match(/score mate (-?\d+)/);
          if (CpMatch) {
            FinalScore = parseInt(CpMatch[1], 10) / 100;
          } else if (MateMatch) {
            const MateIn = parseInt(MateMatch[1], 10);
            FinalScore = MateIn > 0 ? 100 : -100;
          }
        }
        if (Line.startsWith('bestmove')) {
          Cleanup();
          resolve(FinalScore);
        }
      };
      TimeoutId = setTimeout(() => { Cleanup(); resolve(FinalScore); }, 5000);
      EngineWorkerRef.current.addEventListener('message', Listener);
      EngineWorkerRef.current.postMessage('ucinewgame');
      EngineWorkerRef.current.postMessage('position fen ' + Fen);
      EngineWorkerRef.current.postMessage('go depth 16');
    });
  };

  const EvaluateDeviation = async (ExpectedFen, ActualFen, ExpectedMove, PlayedMove) => {
    SetLastError('Analyzing mistake...');
    const GetScoreFromWhitePerspective = async (Fen) => {
      const Score = await EvaluateFen(Fen);
      if (Score === null) return 0;
      const IsWhiteToMove = Fen.split(' ')[1] === 'w';
      return IsWhiteToMove ? Score : -Score;
    };
    const ExpectedScore = await GetScoreFromWhitePerspective(ExpectedFen);
    const ActualScore = await GetScoreFromWhitePerspective(ActualFen);
    let Drop = PlayerColor === 'w' ? (ExpectedScore - ActualScore) : (ActualScore - ExpectedScore);
    
    let SeverityLabel = "🤔 Inaccuracy";
    if (Drop >= 1.0) SeverityLabel = "⚠️ Blunder";
    else if (Drop >= 0.3) SeverityLabel = "❌ Mistake";
    
    const DisplayDrop = Math.max(0, Drop).toFixed(1);
    SetLastError(`${SeverityLabel}! Expected ${ExpectedMove}, but you played ${PlayedMove}. (Evaluation dropped by ${DisplayDrop})`);
  };

  function OnPieceDrop({ sourceSquare, targetSquare }) {
    const GameCopy = new Chess();
    GameCopy.loadPgn(Game.pgn());
    const CurrentMoveIndex = GameCopy.history().length;
    try {
      const MoveResult = GameCopy.move({ from: sourceSquare, to: targetSquare, promotion: "q" });
      if (MoveResult === null) return false;

      const ExpectedMove = ExpectedMoves[CurrentMoveIndex];
      if (MoveResult.san !== ExpectedMove) {
        let AlternativeOpeningName = null;
        if (Openings) {
          const Result = lookupByMoves(GameCopy, Openings);
          if (Result && Result.opening && Result.opening.name) {
            AlternativeOpeningName = Result.opening.name;
          }
        }
        if (AlternativeOpeningName) {
          SetLastError(`Valid Theory! You played the ${AlternativeOpeningName}. That is a great move, but we are practicing the ${TargetOpening.Name} sequence. Try again.`);
          return false;
        }

        const ExpectedGameCopy = new Chess();
        ExpectedGameCopy.loadPgn(Game.pgn());
        ExpectedGameCopy.move(ExpectedMove);
        const ExpectedFen = ExpectedGameCopy.fen();
        const ActualFen = GameCopy.fen();
        EvaluateDeviation(ExpectedFen, ActualFen, ExpectedMove, MoveResult.san);
        return false;
      }
      SetLastError('');
      SetGame(GameCopy);
      BuildMoveTree(ExpectedMoves, CurrentMoveIndex + 1);
      AutoPlayOpponentMove(GameCopy, CurrentMoveIndex + 1);
      return true;
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

  const DeleteCustomOpening = () => {
    const UpdatedOpenings = CustomOpenings.filter(Op => Op.Name !== TargetOpening.Name);
    SetCustomOpenings(UpdatedOpenings);
    localStorage.setItem('CustomOpenings', JSON.stringify(UpdatedOpenings));
    SetTargetOpening(PopularOpenings[0]);
  };

  const IsCustomOpeningSelected = CustomOpenings.some(Op => Op.Name === TargetOpening?.Name);

  const SidebarContent = (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-slate-700">
        <div className="w-full space-y-4">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Select Target Opening</label>
            <div className="flex gap-2">
              <select 
                className="flex-1 p-2 bg-slate-900 border border-slate-600 rounded text-sm text-white"
                value={TargetOpening?.Name || ''}
                onChange={(Event) => {
                  const AllOpenings = [...PopularOpenings, ...CustomOpenings];
                  const Selected = AllOpenings.find(Op => Op.Name === Event.target.value);
                  SetTargetOpening(Selected);
                }}
              >
                {[...PopularOpenings, ...CustomOpenings].map(Op => <option key={Op.Name} value={Op.Name}>{Op.Name}</option>)}
              </select>
              {IsCustomOpeningSelected && (
                <button 
                  onClick={DeleteCustomOpening}
                  className="p-2 bg-red-900/50 hover:bg-red-800 border border-red-700 rounded text-red-400 transition-colors"
                  title="Delete Custom Opening"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Play As</label>
            <div className="flex gap-2">
              <button 
                onClick={() => SetPlayerColor('w')}
                className={`flex-1 py-1 text-xs rounded transition-colors ${PlayerColor === 'w' ? 'bg-slate-200 text-slate-900 font-bold' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
              >
                White
              </button>
              <button 
                onClick={() => SetPlayerColor('b')}
                className={`flex-1 py-1 text-xs rounded transition-colors ${PlayerColor === 'b' ? 'bg-slate-900 text-white font-bold border border-slate-500' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
              >
                Black
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="flex-1 w-full bg-slate-900/50" ref={TreeContainerRef}>
        <Tree 
          data={TreeData} 
          orientation="vertical"
          translate={{ x: 150, y: 50 }}
          pathFunc="step"
          nodeSize={{ x: 80, y: 60 }}
          textLayout={{ textAnchor: "start", x: 15, y: 5, transform: undefined }}
          styles={{
            links: { stroke: '#475569', strokeWidth: 2 },
            nodes: { node: { circle: { stroke: '#1e293b', strokeWidth: 2 } }, leafNode: { circle: { stroke: '#1e293b', strokeWidth: 2 } } }
          }}
        />
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
      ResetGame={() => ResetGame()}
    />
  );
}
