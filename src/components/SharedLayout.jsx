import React from 'react';
import '../index.css';

export default function SharedLayout({ AppMode, SetAppMode, SidebarContent, BoardContent, LastError, ResetGame }) {
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
                onClick={() => SetAppMode('Observation')}
                className={`px-3 py-1 text-xs rounded ${AppMode === 'Observation' ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-300'}`}
              >
                Observation
              </button>
              <button 
                onClick={() => SetAppMode('Trainer')}
                className={`px-3 py-1 text-xs rounded ${AppMode === 'Trainer' ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-300'}`}
              >
                Trainer
              </button>
              <button 
                onClick={() => SetAppMode('Quiz')}
                className={`px-3 py-1 text-xs rounded ${AppMode === 'Quiz' ? 'bg-purple-500 text-white' : 'bg-slate-700 text-slate-300'}`}
              >
                Quiz
              </button>
              <button 
                onClick={() => SetAppMode('Editor')}
                className={`px-3 py-1 text-xs rounded ${AppMode === 'Editor' ? 'bg-orange-500 text-white' : 'bg-slate-700 text-slate-300'}`}
              >
                Editor
              </button>
            </div>
          </div>
          <button onClick={ResetGame} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm">Reset</button>
        </div>
        
        <div className="flex-1 w-full flex flex-col relative overflow-hidden">
          {SidebarContent}
        </div>
      </div>

      {/* Main Board Area */}
      <div className="w-2/3 flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 relative">
        <div className="w-[600px] h-[600px]">
          {BoardContent}
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
