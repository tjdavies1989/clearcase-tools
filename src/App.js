import React from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import './App.css';

// Import tool components
import LandingPage from './components/LandingPage';
import TemplateGenerator from './components/template-generation/TemplateGenerator';
import AudioCompressor from './components/compression/AudioCompressor';
import TranscriptionTool from './components/transcription/TranscriptionTool';
import ProcessingTool from './components/processing/ProcessingTool';

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <img src="/ClearCase Logo.jpg" alt="ClearCase Logo" className="logo" />
        <h1>ClearCase Tools</h1>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/template-generation" element={<TemplateGenerator />} />
          <Route path="/compression" element={<AudioCompressor />} />
          <Route path="/transcription" element={<TranscriptionTool />} />
          <Route path="/processing" element={<ProcessingTool />} />
        </Routes>
      </main>
      <footer className="app-footer">
        <p>&copy; {new Date().getFullYear()} ClearCase Tools</p>
      </footer>
    </div>
  );
}

export default App; 