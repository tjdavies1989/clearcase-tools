import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import config from '../../config';
import { loadFFmpeg, fetchFile } from '../compression/ffmpegSetup';

const TranscriptionTool = () => {
  const [file, setFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [transcriptionResult, setTranscriptionResult] = useState(null);
  const [language, setLanguage] = useState('en');
  const [ffmpeg, setFfmpeg] = useState(null);
  const [isChunking, setIsChunking] = useState(false);
  const [showFileSizeWarning, setShowFileSizeWarning] = useState(false);
  const [multipleFiles, setMultipleFiles] = useState([]);
  const [chunkProgress, setChunkProgress] = useState(0);
  const [chunksTotal, setChunksTotal] = useState(0);
  const [currentChunk, setCurrentChunk] = useState(0);
  
  // Load FFmpeg on component mount
  useEffect(() => {
    const initFFmpeg = async () => {
      try {
        const ffmpegInstance = await loadFFmpeg();
        setFfmpeg(ffmpegInstance);
      } catch (err) {
        console.error('Error loading FFmpeg:', err);
        setError(`Failed to load audio processing library: ${err.message}`);
      }
    };
    
    initFFmpeg();
    
    // Cleanup on unmount
    return () => {
      // Clean up file URLs if needed
    };
  }, []);
  
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile && (
      selectedFile.type.startsWith('audio/') || 
      selectedFile.type.startsWith('video/')
    )) {
      setFile(selectedFile);
      setTranscriptionResult(null);
      setError(null);
      
      // Check if file is larger than 25MB
      if (selectedFile.size > 25 * 1024 * 1024) {
        setShowFileSizeWarning(true);
      } else {
        setShowFileSizeWarning(false);
      }
      
      // Reset multiple files when a new file is selected
      setMultipleFiles([]);
    } else if (selectedFile) {
      setError('Please select a valid audio or video file');
      setFile(null);
    }
  };
  
  const handleMultipleFilesChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    const validFiles = selectedFiles.filter(file => 
      file.type.startsWith('audio/') || file.type.startsWith('video/')
    );
    
    if (validFiles.length > 0) {
      setMultipleFiles(validFiles);
      setFile(null); // Clear single file selection
      setTranscriptionResult(null);
      setError(null);
      setShowFileSizeWarning(false);
    } else {
      setError('Please select valid audio or video files');
    }
  };
  
  const handleLanguageChange = (e) => {
    setLanguage(e.target.value);
  };
  
  // Get audio duration
  const getAudioDuration = (file) => {
    return new Promise((resolve) => {
      const audio = new Audio();
      audio.addEventListener('loadedmetadata', () => {
        resolve(audio.duration);
      });
      audio.src = URL.createObjectURL(file);
    });
  };
  
  // Function to chunk audio file using FFmpeg
  const chunkAudioFile = async (file) => {
    if (!ffmpeg) {
      throw new Error('FFmpeg is not loaded');
    }
    
    setIsChunking(true);
    
    try {
      const duration = await getAudioDuration(file);
      
      // If less than 25 minutes, no need to chunk
      if (duration <= 25 * 60) {
        setIsChunking(false);
        return [file];
      }
      
      const chunkDuration = 20 * 60; // 20 minutes in seconds
      const overlap = 2; // 2 seconds overlap
      
      // Calculate number of chunks and set for progress tracking
      const numberOfChunks = Math.ceil(duration / (chunkDuration - overlap));
      setChunksTotal(numberOfChunks);
      
      const inputFileName = 'input' + file.name.substring(file.name.lastIndexOf('.'));
      await ffmpeg.writeFile(inputFileName, await fetchFile(file));
      
      const chunks = [];
      
      for (let startTime = 0; startTime < duration; startTime += chunkDuration - overlap) {
        setCurrentChunk(chunks.length + 1);
        
        const chunkName = `chunk_${chunks.length}${file.name.substring(file.name.lastIndexOf('.'))}`;
        
        // Execute FFmpeg command to extract chunk
        await ffmpeg.exec([
          '-i', inputFileName,
          '-ss', startTime.toString(),
          '-t', chunkDuration.toString(),
          '-c', 'copy',
          chunkName
        ]);
        
        // Get the chunk as a file
        const data = await ffmpeg.readFile(chunkName);
        const blob = new Blob([data.buffer], { type: file.type });
        chunks.push(new File([blob], chunkName, { type: file.type }));
        
        // Clean up
        await ffmpeg.deleteFile(chunkName);
        
        // Update progress
        setChunkProgress(((chunks.length) / numberOfChunks) * 100);
      }
      
      // Clean up input file
      await ffmpeg.deleteFile(inputFileName);
      setIsChunking(false);
      return chunks;
    } catch (err) {
      setIsChunking(false);
      throw err;
    }
  };
  
  const transcribeMultipleFiles = async (files) => {
    setIsProcessing(true);
    setTranscriptionResult(null);
    
    try {
      let combinedText = '';
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
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
        
        // Process response
        const contentType = response.headers.get('content-type');
        let result = '';
        
        if (contentType && contentType.includes('application/json')) {
          const jsonResult = await response.json();
          result = jsonResult.text;
        } else {
          const srtData = await response.text();
          result = extractTextFromSrt(srtData);
        }
        
        combinedText += (combinedText ? ' ' : '') + result;
      }
      
      setTranscriptionResult(combinedText);
    } catch (err) {
      console.error('Transcription error:', err);
      setError(`Transcription failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTranscribe = async () => {
    if (multipleFiles.length > 0) {
      await transcribeMultipleFiles(multipleFiles);
      return;
    }
    
    if (!file) return;
    
    try {
      setError(null);
      setIsProcessing(true);
      
      let filesToTranscribe;
      
      // Check if we need to chunk the file
      const duration = await getAudioDuration(file);
      if (duration > 25 * 60) {
        filesToTranscribe = await chunkAudioFile(file);
      } else {
        filesToTranscribe = [file];
      }
      
      await transcribeMultipleFiles(filesToTranscribe);
    } catch (err) {
      console.error('Transcription error:', err);
      setError(`Transcription failed: ${err.message}`);
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
    a.download = `transcription_${file ? file.name.split('.')[0] : 'multiple_files'}.txt`;
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
          disabled={isProcessing || isChunking || multipleFiles.length > 0}
        />
      </div>
      
      {showFileSizeWarning && (
        <div className="alert alert-warning">
          This file is larger than 25MB. The transcription process may be slow or time out. 
          Files longer than 25 minutes will be automatically processed in chunks.
        </div>
      )}
      
      <div className="form-group">
        <label className="form-label">Or process multiple files as one transcription</label>
        <input
          type="file"
          accept="audio/*,video/*"
          onChange={handleMultipleFilesChange}
          className="form-control"
          multiple
          disabled={isProcessing || isChunking || file !== null}
        />
        {multipleFiles.length > 0 && (
          <div className="file-info">
            <strong>{multipleFiles.length} files selected</strong>
          </div>
        )}
      </div>
      
      {(file || multipleFiles.length > 0) && (
        <>
          {file && (
            <div className="file-info">
              <strong>File:</strong> {file.name} ({formatFileSize(file.size)})
            </div>
          )}
          
          <div className="form-group">
            <label className="form-label">Language</label>
            <select
              value={language}
              onChange={handleLanguageChange}
              className="form-control"
              disabled={isProcessing || isChunking}
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
            disabled={isProcessing || isChunking || (!file && multipleFiles.length === 0)}
          >
            {isProcessing ? 'Transcribing...' : isChunking ? 'Processing Files...' : 'Transcribe Audio'}
          </button>
        </>
      )}
      
      {isChunking && (
        <div className="processing-indicator">
          <div className="spinner"></div>
          <p>Processing file into smaller chunks (Chunk {currentChunk} of {chunksTotal})...</p>
          <div className="progress-bar">
            <div className="progress" style={{ width: `${chunkProgress}%` }}></div>
          </div>
        </div>
      )}
      
      {isProcessing && !isChunking && (
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