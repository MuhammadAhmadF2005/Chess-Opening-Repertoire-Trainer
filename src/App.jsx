import { useState, useEffect, useRef, useCallback } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { openingBook, lookupByMoves } from '@chess-openings/eco.json';
import { Loader2, Trash2 } from 'lucide-react';
import Tree from 'react-d3-tree';
import './index.css';

/* ═══════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════ */

const DARK_SQUARE = { backgroundColor: '#b58863' };
const LIGHT_SQUARE = { backgroundColor: '#f0d9b5' };
const BOARD_STYLE = {
  borderRadius: '0.375rem',
  boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.5)',
};

const PopularOpenings = [
  { Name: 'Italian Game', Moves: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5' },
  { Name: 'Ruy Lopez', Moves: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6' },
  { Name: 'Caro-Kann Defense', Moves: '1. e4 c6 2. d4 d5 3. Nc3 dxe4' },
  { Name: 'Sicilian Defense', Moves: '1. e4 c5 2. Nf3 d6 3. d4 cxd4' },
  { Name: 'French Defense', Moves: '1. e4 e6 2. d4 d5 3. Nc3 Nf6' },
];

/* ═══════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════ */

/** Create a fresh Chess instance with the same move history. */
function cloneGame(g) {
  const c = new Chess();
  const pgn = g.pgn();
  if (pgn) c.loadPgn(pgn);
  return c;
}

/** Parse PGN text into an array of SAN strings. */
function pgnToMoves(pgn) {
  const t = new Chess();
  try {
    t.loadPgn(pgn);
    return t.history();
  } catch {
    return [];
  }
}

/* ═══════════════════════════════════════════════════════════════════
   App
   ═══════════════════════════════════════════════════════════════════ */

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

  /* ═══════════════════════════════════════════════════════════════
     Stockfish worker bootstrap
     ═══════════════════════════════════════════════════════════════ */
  useEffect(() => {
    try {
      const wasm =
        typeof WebAssembly === 'object' &&
        WebAssembly.validate(
          Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00),
        );
      engineRef.current = new Worker(wasm ? '/stockfish.wasm.js' : '/stockfish.js');
    } catch {
      // Stockfish unavailable
    }
    return () => {
      engineRef.current?.terminate();
      engineRef.current = null;
      if (opponentTimer.current) clearTimeout(opponentTimer.current);
    };
  }, []);

  /* ═══════════════════════════════════════════════════════════════
     ECO database
     ═══════════════════════════════════════════════════════════════ */
  useEffect(() => {
    openingBook()
      .then((d) => { setOpeningsDb(d); setIsLoadingEco(false); })
      .catch(() => setIsLoadingEco(false));
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
            fill: played ? '#b58863' : next ? '#f0d9b5' : '#57534e',
            stroke: '#1c1917',
            strokeWidth: 2,
          },
        },
      };
      cur.children = [node];
      cur = node;
    });
    setTreeData(root);
  }, []);

  /* ═══════════════════════════════════════════════════════════════
     Reset game
     ═══════════════════════════════════════════════════════════════ */
  const resetGame = useCallback(
    (overrideMoves) => {
      if (opponentTimer.current) {
        clearTimeout(opponentTimer.current);
        opponentTimer.current = null;
      }
      const moves = overrideMoves || expectedMoves;
      const fresh = new Chess();
      setLastError('');
      setDetectedOpening('Starting Position');
      buildTree(moves, 0);
      if (isTrainerMode && playerColor === 'b' && moves.length > 0) {
        try { fresh.move(moves[0]); buildTree(moves, 1); } catch { /* ignore */ }
      }
      setGame(fresh);
    },
    [expectedMoves, isTrainerMode, playerColor, buildTree],
  );

    // Apply first move instantly to avoid timeout race conditions during setup
    if (AppMode === 'Trainer' && PlayerColor === 'b' && OverrideMoves.length > 0) {
      NewGame.move(OverrideMoves[0]);
      BuildMoveTree(OverrideMoves, 1);
    }
    const fresh = new Chess();
    setLastError('');
    setDetectedOpening('Starting Position');
    buildTree(moves, 0);
    if (isTrainerMode && playerColor === 'b' && moves.length > 0) {
      try { fresh.move(moves[0]); buildTree(moves, 1); } catch { /* ignore */ }
    }
    setGame(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetOpening, playerColor, isTrainerMode]);

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

  /* ═══════════════════════════════════════════════════════════════
     Tree node click → jump board position
     ═══════════════════════════════════════════════════════════════ */
  const handleNodeClick = useCallback(
    (nodeDatum) => {
      if (!isTrainerMode) return;
      if (opponentTimer.current) { clearTimeout(opponentTimer.current); opponentTimer.current = null; }
      const ti = nodeDatum.attributes?.index !== undefined ? parseInt(nodeDatum.attributes.index, 10) : 0;
      const fresh = new Chess();
      for (let i = 0; i < ti && i < expectedMoves.length; i++) {
        try { fresh.move(expectedMoves[i]); } catch { break; }
      }
      setGame(fresh);
      buildTree(expectedMoves, ti);
      setLastError('');
      playSound(false);
      const opp = (playerColor === 'w' && ti % 2 !== 0) || (playerColor === 'b' && ti % 2 === 0);
      if (opp && ti < expectedMoves.length) autoPlayOpponent(fresh, ti);
    },
    [isTrainerMode, expectedMoves, playerColor, buildTree, playSound, autoPlayOpponent],
  );

  /* ═══════════════════════════════════════════════════════════════
     Stockfish deviation evaluator
     ═══════════════════════════════════════════════════════════════ */
  const evaluateDeviation = useCallback(
    async (expectedFen, actualFen, expectedMove, playedMove) => {
      setLastError('Analyzing mistake...');
      const getScore = (fen) =>
        new Promise((resolve) => {
          let tw;
          try {
            const wasm = typeof WebAssembly === 'object' && WebAssembly.validate(Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00));
            tw = new Worker(wasm ? '/stockfish.wasm.js' : '/stockfish.js');
          } catch { resolve(0); return; }
          let sc = 0;
          const to = setTimeout(() => { tw.terminate(); resolve(sc); }, 3000);
          const h = (e) => {
            const l = e.data;
            if (typeof l !== 'string') return;
            if (l.includes('info depth')) { const c = l.match(/score cp (-?\d+)/); if (c) sc = +c[1] / 100; }
            if (l.startsWith('bestmove')) { clearTimeout(to); tw.terminate(); resolve(fen.split(' ')[1] === 'w' ? sc : -sc); }
          };
          tw.addEventListener('message', h);
          tw.postMessage('ucinewgame');
          tw.postMessage('position fen ' + fen);
          tw.postMessage('go depth 12');
        });
      const es = await getScore(expectedFen);
      const as2 = await getScore(actualFen);
      const drop = playerColor === 'w' ? es - as2 : as2 - es;
      setLastError(`Mistake! Expected ${expectedMove}, but you played ${playedMove}. Eval drop: ${Math.max(0, drop).toFixed(1)}.`);
    },
    [playerColor],
  );

  /* ═══════════════════════════════════════════════════════════════
     Execute a move (from → to)
     ═══════════════════════════════════════════════════════════════ */
  const executeMove = useCallback(
    (from, to) => {
      const copy = cloneGame(game);
      const mi = copy.history().length;

      if (isTrainerMode) {
        const myTurn = (playerColor === 'w' && mi % 2 === 0) || (playerColor === 'b' && mi % 2 !== 0);
        if (!myTurn) return false;
      }

      try {
        const r = copy.move({ from, to, promotion: 'q' });
        if (!r) return false;
        playSound(!!r.captured);

        if (isTrainerMode) {
          const exp = expectedMoves[mi];
          if (r.san !== exp) {
            let alt = null;
            if (openingsDb) {
              try {
                const lc = cloneGame(copy);
                const res = lookupByMoves(lc, openingsDb);
                if (res?.opening?.name) alt = res.opening.name;
              } catch { /* ignore */ }
            }
            if (alt) {
              setLastError(`Valid Theory! You played the ${alt}. But we are practicing the ${targetOpening.Name}. Try again!`);
              return false;
            }
            try {
              const ec = cloneGame(game);
              ec.move(exp);
              evaluateDeviation(ec.fen(), copy.fen(), exp, r.san);
            } catch {
              setLastError(`Wrong move! Expected ${exp}, you played ${r.san}.`);
            }
            return false;
          }
          setLastError('');
          setGame(copy);
          buildTree(expectedMoves, mi + 1);
          autoPlayOpponent(copy, mi + 1);
          return true;
        }

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

      // Must be that color's turn
      if (pc.color !== game.turn()) { setSelectedSquare(null); setLegalMoveSquares([]); return; }

          // 3. If it is NOT in the database, treat it as a real mistake and fire Stockfish
          const ExpectedGameCopy = new Chess();
          const ExpectedPastMoves = Game.history();
          for (let i = 0; i < ExpectedPastMoves.length; i++) {
            ExpectedGameCopy.move(ExpectedPastMoves[i]);
          }
          ExpectedGameCopy.move(ExpectedMove);
          const ExpectedFen = ExpectedGameCopy.fen();

      const moves = game.moves({ square, verbose: true });
      if (moves.length === 0) { setSelectedSquare(null); setLegalMoveSquares([]); return; }

      setSelectedSquare(square);
      setLegalMoveSquares(moves.map((m) => m.to));
    },
    [selectedSquare, legalMoveSquares, game, isTrainerMode, playerColor, executeMove],
  );

  const handlePieceClick = useCallback(
    ({ square }) => {
      handleSquareClick({ square });
    },
    [handleSquareClick],
  );

  // Clear selection on game change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedSquare(null);
    setLegalMoveSquares([]);
  }, [game]);

  /* ═══════════════════════════════════════════════════════════════
     Custom square styles for highlights
     ═══════════════════════════════════════════════════════════════ */
  const squareHighlights = (() => {
    const s = {};
    if (selectedSquare) {
      s[selectedSquare] = { backgroundColor: 'rgba(255, 191, 0, 0.45)' };
    }
    legalMoveSquares.forEach((sq) => {
      const occ = game.get(sq);
      s[sq] = occ
        ? { background: 'radial-gradient(circle, transparent 55%, rgba(239, 68, 68, 0.55) 56%)' }
        : { background: 'radial-gradient(circle, rgba(34, 197, 94, 0.55) 22%, transparent 23%)' };
    });
    return s;
  })();

  /* ═══════════════════════════════════════════════════════════════
     Custom opening CRUD
     ═══════════════════════════════════════════════════════════════ */
  const handleSaveOpening = useCallback(
    (e) => {
      e.preventDefault();
      setAddError('');
      if (!newOpeningName.trim()) { setAddError('Opening name is required.'); return; }
      if (!newOpeningMoves.trim()) { setAddError('Moves list is required.'); return; }
      const m = pgnToMoves(newOpeningMoves);
      if (m.length === 0) { setAddError('Invalid PGN. Format: 1. e4 e5 2. Nf3 Nc6'); return; }
      const item = { Name: newOpeningName.trim(), Moves: newOpeningMoves.trim() };
      const upd = [...repertoire, item];
      setRepertoire(upd);
      localStorage.setItem('chess_repertoire', JSON.stringify(upd));
      setTargetOpening(item);
      setNewOpeningName('');
      setNewOpeningMoves('');
      setAddModalOpen(false);
    },
    [newOpeningName, newOpeningMoves, repertoire],
  );

  const handleDeleteOpening = useCallback(
    (name) => {
      const upd = repertoire.filter((o) => o.Name !== name);
      if (upd.length === 0) { setLastError('Keep at least one opening.'); return; }
      setRepertoire(upd);
      localStorage.setItem('chess_repertoire', JSON.stringify(upd));
      if (targetOpening.Name === name) setTargetOpening(upd[0]);
    },
    [repertoire, targetOpening],
  );

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
  const whitePct =
    evalType === 'mate'
      ? evalScore > 0 ? 95 : 5
      : Math.min(Math.max(50 + (evalScore * 50) / 8, 5), 95);

  /* ═══════════════════════════════════════════════════════════════
     Chessboard options object  (react-chessboard v5 API)
     ═══════════════════════════════════════════════════════════════ */
  const boardOptions = {
    id: 'main-board',
    position: game.fen(),
    boardOrientation: playerColor === 'w' ? 'white' : 'black',
    allowDragging: false,
    onSquareClick: handleSquareClick,
    onPieceClick: handlePieceClick,
    darkSquareStyle: DARK_SQUARE,
    lightSquareStyle: LIGHT_SQUARE,
    boardStyle: BOARD_STYLE,
    squareStyles: squareHighlights,
    animationDurationInMs: 200,
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

      {/* ─── Main Board Area ─── */}
      <div className="flex-1 flex flex-col items-center justify-center bg-gradient-to-br from-stone-950 via-stone-900 to-stone-950 relative p-8">
        {/* Status bar */}
        <div className="mb-4 text-center h-10 flex items-center justify-center">
          {lastError ? (
            <div className="text-red-400 bg-red-950/30 px-4 py-1.5 rounded-lg font-mono text-xs border border-red-500/20 shadow animate-pulse">{lastError}</div>
          ) : isEvaluating ? (
            <div className="text-stone-500 font-mono text-xs flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-stone-400" /><span>Stockfish analyzing...</span>
            </div>
          ) : null}
        </div>

        <div className="flex items-center">
          {/* Eval bar */}
          <div className="mr-5 flex flex-col items-center justify-between h-[560px] w-6 bg-stone-950 border border-stone-800 rounded-md overflow-hidden relative shadow-2xl">
            <div className="w-full bg-[#b58863] transition-all duration-300 ease-out" style={{ height: `${100 - whitePct}%` }} />
            <div className="w-full bg-[#f0d9b5] transition-all duration-300 ease-out" style={{ height: `${whitePct}%` }} />
            <div className="absolute inset-x-0 bottom-2 text-center pointer-events-none select-none">
              <span className="text-[9px] font-extrabold px-1 py-0.5 rounded shadow-sm bg-stone-950 text-stone-100 border border-stone-800">
                {evalType === 'mate' ? (evalScore > 0 ? `M${evalScore}` : `-M${Math.abs(evalScore)}`) : `${evalScore > 0 ? '+' : ''}${evalScore.toFixed(1)}`}
              </span>
            </div>
          </div>

          {/* Chessboard — v5 API: single `options` prop */}
          <div className="w-[560px] h-[560px] relative">
            <Chessboard options={boardOptions} />
          </div>
        </div>

        <div className="mt-4 text-stone-500 text-[11px] font-mono select-none">
          Click a piece to see legal moves, then click a destination to play.
        </div>
      </div>

      {/* ─── Add Custom Opening Modal ─── */}
      {addModalOpen && (
        <div className="absolute inset-0 bg-stone-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-all">
          <div className="w-[480px] bg-stone-900 border border-stone-800 rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-stone-800 flex justify-between items-center bg-stone-950/30">
              <h3 className="text-base font-bold text-stone-200">Add Custom Practice Opening</h3>
              <button onClick={() => setAddModalOpen(false)} className="text-stone-400 hover:text-stone-200 p-1 hover:bg-stone-800 rounded-lg transition-colors"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSaveOpening} className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-stone-400 uppercase tracking-wider block mb-1.5">Opening Name</label>
                <input type="text" value={newOpeningName} onChange={(e) => setNewOpeningName(e.target.value)} placeholder="e.g. Sicilian Defense: Najdorf Variation" className="w-full bg-stone-950 border border-stone-800 focus:border-[#b58863] rounded-lg p-2.5 text-sm text-stone-200 focus:outline-none" />
              </div>
              <div>
                <label className="text-xs font-semibold text-stone-400 uppercase tracking-wider block mb-1.5">Moves list (SAN/PGN)</label>
                <textarea rows="3" value={newOpeningMoves} onChange={(e) => setNewOpeningMoves(e.target.value)} placeholder="e.g. 1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6" className="w-full bg-stone-950 border border-stone-800 focus:border-[#b58863] rounded-lg p-2.5 text-sm text-stone-200 font-mono focus:outline-none resize-none" />
              </div>
              {addError && <div className="text-xs text-red-400 bg-red-950/30 border border-red-500/20 p-2.5 rounded-lg font-mono">{addError}</div>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setAddModalOpen(false)} className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 font-semibold rounded-lg text-xs transition-colors">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-[#b58863] hover:bg-[#c99c75] text-stone-950 font-bold rounded-lg text-xs transition-colors">Save Opening</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}