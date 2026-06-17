import { useState, useEffect, useRef } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { openingBook, lookupByMoves } from '@chess-openings/eco.json';
import { Loader2 } from 'lucide-react';
import Tree from 'react-d3-tree';
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
  
  // New State for Trainer Mode
  const [IsTrainerMode, SetIsTrainerMode] = useState(false);
  const [PlayerColor, SetPlayerColor] = useState('w');
  const [TargetOpening, SetTargetOpening] = useState(PopularOpenings[0]);
  const [ExpectedMoves, SetExpectedMoves] = useState([]);
  const [TreeData, SetTreeData] = useState({ name: 'Start' });
  const TreeContainerRef = useRef(null);

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
        // eslint-disable-next-line
        SetExpectedMoves(MovesArray);
        
        // The useEffect is now the ONLY thing allowed to call ResetGame
        ResetGame(MovesArray);
      } catch (err) {
        console.error("Error parsing target opening PGN", err);
      }
    }
  }, [TargetOpening, PlayerColor, IsTrainerMode]);

  function BuildMoveTree(MovesArray, CurrentIndex) {
    // Builds a simple hierarchical tree for react-d3-tree
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
    if (IsTrainerMode && PlayerColor === 'b' && OverrideMoves.length > 0) {
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
      // Clone using PGN to preserve history
      const AutoGameCopy = new Chess();
      AutoGameCopy.loadPgn(CurrentGameCopy.pgn());
      
      AutoGameCopy.move(NextMove);
      SetGame(AutoGameCopy);
      BuildMoveTree(ExpectedMoves, MoveIndex + 1);
    }, 500); // 500ms delay for realism
  };

  function OnPieceDrop({ sourceSquare, targetSquare }) {
    // Clone using PGN to preserve history
    const GameCopy = new Chess();
    GameCopy.loadPgn(Game.pgn());
    
    const CurrentMoveIndex = GameCopy.history().length;
    
    try {
      const MoveResult = GameCopy.move({ from: sourceSquare, to: targetSquare, promotion: "q" });
      
      if (MoveResult === null) return false;

      // TRAINER MODE LOGIC
      if (IsTrainerMode) {
        const ExpectedMove = ExpectedMoves[CurrentMoveIndex];
        
        if (MoveResult.san !== ExpectedMove) {
          SetLastError(`Mistake! Expected ${ExpectedMove}, but you played ${MoveResult.san}.`);
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
      
    } catch {
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
                onClick={() => SetIsTrainerMode(false)}
                className={`px-3 py-1 text-xs rounded ${!IsTrainerMode ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-300'}`}
              >
                Observation
              </button>
              <button 
                onClick={() => SetIsTrainerMode(true)}
                className={`px-3 py-1 text-xs rounded ${IsTrainerMode ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-300'}`}
              >
                Trainer
              </button>
            </div>
          </div>
          <button onClick={ResetGame} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm">Reset</button>
        </div>
        
        <div className="flex-1 w-full flex flex-col relative overflow-hidden">
           {IsLoadingEco ? (
             <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>
           ) : (
             <div className="flex flex-col h-full">
               {/* Contextual Top Area */}
               <div className="p-6 border-b border-slate-700">
                 {IsTrainerMode ? (
                   <div className="w-full space-y-4">
                     <div>
                       <label className="text-xs text-slate-400 mb-1 block">Select Target Opening</label>
                       <select 
                         className="w-full p-2 bg-slate-900 border border-slate-600 rounded text-sm"
                         onChange={(Event) => {
                           const Selected = PopularOpenings.find(Op => Op.Name === Event.target.value);
                           SetTargetOpening(Selected);
                         }}
                       >
                         {PopularOpenings.map(Op => <option key={Op.Name} value={Op.Name}>{Op.Name}</option>)}
                       </select>
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
                 ) : (
                   <div className="text-center">
                     <h3 className="text-sm text-slate-400 mb-2 uppercase">Current Opening</h3>
                     <div className="text-xl font-bold text-emerald-300">{DetectedOpening}</div>
                   </div>
                 )}
               </div>

               {/* Visual Move Tree Area */}
               {IsTrainerMode && (
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