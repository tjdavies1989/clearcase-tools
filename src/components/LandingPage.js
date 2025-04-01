import React from 'react';
import { Link } from 'react-router-dom';

const LandingPage = () => {
  return (
    <div className="landing-page">
      <h2>Select a Tool</h2>
      <div className="tools-grid">
        <div className="tool-card">
          <h2>Template Generation</h2>
          <p>Create and customize document templates</p>
          <Link to="/template-generation" className="tool-button">
            Open
          </Link>
        </div>
        
        <div className="tool-card">
          <h2>Audio Compression</h2>
          <p>Compress audio files for efficient storage</p>
          <Link to="/compression" className="tool-button">
            Open
          </Link>
        </div>
        
        <div className="tool-card">
          <h2>Transcription</h2>
          <p>Transcribe audio files to text</p>
          <Link to="/transcription" className="tool-button">
            Open
          </Link>
        </div>
        
        <div className="tool-card">
          <h2>Document Processing</h2>
          <p>Process and analyze document contents</p>
          <Link to="/processing" className="tool-button">
            Open
          </Link>
        </div>
      </div>
    </div>
  );
};

export default LandingPage; 