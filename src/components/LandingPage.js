import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import config from '../config';

const LandingPage = () => {
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState('');
  const [savedAuth, setSavedAuth] = useState(false);
  
  // Check for saved authentication on component mount
  useEffect(() => {
    const authStatus = sessionStorage.getItem('isAuthenticated');
    if (authStatus === 'true') {
      setIsAuthenticated(true);
      setSavedAuth(true);
    }
  }, []);
  
  // Handle password submission
  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (password === config.appPassword) {
      setIsAuthenticated(true);
      sessionStorage.setItem('isAuthenticated', 'true');
      setError('');
    } else {
      setError('Incorrect password. Please try again.');
    }
  };
  
  // Handle logout
  const handleLogout = () => {
    setIsAuthenticated(false);
    setSavedAuth(false);
    setPassword('');
    sessionStorage.removeItem('isAuthenticated');
  };
  
  // Password entry screen
  if (!isAuthenticated) {
    return (
      <div className="landing-page">
        <div className="auth-container">
          <h2>ClearCase Tools</h2>
          <p>Please enter the password to access the tools</p>
          
          {error && <div className="alert alert-error">{error}</div>}
          
          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label htmlFor="password" className="form-label">Password</label>
              <input
                type="password"
                id="password"
                className="form-control"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                required
              />
            </div>
            <button type="submit" className="button button-primary">
              Login
            </button>
          </form>
        </div>
      </div>
    );
  }
  
  // Tools selection screen (shown after authentication)
  return (
    <div className="landing-page">
      <div className="header-container">
        <h2>Select a Tool</h2>
        {savedAuth && (
          <button onClick={handleLogout} className="button button-logout">
            Logout
          </button>
        )}
      </div>
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