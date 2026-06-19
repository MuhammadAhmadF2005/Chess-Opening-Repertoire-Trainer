import { useState, useEffect, useRef } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { openingBook, lookupByMoves } from '@chess-openings/eco.json';
import { Loader2, Trash2 } from 'lucide-react';
import Tree from 'react-d3-tree';
import StockfishWorker from './stockfishWorker?worker';
import './index.css';

// Curated list of popular openings for the demo dropdown
const PopularOpenings = [
  { Name: "Italian Game", Moves: "1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5" },
  { Name: "Ruy Lopez", Moves: "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6" },
  { Name: "Caro-Kann Defense", Moves: "1. e4 c6 2. d4 d5 3. Nc3 dxe4" },
  { Name: "Sicilian Defense", Moves: "1. e4 c5 2. Nf3 d6 3. d4 cxd4" },
  { Name: "French Defense", Moves: "1. e4 e6 2. d4 d5 3. Nc3 Nf6" }
];

export default function App() {
  const [Game, SetGame] = useState(new Chess());
  const [Openings, SetOpenings] = useState(null);
  const [DetectedOpening, SetDetectedOpening] = useState('Starting Position');
  const [IsLoadingEco, SetIsLoadingEco] = useState(true);
  const [LastError, SetLastError] = useState('');
  
  // App Mode State
  const [AppMode, SetAppMode] = useState('Observation');
  const [PlayerColor, SetPlayerColor] = useState('w');
  const [TargetOpening, SetTargetOpening] = useState(PopularOpenings[0]);
  const [ExpectedMoves, SetExpectedMoves] = useState([]);
  const [TreeData, SetTreeData] = useState({ name: 'Start' });
  
  // Quiz State
  const [QuizTargetMove, SetQuizTargetMove] = useState('');
  const [QuizStats, SetQuizStats] = useState({ Correct: 0, Attempts: 0 });
  const [QuizMistakes, SetQuizMistakes] = useState(0);
  
  // Editor State
  const [CustomOpenings, SetCustomOpenings] = useState(() => {
    const Saved = localStorage.getItem('CustomOpenings');
    return Saved ? JSON.parse(Saved) : [];
  });
  const [EditorOpeningName, SetEditorOpeningName] = useState('');
  
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
    openingBook().then((Data) => {
      SetOpenings(Data);
      SetIsLoadingEco(false);
    }).catch((Error) => {
      console.error("Failed to load ECO database", Error);
      SetIsLoadingEco(false);
    });
  }, []);

  // Parse the target opening string into an array of expected SAN moves
  useEffect(() => {
    if (TargetOpening) {
      const TempGame = new Chess();
      try {
        TempGame.loadPgn(TargetOpening.Moves);
        const MovesArray = TempGame.history();
        SetExpectedMoves(MovesArray);
        
        // Only reset if in trainer mode, otherwise it will interfere when switching modes
        if (AppMode === 'Trainer') {
          ResetGame(MovesArray);
        }
      } catch (err) {
        console.error("Error parsing target opening PGN", err);
      }
    }
  }, [TargetOpening, PlayerColor, AppMode]);

  function GenerateQuiz() {
    const RandomIndex = Math.floor(Math.random() * PopularOpenings.length);
    const SelectedOpening = PopularOpenings[RandomIndex];
    const TempGame = new Chess();
    TempGame.loadPgn(SelectedOpening.Moves);
    const MovesArray = TempGame.history();
    
    // Pick a random index to stop at (ensuring it stops before the very last move)
    const StopIndex = Math.floor(Math.random() * (MovesArray.length - 1));
    
    const NewGame = new Chess();
    for (let i = 0; i <= StopIndex; i++) {
      NewGame.move(MovesArray[i]);
    }
    
    SetGame(NewGame);
    SetQuizTargetMove(MovesArray[StopIndex + 1]);
    SetQuizMistakes(0);
    
    // Automatically flip the board to match the correct player's perspective
    const CurrentTurn = NewGame.turn();
    SetPlayerColor(CurrentTurn);
    
    SetLastError(`Quiz ready! It is ${CurrentTurn === 'w' ? 'White' : 'Black'}'s turn. What is the theoretical next move?`);
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

  const DeleteCustomOpening = () => {
    const UpdatedOpenings = CustomOpenings.filter(Op => Op.Name !== TargetOpening.Name);
    SetCustomOpenings(UpdatedOpenings);
    localStorage.setItem('CustomOpenings', JSON.stringify(UpdatedOpenings));
    SetTargetOpening(PopularOpenings[0]);
  };

  const IsCustomOpeningSelected = CustomOpenings.some(Op => Op.Name === TargetOpening?.Name);

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
  };

  function ResetGame(OverrideMoves = ExpectedMoves) {
    const NewGame = new Chess();
    SetLastError('');
    SetDetectedOpening('Starting Position');
    BuildMoveTree(OverrideMoves, 0);

    // Apply first move instantly to avoid timeout race conditions during setup
    if (AppMode === 'Trainer' && PlayerColor === 'b' && OverrideMoves.length > 0) {
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
      const AutoPastMoves = CurrentGameCopy.history();
      for (let i = 0; i < AutoPastMoves.length; i++) {
        AutoGameCopy.move(AutoPastMoves[i]);
      }
      
      AutoGameCopy.move(NextMove);
      SetGame(AutoGameCopy);
      BuildMoveTree(ExpectedMoves, MoveIndex + 1);
    }, 500); // 500ms delay for realism
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

      TimeoutId = setTimeout(() => {
        Cleanup();
        resolve(FinalScore);
      }, 5000);

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
    
    // Determine severity label based on the point drop
    let SeverityLabel = "🤔 Inaccuracy";
    if (Drop >= 1.0) {
      SeverityLabel = "⚠️ Blunder";
    } else if (Drop >= 0.3) {
      SeverityLabel = "❌ Mistake";
    }
    
    // Format the drop to 1 decimal place, ensuring it doesn't show negative drops if the engine finds a better line
    const DisplayDrop = Math.max(0, Drop).toFixed(1);

    SetLastError(`${SeverityLabel}! Expected ${ExpectedMove}, but you played ${PlayedMove}. (Evaluation dropped by ${DisplayDrop})`);
  };

  function OnPieceDrop(sourceSquare, targetSquare, piece) {
    try {
      // If the new signature is being used
      if (sourceSquare && typeof sourceSquare === 'object' && sourceSquare.sourceSquare) {
        targetSquare = sourceSquare.targetSquare;
        sourceSquare = sourceSquare.sourceSquare;
      }
      
      const GameCopy = new Chess();
      const PastMoves = Game.history();
      for (let i = 0; i < PastMoves.length; i++) {
        GameCopy.move(PastMoves[i]);
      }
      const CurrentMoveIndex = GameCopy.history().length;

      const MoveResult = GameCopy.move({ from: sourceSquare, to: targetSquare, promotion: "q" });
      if (!MoveResult) return false;


      // EDITOR MODE LOGIC
      if (AppMode === 'Editor') {
        SetLastError('');
        SetGame(GameCopy);
        return true;
      }

      // QUIZ MODE LOGIC
      if (AppMode === 'Quiz') {
        if (MoveResult.san === QuizTargetMove) {
          let NewStats = { ...QuizStats, Attempts: QuizStats.Attempts + 1, Correct: QuizStats.Correct + 1 };
          SetQuizStats(NewStats);
          SetQuizMistakes(0); // Reset for next time
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
            
            // Check for Alternative Openings (Multi-Branch Analysis)
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
          return false; // Snap piece back
        }
      }

      // TRAINER MODE LOGIC
      if (AppMode === 'Trainer') {
        const ExpectedMove = ExpectedMoves[CurrentMoveIndex];

        if (!ExpectedMove) {
          SetLastError("Opening sequence completed! You've successfully finished this line.");
          return false;
        }

        if (MoveResult.san !== ExpectedMove) {
          // 1. Check if the deviated sequence is actually a known opening
          let AlternativeOpeningName = null;
          if (Openings) {
            const Result = lookupByMoves(GameCopy, Openings);
            if (Result && Result.opening && Result.opening.name) {
              AlternativeOpeningName = Result.opening.name;
            }
          }

          // 2. If it's a known opening, praise them but reject the move gently
          if (AlternativeOpeningName) {
            SetLastError(`Valid Theory! You played the ${AlternativeOpeningName}. That is a great move, but we are practicing the ${TargetOpening.Name} sequence. Try again.`);
            return false;
          }

          // 3. If it is NOT in the database, treat it as a real mistake and fire Stockfish
          const ExpectedGameCopy = new Chess();
          const ExpectedPastMoves = Game.history();
          for (let i = 0; i < ExpectedPastMoves.length; i++) {
            ExpectedGameCopy.move(ExpectedPastMoves[i]);
          }
          ExpectedGameCopy.move(ExpectedMove);
          const ExpectedFen = ExpectedGameCopy.fen();

          const ActualFen = GameCopy.fen();

          // Run engine evaluation in background
          EvaluateDeviation(ExpectedFen, ActualFen, ExpectedMove, MoveResult.san);
          return false; // Reject the move
        }

        SetLastError('');
        SetGame(GameCopy);
        BuildMoveTree(ExpectedMoves, CurrentMoveIndex + 1);

        // Trigger Opponent Move
        AutoPlayOpponentMove(GameCopy, CurrentMoveIndex + 1);
        return true;
      }

      // OBSERVATION MODE LOGIC (Fallback)
      SetLastError('');
      if (Openings) {
        const Result = lookupByMoves(GameCopy, Openings);
        SetDetectedOpening(Result && Result.opening ? Result.opening.name : 'Unknown Position');
      }
      SetGame(GameCopy);
      return true;

    } catch (error) {
      console.error("Piece drop error:", error);
      
      // chess.js throws an error for illegal moves. Catch it and inform the user.
      const Piece = Game.get(sourceSquare);
      if (Piece && Piece.color !== Game.turn()) {
        SetLastError(`Invalid move! It is ${Game.turn() === 'w' ? 'White' : 'Black'}'s turn.`);
      } else {
        SetLastError("Invalid move according to chess rules.");
      }
      return false;
    }
  }

  // Configuration object required for react-chessboard v5
  const ChessboardOptions = {
    position: Game.fen(),
    boardOrientation: PlayerColor === 'w' ? 'white' : 'black',
    onPieceDrop: OnPieceDrop,
    customDarkSquareStyle: { backgroundColor: 'var(--color-board-dark)' },
    customLightSquareStyle: { backgroundColor: 'var(--color-board-light)' },
    customBoardStyle: { borderRadius: '0.25rem', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.5)' },
    animationDuration: 300
  };

  const SwitchMode = (NewMode) => {
    SetAppMode(NewMode);
    SetGame(new Chess());
    SetLastError('');
    if (NewMode === 'Quiz') {
      GenerateQuiz();
    }
  };

  return (
    <div className="flex h-screen w-full bg-slate-900 text-slate-100 overflow-hidden font-sans">
      
      {/* Sidebar Area */}
      <div className="w-1/3 flex flex-col border-r border-slate-700 bg-slate-800 shadow-xl z-10 relative">
        <div className="p-6 border-b border-slate-700 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">Opening Trainer</h1>
            
            {/* Mode Switcher */}
            <div className="mt-2 flex gap-2">
              <button 
                onClick={() => SwitchMode('Observation')}
                className={`px-3 py-1 text-xs rounded ${AppMode === 'Observation' ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-300'}`}
              >
                Observation
              </button>
              <button 
                onClick={() => SwitchMode('Trainer')}
                className={`px-3 py-1 text-xs rounded ${AppMode === 'Trainer' ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-300'}`}
              >
                Trainer
              </button>
              <button 
                onClick={() => SwitchMode('Quiz')}
                className={`px-3 py-1 text-xs rounded ${AppMode === 'Quiz' ? 'bg-purple-500 text-white' : 'bg-slate-700 text-slate-300'}`}
              >
                Quiz
              </button>
              <button 
                onClick={() => SwitchMode('Editor')}
                className={`px-3 py-1 text-xs rounded ${AppMode === 'Editor' ? 'bg-orange-500 text-white' : 'bg-slate-700 text-slate-300'}`}
              >
                Editor
              </button>
            </div>
          </div>
          <button onClick={() => { AppMode === 'Quiz' ? GenerateQuiz() : ResetGame() }} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm">Reset</button>
        </div>
        
        <div className="flex-1 w-full flex flex-col relative overflow-hidden">
           {IsLoadingEco ? (
             <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>
           ) : (
             <div className="flex flex-col h-full">
               {/* Contextual Top Area */}
               <div className="p-6 border-b border-slate-700">
                 {AppMode === 'Trainer' ? (
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
                 ) : AppMode === 'Quiz' ? (
                   <div className="text-center">
                     <h3 className="text-sm text-slate-400 mb-2 uppercase">Current Mode</h3>
                     <div className="text-xl font-bold text-purple-300">Interactive Quiz</div>
                   </div>
                 ) : AppMode === 'Editor' ? (
                   <div className="text-center">
                     <h3 className="text-sm text-slate-400 mb-2 uppercase">Current Mode</h3>
                     <div className="text-xl font-bold text-orange-300">Repertoire Builder</div>
                   </div>
                 ) : (
                   <div className="text-center">
                     <h3 className="text-sm text-slate-400 mb-2 uppercase">Current Opening</h3>
                     <div className="text-xl font-bold text-emerald-300">{DetectedOpening}</div>
                   </div>
                 )}
               </div>

               {/* Visual Move Tree Area or Quiz Dashboard */}
               {AppMode === 'Trainer' && (
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
               )}

               {AppMode === 'Quiz' && (
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
               )}

               {AppMode === 'Editor' && (
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
                       onClick={() => { SetGame(new Chess()); SetLastError(''); }}
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
               )}
             </div>
           )}
        </div>
      </div>

      {/* Main Board Area */}
      <div className="w-2/3 flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 relative">
        <div className="w-[600px] h-[600px]">
          <Chessboard options={ChessboardOptions} />
        </div>
        
        <div className="mt-6 h-12">
          {LastError && (
            <div className="text-red-400 bg-red-400/10 px-4 py-2 rounded-md font-mono text-sm border border-red-400/20">
              {LastError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}