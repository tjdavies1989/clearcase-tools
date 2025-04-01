import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import config from '../../config';

const TranscriptionTool = () => {
  const [file, setFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [transcriptionResult, setTranscriptionResult] = useState(null);
  const [language, setLanguage] = useState('en');
  
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile && (
      selectedFile.type.startsWith('audio/') || 
      selectedFile.type.startsWith('video/')
    )) {
      setFile(selectedFile);
      setTranscriptionResult(null);
      setError(null);
    } else if (selectedFile) {
      setError('Please select a valid audio or video file');
      setFile(null);
    }
  };
  
  const handleLanguageChange = (e) => {
    setLanguage(e.target.value);
  };
  
  const handleTranscribe = async () => {
    if (!file) return;
    
    try {
      setError(null);
      setIsProcessing(true);
      
      // Create form data for API request
      const formData = new FormData();
      formData.append('file', file);
      formData.append('model', config.transcription.model);
      formData.append('language', language);
      formData.append('temperature', config.transcription.temperature);
      formData.append('response_format', config.transcription.responseFormat);
      
      // Make the API call to transcribe
      const response = await fetch(config.apiEndpoints.audioTranscriptions, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.openaiApiKey}`
        },
        body: formData
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to transcribe audio');
      }
      
      // Check if we're getting SRT format or JSON
      const contentType = response.headers.get('content-type');
      let result;
      
      if (contentType && contentType.includes('application/json')) {
        result = await response.json();
        setTranscriptionResult(result.text);
      } else {
        // Handle SRT format (or other text formats)
        const srtData = await response.text();
        // Extract just the text content from SRT format
        const textContent = extractTextFromSrt(srtData);
        setTranscriptionResult(textContent);
      }
    } catch (err) {
      console.error('Transcription error:', err);
      setError(`Transcription failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };
  
  // Helper function to extract text from SRT format
  const extractTextFromSrt = (srtData) => {
    // Split by double newline which separates SRT entries
    const blocks = srtData.split('\n\n');
    let fullText = '';
    
    blocks.forEach(block => {
      if (!block.trim()) return;
      
      const lines = block.split('\n');
      if (lines.length < 3) return;
      
      // Get text content (everything after the timestamp line)
      const textContent = lines.slice(2).join(' ');
      fullText += (fullText ? ' ' : '') + textContent;
    });
    
    return fullText;
  };
  
  const handleDownload = () => {
    if (!transcriptionResult) return;
    
    const blob = new Blob([transcriptionResult], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcription_${file.name.split('.')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  const handleCopy = () => {
    if (!transcriptionResult) return;
    
    navigator.clipboard.writeText(transcriptionResult)
      .then(() => {
        alert('Transcription copied to clipboard');
      })
      .catch(err => {
        console.error('Failed to copy:', err);
        setError('Failed to copy to clipboard');
      });
  };
  
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
  
  return (
    <div className="transcription-tool">
      <Link to="/" className="back-button">← Back to Tools</Link>
      
      <h2>Medicolegal Transcription</h2>
      
      {error && (
        <div className="alert alert-error">{error}</div>
      )}
      
      <div className="form-group">
        <label className="form-label">Select Audio/Video File</label>
        <input
          type="file"
          accept="audio/*,video/*"
          onChange={handleFileChange}
          className="form-control"
          disabled={isProcessing}
        />
      </div>
      
      {file && (
        <>
          <div className="file-info">
            <strong>File:</strong> {file.name} ({formatFileSize(file.size)})
          </div>
          
          <div className="form-group">
            <label className="form-label">Language</label>
            <select
              value={language}
              onChange={handleLanguageChange}
              className="form-control"
              disabled={isProcessing}
            >
              <option value="en">English</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="it">Italian</option>
              <option value="pt">Portuguese</option>
              <option value="nl">Dutch</option>
              <option value="ja">Japanese</option>
              <option value="zh">Chinese</option>
              <option value="ru">Russian</option>
            </select>
          </div>
          
          <button
            onClick={handleTranscribe}
            className="button button-primary"
            disabled={isProcessing}
          >
            {isProcessing ? 'Transcribing...' : 'Transcribe Audio'}
          </button>
        </>
      )}
      
      {isProcessing && (
        <div className="processing-indicator">
          <div className="spinner"></div>
          <p>Processing your file. This may take a while for larger files...</p>
        </div>
      )}
      
      {transcriptionResult && (
        <div className="transcription-result">
          <h3>Transcription Result</h3>
          
          <div className="transcription-text">
            {transcriptionResult}
          </div>
          
          <div className="action-buttons">
            <button onClick={handleCopy} className="button">
              Copy to Clipboard
            </button>
            <button onClick={handleDownload} className="button button-success">
              Download as Text File
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TranscriptionTool; 