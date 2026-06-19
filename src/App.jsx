import { useState, useEffect } from 'react';
import { openingBook } from '@chess-openings/eco.json';
import { Loader2 } from 'lucide-react';
import ObservationMode from './modes/ObservationMode';
import TrainerMode from './modes/TrainerMode';
import QuizMode from './modes/QuizMode';
import EditorMode from './modes/EditorMode';
import './index.css';

export default function App() {
  const [AppMode, SetAppMode] = useState('Observation');
  const [Openings, SetOpenings] = useState(null);
  const [IsLoadingEco, SetIsLoadingEco] = useState(true);
  
  const [CustomOpenings, SetCustomOpenings] = useState(() => {
    const Saved = localStorage.getItem('CustomOpenings');
    return Saved ? JSON.parse(Saved) : [];
  });

  useEffect(() => {
    openingBook().then((Data) => {
      SetOpenings(Data);
      SetIsLoadingEco(false);
    }).catch((Error) => {
      console.error("Failed to load ECO database", Error);
      SetIsLoadingEco(false);
    });
  }, []);

  if (IsLoadingEco) {
    return (
      <div className="flex h-screen w-full bg-slate-900 items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <>
      {AppMode === 'Observation' && (
        <ObservationMode AppMode={AppMode} SetAppMode={SetAppMode} Openings={Openings} />
      )}
      {AppMode === 'Trainer' && (
        <TrainerMode 
          AppMode={AppMode} 
          SetAppMode={SetAppMode} 
          Openings={Openings} 
          CustomOpenings={CustomOpenings} 
          SetCustomOpenings={SetCustomOpenings} 
        />
      )}
      {AppMode === 'Quiz' && (
        <QuizMode AppMode={AppMode} SetAppMode={SetAppMode} Openings={Openings} />
      )}
      {AppMode === 'Editor' && (
        <EditorMode 
          AppMode={AppMode} 
          SetAppMode={SetAppMode} 
          CustomOpenings={CustomOpenings} 
          SetCustomOpenings={SetCustomOpenings} 
        />
      )}
    </>
  );
}