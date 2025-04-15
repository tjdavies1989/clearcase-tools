import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { loadFFmpeg, compressAudio, concatenateAudioFiles, concatenateM4aFiles, splitAudioFile, getAudioMetadata } from './ffmpegSetup';
import config from '../../config';

const AudioCompressor = () => {
  // Original state for single file compression
  const [file, setFile] = useState(null);
  
  // New state for multi-file concatenation
  const [isMultiFileMode, setIsMultiFileMode] = useState(false);
  // New state for file splitting
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [audioFiles, setAudioFiles] = useState([]);
  const [splitDuration, setSplitDuration] = useState(10); // Default 10 minutes
  const [splitFiles, setSplitFiles] = useState([]);
  
  // Audio metadata
  const [audioMetadata, setAudioMetadata] = useState(null);
  
  // Common state
  const [format, setFormat] = useState('mp3');
  const [bitrate, setBitrate] = useState('128k');
  const [sampleRate, setSampleRate] = useState('44100');
  const [channels, setChannels] = useState('2');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [compressedFile, setCompressedFile] = useState(null);
  const [originalAudioUrl, setOriginalAudioUrl] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');
  const ffmpegRef = useRef(null);
  
  // Load FFmpeg on component mount
  useEffect(() => {
    const initFFmpeg = async () => {
      try {
        setError(null);
        console.log('Starting FFmpeg initialization...');
        setStatusMessage('Loading audio processing library...');
        
        // Try loading FFmpeg
        const ffmpeg = await loadFFmpeg();
        ffmpegRef.current = ffmpeg;
        setFfmpegLoaded(true);
        setStatusMessage('Audio processing library loaded successfully!');
        
        // Clear success message after 3 seconds
        setTimeout(() => {
          setStatusMessage('');
        }, 3000);
        
        console.log('FFmpeg loaded successfully');
      } catch (err) {
        console.error('Error loading FFmpeg:', err);
        
        // More user-friendly error messages
        let errorMsg = `Failed to load audio processing library: ${err.message}`;
        
        // Special case for local files not found
        if (err.isLocalFilesError && err.downloaderUrl) {
          setError(
            <div>
              <p>FFmpeg files are not found locally. These files are needed for audio compression to work.</p>
              <p><a href={err.downloaderUrl} target="_blank" rel="noopener noreferrer" 
                    style={{color: '#0d6efd', textDecoration: 'underline', fontWeight: 'bold'}}>
                Click here to download FFmpeg files
              </a></p>
              <p>After downloading, place the files in the public/ffmpeg folder and refresh this page.</p>
            </div>
          );
          setStatusMessage('');
          return; // Exit early since we've handled this specific error
        }
        
        if (err.message.includes('Failed to fetch') || 
            err.message.includes('NetworkError') ||
            err.message.includes('CORS') ||
            err.message.includes('cross-origin')) {
          errorMsg = "Failed to load audio processing library. This appears to be a browser security restriction. Please try: \n" +
            "1. Make sure you're using Chrome or Edge (latest version)\n" +
            "2. Access the site via HTTPS instead of HTTP\n" +
            "3. Try opening in an incognito/private window\n" +
            "4. If using locally, run Chrome with security flags disabled (not recommended for general browsing)";
        }
        
        setError(errorMsg);
        setStatusMessage('');
      }
    };
    
    initFFmpeg();
    
    // Cleanup on unmount
    return () => {
      if (ffmpegRef.current) {
        // No explicit cleanup needed for FFmpeg in the browser
        ffmpegRef.current = null;
      }
      // Clean up any object URLs to prevent memory leaks
      if (originalAudioUrl) {
        URL.revokeObjectURL(originalAudioUrl);
      }
      if (compressedFile && compressedFile.url) {
        URL.revokeObjectURL(compressedFile.url);
      }
      
      // Cleanup audio preview URLs for multiple files
      audioFiles.forEach(file => {
        if (file.previewUrl) {
          URL.revokeObjectURL(file.previewUrl);
        }
      });
    };
  }, []);
  
  // Toggle between modes
  const toggleMode = (mode) => {
    if (isProcessing) return;
    
    if (mode === 'compress') {
      setIsMultiFileMode(false);
      setIsSplitMode(false);
    } else if (mode === 'concatenate') {
      setIsMultiFileMode(true);
      setIsSplitMode(false);
    } else if (mode === 'split') {
      setIsMultiFileMode(false);
      setIsSplitMode(true);
    }
    
    // Reset the state when toggling modes
    setFile(null);
    setAudioFiles([]);
    setCompressedFile(null);
    setError(null);
    setSplitFiles([]);
    setAudioMetadata(null);
    
    if (originalAudioUrl) {
      URL.revokeObjectURL(originalAudioUrl);
      setOriginalAudioUrl(null);
    }
    
    // Clean up audio previews when switching modes
    audioFiles.forEach(file => {
      if (file.previewUrl) {
        URL.revokeObjectURL(file.previewUrl);
      }
    });
    
    // Clean up split files
    splitFiles.forEach(file => {
      if (file.url) {
        URL.revokeObjectURL(file.url);
      }
    });
  };
  
  // Single file selection with metadata extraction
  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile && selectedFile.type.startsWith('audio/')) {
      setFile(selectedFile);
      setCompressedFile(null);
      setError(null);
      setSplitFiles([]);
      
      // Create a URL for the original file to preview
      if (originalAudioUrl) {
        URL.revokeObjectURL(originalAudioUrl);
      }
      const url = URL.createObjectURL(selectedFile);
      setOriginalAudioUrl(url);
      
      // Fetch audio metadata if FFmpeg is loaded
      if (ffmpegLoaded && ffmpegRef.current) {
        try {
          setStatusMessage('Analysing audio file...');
          const metadata = await getAudioMetadata(ffmpegRef.current, selectedFile);
          setAudioMetadata(metadata);
          setStatusMessage('');
          console.log('Audio metadata:', metadata);
        } catch (err) {
          console.warn('Could not extract audio metadata:', err);
          setAudioMetadata(null);
        }
      }
    } else if (selectedFile) {
      setError('Please select a valid audio file');
      setFile(null);
      setOriginalAudioUrl(null);
      setAudioMetadata(null);
    }
  };
  
  // Multiple file selection
  const handleMultipleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    const validFiles = selectedFiles.filter(file => file.type.startsWith('audio/'));
    
    if (validFiles.length === 0) {
      if (selectedFiles.length > 0) {
        setError('Please select valid audio files');
      }
      return;
    }
    
    // Clear error if valid files are selected
    setError(null);
    setCompressedFile(null);
    
    // Add the new files to the list with preview URLs
    const newFiles = validFiles.map(file => ({
      file,
      id: `file-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      previewUrl: URL.createObjectURL(file)
    }));
    
    setAudioFiles(prev => [...prev, ...newFiles]);
  };
  
  // Move a file up in the list (earlier in concatenation order)
  const moveFileUp = (id) => {
    setAudioFiles(prev => {
      const index = prev.findIndex(file => file.id === id);
      if (index <= 0) return prev;
      
      const newFiles = [...prev];
      const temp = newFiles[index];
      newFiles[index] = newFiles[index - 1];
      newFiles[index - 1] = temp;
      
      return newFiles;
    });
  };
  
  // Move a file down in the list (later in concatenation order)
  const moveFileDown = (id) => {
    setAudioFiles(prev => {
      const index = prev.findIndex(file => file.id === id);
      if (index < 0 || index >= prev.length - 1) return prev;
      
      const newFiles = [...prev];
      const temp = newFiles[index];
      newFiles[index] = newFiles[index + 1];
      newFiles[index + 1] = temp;
      
      return newFiles;
    });
  };
  
  // Remove a file from the list
  const removeFile = (id) => {
    setAudioFiles(prev => {
      // Find the file to remove
      const fileToRemove = prev.find(file => file.id === id);
      
      // Release the preview URL
      if (fileToRemove && fileToRemove.previewUrl) {
        URL.revokeObjectURL(fileToRemove.previewUrl);
      }
      
      // Filter out the file
      return prev.filter(file => file.id !== id);
    });
  };
  
  const handleFormatChange = (e) => {
    setFormat(e.target.value);
    setCompressedFile(null);
  };
  
  const handleBitrateChange = (e) => {
    setBitrate(e.target.value);
    setCompressedFile(null);
  };
  
  const handleSampleRateChange = (e) => {
    setSampleRate(e.target.value);
    setCompressedFile(null);
  };
  
  const handleChannelsChange = (e) => {
    setChannels(e.target.value);
    setCompressedFile(null);
  };
  
  const handleSplitDurationChange = (e) => {
    setSplitDuration(parseInt(e.target.value));
  };
  
  // Process button click handler
  const handleProcess = async () => {
    if (isSplitMode) {
      await handleSplitFile();
    } else if (isMultiFileMode) {
      await handleConcatenate();
    } else {
      await handleCompress();
    }
  };
  
  // Single file compression
  const handleCompress = async () => {
    if (!file || !ffmpegLoaded) return;
    
    try {
      setError(null);
      setIsProcessing(true);
      setProgress(0);
      setStatusMessage('Preparing to compress audio...');
      
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
        
        // Update status message based on progress
        setStatusMessage(prev => {
          const p = progress;
          if (p < 20) return 'Analyzing audio file...';
          if (p < 40) return 'Setting up compression parameters...';
          if (p < 60) return 'Applying compression...';
          if (p < 80) return 'Processing audio channels...';
          return 'Finalizing compressed file...';
        });
      }, 500);
      
      // Start compression
      const compressed = await compressAudio(
        ffmpegRef.current,
        file,
        format === 'aac' ? 'm4a' : format, // Use m4a container for AAC
        bitrate,
        sampleRate,
        channels
      );
      
      // Create a URL for the compressed file
      const url = URL.createObjectURL(compressed);
      
      setCompressedFile({
        url,
        name: `compressed_${file.name.split('.')[0]}.${format === 'aac' ? 'm4a' : format}`,
        size: compressed.size,
        type: compressed.type
      });
      
      clearInterval(progressInterval);
      setProgress(100);
      setStatusMessage('Compression complete!');
      
      // Clear status message after 3 seconds
      setTimeout(() => {
        setStatusMessage('');
      }, 3000);
    } catch (err) {
      console.error('Compression error:', err);
      setError(`Compression failed: ${err.message}`);
      setStatusMessage('');
    } finally {
      setIsProcessing(false);
    }
  };
  
  // Multiple file concatenation
  const handleConcatenate = async () => {
    if (audioFiles.length < 2 || !ffmpegLoaded) {
      if (audioFiles.length < 2) {
        setError('Please select at least two audio files to concatenate');
      }
      return;
    }

    try {
      setError(null);
      setIsProcessing(true);
      setProgress(0);
      setStatusMessage('Preparing to concatenate audio files...');
      
      // Log file information for debugging
      console.log('Files to concatenate:', audioFiles.map(item => ({
        name: item.file.name,
        type: item.file.type,
        size: item.file.size
      })));
      
      // Check all file formats for m4a/AAC specifically, which might need special handling
      const hasM4aFiles = audioFiles.some(item => 
        item.file.name.toLowerCase().endsWith('.m4a') || 
        item.file.type === 'audio/mp4' || 
        item.file.type === 'audio/x-m4a'
      );
      
      if (hasM4aFiles) {
        console.log('M4A files detected - using special handling');
        setStatusMessage('Processing M4A files (may take longer)...');
      }
      
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 5;
        });
        
        // Update status message based on progress
        setStatusMessage(prev => {
          const p = progress;
          if (p < 20) return 'Analyzing audio files...';
          if (p < 40) return 'Converting to compatible format...';
          if (p < 60) return 'Flattening metadata...';
          if (p < 80) return 'Concatenating audio files...';
          return 'Finalizing concatenated file...';
        });
      }, 800);
      
      // Get the raw File objects in the correct order
      const files = audioFiles.map(item => item.file);
      
      try {
        // Start concatenation using the appropriate method
        let concatenated;
        
        if (hasM4aFiles || format === 'aac' || format === 'm4a') {
          // Use the specialized M4A concatenation method
          console.log('Using specialized M4A concatenation method');
          setStatusMessage('Using specialized method for M4A files...');
          
          concatenated = await concatenateM4aFiles(
            ffmpegRef.current,
            files,
            format === 'aac' ? 'm4a' : format,
            bitrate,
            sampleRate,
            channels
          );
        } else {
          // Use the standard concatenation method for other formats
          concatenated = await concatenateAudioFiles(
            ffmpegRef.current,
            files,
            format === 'aac' ? 'm4a' : format,
            bitrate,
            sampleRate,
            channels
          );
        }
        
        // Create a URL for the concatenated file
        const url = URL.createObjectURL(concatenated);
        
        // Create a combined name from the first and last file
        const firstName = audioFiles[0].file.name.split('.')[0];
        const lastName = audioFiles[audioFiles.length - 1].file.name.split('.')[0];
        const combinedName = `${firstName}_to_${lastName}`;
        
        setCompressedFile({
          url,
          name: `concatenated_${combinedName}.${format === 'aac' ? 'm4a' : format}`,
          size: concatenated.size,
          type: concatenated.type
        });
        
        clearInterval(progressInterval);
        setProgress(100);
        setStatusMessage('Concatenation complete!');
        
        // Clear status message after 3 seconds
        setTimeout(() => {
          setStatusMessage('');
        }, 3000);
      } catch (processingError) {
        clearInterval(progressInterval);
        
        console.error('Concatenation error:', processingError);
        
        // More detailed error messages for specific errors
        let errorMessage = processingError.message;
        
        if (errorMessage.includes('FS error') || errorMessage.includes('undefined')) {
          errorMessage = 'File system error during concatenation. This might be due to incompatible audio formats or bitrates.';
          
          if (hasM4aFiles) {
            errorMessage += ' M4A/AAC files can be problematic - try converting them to MP3 first or use a different format.';
          }
        }
        
        setError(`Concatenation failed: ${errorMessage}`);
        setStatusMessage('');
      }
    } catch (err) {
      console.error('Concatenation error:', err);
      setError(`Concatenation failed: ${err.message || 'Unknown error'}`);
      setStatusMessage('');
    } finally {
      setIsProcessing(false);
    }
  };
  
  // File splitting function - simplified for stability
  const handleSplitFile = async () => {
    if (!file || !ffmpegLoaded) return;
    
    try {
      // Reset state
      setError(null);
      setIsProcessing(true);
      setProgress(0);
      setStatusMessage('Starting to process audio file...');
      
      // Clean up any previous files
      if (splitFiles.length > 0) {
        splitFiles.forEach(f => {
          if (f.url) URL.revokeObjectURL(f.url);
        });
        setSplitFiles([]);
      }
      
      // Use a simple interval for progress updates
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          // Move progress slowly up to 90%
          if (prev >= 90) return 90;
          return Math.min(90, prev + 2);
        });
      }, 1000);
      
      // Update status messages less frequently
      const messageInterval = setInterval(() => {
        const currentProgress = progress;
        
        if (currentProgress < 30) {
          setStatusMessage('Analysing audio file...');
        } else if (currentProgress < 60) {
          setStatusMessage('Creating audio segments...');
        } else {
          setStatusMessage('Finalising files...');
        }
      }, 3000);
      
      try {
        // Call the splitting function with minimal options
        const outputFiles = await splitAudioFile(
          ffmpegRef.current,
          file,
          splitDuration,
          3, // Standard overlap
          format
        );
        
        if (outputFiles && outputFiles.length > 0) {
          // Create blob URLs in a simple loop
          const results = [];
          
          for (const item of outputFiles) {
            try {
              const url = URL.createObjectURL(item.blob);
              results.push({
                ...item,
                url
              });
            } catch (blobError) {
              console.warn('Error creating blob URL:', blobError);
              // Skip this file but continue
            }
          }
          
          setSplitFiles(results);
          setProgress(100);
          setStatusMessage(`Split complete! Created ${results.length} files.`);
        } else {
          throw new Error('No output files were created');
        }
      } catch (processingError) {
        throw processingError; // Re-throw to outer handler
      } finally {
        // Always clear intervals
        clearInterval(progressInterval);
        clearInterval(messageInterval);
      }
    } catch (error) {
      console.error('Error in split operation:', error);
      
      // Simple error messages
      let message = 'File splitting failed';
      if (error && typeof error.message === 'string') {
        // Clean up the error message
        message = error.message
          .replace(/splitting failed: /gi, '')
          .replace(/failed to /gi, 'Could not ');
      }
      
      setError(message);
      setStatusMessage('');
      setProgress(0);
    } finally {
      setIsProcessing(false);
    }
  };
  
  // Download a single split file - simplified
  const handleDownloadSplitFile = (fileData) => {
    if (!fileData || !fileData.url) return;
    
    try {
      const a = document.createElement('a');
      a.href = fileData.url;
      a.download = fileData.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download error:', error);
      setError('Could not download file');
    }
  };
  
  // Download all split files - simplified
  const handleDownloadAllSplitFiles = () => {
    if (!splitFiles || splitFiles.length === 0) return;
    
    try {
      // Download one file every 500ms to prevent browser issues
      let index = 0;
      
      const downloadNext = () => {
        if (index >= splitFiles.length) return;
        
        const fileData = splitFiles[index++];
        if (fileData && fileData.url) {
          const a = document.createElement('a');
          a.href = fileData.url;
          a.download = fileData.name;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
        
        // Schedule next download
        if (index < splitFiles.length) {
          setTimeout(downloadNext, 500);
        }
      };
      
      // Start the download sequence
      downloadNext();
    } catch (error) {
      console.error('Download all error:', error);
      setError('Could not download files');
    }
  };
  
  const handleDownload = () => {
    if (!compressedFile) return;
    
    const a = document.createElement('a');
    a.href = compressedFile.url;
    a.download = compressedFile.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
  
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
  
  const calculateCompressionRatio = () => {
    if (isMultiFileMode) {
      if (!audioFiles.length || !compressedFile) return null;
      const totalSize = audioFiles.reduce((sum, file) => sum + file.file.size, 0);
      const ratio = (totalSize / compressedFile.size).toFixed(2);
      return ratio;
    } else {
      if (!file || !compressedFile) return null;
      const ratio = (file.size / compressedFile.size).toFixed(2);
      return ratio;
    }
  };

  // Function to display format name
  const getFormatDisplayName = (formatKey) => {
    switch(formatKey) {
      case 'aac':
        return 'm4a (AAC)';
      default:
        return formatKey.toUpperCase();
    }
  };
  
  // Calculate total size of all files
  const calculateTotalSize = () => {
    return audioFiles.reduce((sum, file) => sum + file.file.size, 0);
  };
  
  // Format duration as hours:minutes:seconds
  const formatDuration = (seconds) => {
    if (!seconds && seconds !== 0) return 'Unknown';
    
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    let result = '';
    if (hrs > 0) {
      result += `${hrs}h `;
    }
    if (mins > 0 || hrs > 0) {
      result += `${mins}m `;
    }
    result += `${secs}s`;
    
    return result;
  };
  
  // Get duration from audio element directly
  const getDurationFromAudio = (audioElement) => {
    if (!audioElement || !audioElement.duration || isNaN(audioElement.duration)) {
      return 'Unknown';
    }
    
    return formatDuration(audioElement.duration);
  };
  
  return (
    <div className="audio-compressor">
      <Link to="/" className="back-button">← Back to Tools</Link>
      
      <h2>Audio Processing Tool</h2>
      
      {error && (
        <div className="alert alert-error">{error}</div>
      )}
      
      {statusMessage && (
        <div className="status-message">{statusMessage}</div>
      )}
      
      <div className="mode-toggle">
        <button 
          className={`mode-button ${!isMultiFileMode && !isSplitMode ? 'active' : ''}`}
          onClick={() => toggleMode('compress')}
          disabled={isProcessing}
        >
          Single File Compression
        </button>
        <button 
          className={`mode-button ${isMultiFileMode ? 'active' : ''}`}
          onClick={() => toggleMode('concatenate')}
          disabled={isProcessing}
        >
          Multi-File Concatenation
        </button>
        <button 
          className={`mode-button ${isSplitMode ? 'active' : ''}`}
          onClick={() => toggleMode('split')}
          disabled={isProcessing}
        >
          Split Audio File
        </button>
      </div>
      
      {isSplitMode ? (
        <>
          <div className="form-group">
            <label className="form-label">Select Audio File to Split</label>
            <input
              type="file"
              accept="audio/*"
              onChange={handleFileChange}
              className="form-control"
              disabled={isProcessing}
            />
          </div>
          
          {file && (
            <>
              <div className="file-info">
                <strong>File:</strong> {file.name} ({formatFileSize(file.size)})
                {audioMetadata && (
                  <div className="metadata-display">
                    <div>
                      <strong>Duration:</strong> {
                        audioMetadata.duration > 0 
                        ? formatDuration(audioMetadata.duration) 
                        : originalAudioUrl 
                          ? <span className="loading-duration">Detecting from player...</span>
                          : 'Unknown'
                      }
                    </div>
                    <div><strong>Bitrate:</strong> {audioMetadata.bitrate}</div>
                    <div><strong>Sample Rate:</strong> {audioMetadata.sampleRate}</div>
                    <div><strong>Channels:</strong> {audioMetadata.channels}</div>
                    <div><strong>Codec:</strong> {audioMetadata.codec}</div>
                  </div>
                )}
              </div>
              
              {originalAudioUrl && (
                <div className="original-audio">
                  <h3>Original Audio</h3>
                  <audio 
                    controls 
                    src={originalAudioUrl} 
                    className="audio-preview"
                    ref={audioElement => {
                      if (audioElement && audioMetadata && audioMetadata.duration <= 0) {
                        // Listen for duration once audio is loaded
                        audioElement.onloadedmetadata = () => {
                          if (audioElement.duration && !isNaN(audioElement.duration)) {
                            setAudioMetadata(prev => ({
                              ...prev,
                              duration: audioElement.duration
                            }));
                          }
                        };
                      }
                    }}
                  ></audio>
                </div>
              )}
              
              <div className="split-options">
                <div className="form-group">
                  <label className="form-label">Chunk Duration</label>
                  <select
                    value={splitDuration}
                    onChange={handleSplitDurationChange}
                    className="form-control"
                    disabled={isProcessing}
                  >
                    <option value="5">5 minutes</option>
                    <option value="10">10 minutes</option>
                    <option value="15">15 minutes</option>
                  </select>
                </div>
                
                <div className="form-group">
                  <label className="form-label">Output Format</label>
                  <select
                    value={format}
                    onChange={handleFormatChange}
                    className="form-control"
                    disabled={isProcessing}
                  >
                    {config.ffmpeg.formats.map((fmt) => (
                      <option key={fmt} value={fmt}>{getFormatDisplayName(fmt)}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <button
                onClick={handleSplitFile}
                className="button button-primary"
                disabled={isProcessing || !ffmpegLoaded || !file}
              >
                {isProcessing ? 'Splitting...' : 'Split Audio File'}
              </button>
            </>
          )}
          
          {splitFiles.length > 0 && (
            <div className="split-result">
              <h3>Split Complete - {splitFiles.length} Files Created</h3>
              
              <div className="split-files-container">
                {splitFiles.map((fileData, index) => (
                  <div key={index} className="split-file-item">
                    <div className="split-file-name">{index + 1}. {fileData.name}</div>
                    <div className="split-file-size">{formatFileSize(fileData.size)}</div>
                    <audio controls src={fileData.url} className="mini-audio-preview"></audio>
                    <button 
                      onClick={() => handleDownloadSplitFile(fileData)}
                      className="button button-small"
                    >
                      Download
                    </button>
                  </div>
                ))}
              </div>
              
              <button 
                onClick={handleDownloadAllSplitFiles} 
                className="button button-success"
              >
                Download All Files
              </button>
            </div>
          )}
        </>
      ) : isMultiFileMode ? (
        <>
          <div className="form-group">
            <label className="form-label">Select Audio Files to Concatenate</label>
            <p className="help-text">Files will be joined in the order shown below. You can reorder them using the arrow buttons.</p>
            <input
              type="file"
              accept="audio/*"
              onChange={handleMultipleFileChange}
              className="form-control"
              multiple
              disabled={isProcessing}
            />
          </div>
          
          {audioFiles.length > 0 && (
            <div className="audio-files-list">
              <h3>Selected Files <span className="file-count">({audioFiles.length} files, {formatFileSize(calculateTotalSize())})</span></h3>
              <div className="file-list-header">
                <div className="file-order">#</div>
                <div className="file-name">Filename</div>
                <div className="file-size">Size</div>
                <div className="file-preview">Preview</div>
                <div className="file-actions">Actions</div>
              </div>
              {audioFiles.map((audioFile, index) => (
                <div key={audioFile.id} className="audio-file-item">
                  <div className="file-order">{index + 1}</div>
                  <div className="file-name">{audioFile.file.name}</div>
                  <div className="file-size">{formatFileSize(audioFile.file.size)}</div>
                  <div className="file-preview">
                    <audio controls src={audioFile.previewUrl} className="mini-audio-preview"></audio>
                  </div>
                  <div className="file-actions">
                    <button 
                      onClick={() => moveFileUp(audioFile.id)}
                      disabled={index === 0 || isProcessing}
                      className="icon-button move-up"
                      title="Move earlier in sequence"
                    >
                      ↑
                    </button>
                    <button 
                      onClick={() => moveFileDown(audioFile.id)}
                      disabled={index === audioFiles.length - 1 || isProcessing}
                      className="icon-button move-down"
                      title="Move later in sequence"
                    >
                      ↓
                    </button>
                    <button 
                      onClick={() => removeFile(audioFile.id)}
                      disabled={isProcessing}
                      className="icon-button remove"
                      title="Remove file"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="form-group">
          <label className="form-label">Select Audio File</label>
          <input
            type="file"
            accept="audio/*"
            onChange={handleFileChange}
            className="form-control"
            disabled={isProcessing}
          />
        </div>
      )}
      
      {!isMultiFileMode && !isSplitMode && file && (
        <div className="file-info">
          <strong>File:</strong> {file.name} ({formatFileSize(file.size)})
          {audioMetadata && (
            <div className="metadata-display">
              <div>
                <strong>Duration:</strong> {
                  audioMetadata.duration > 0 
                  ? formatDuration(audioMetadata.duration) 
                  : originalAudioUrl 
                    ? <span className="loading-duration">Detecting from player...</span>
                    : 'Unknown'
                }
              </div>
              <div><strong>Bitrate:</strong> {audioMetadata.bitrate}</div>
              <div><strong>Sample Rate:</strong> {audioMetadata.sampleRate}</div>
              <div><strong>Channels:</strong> {audioMetadata.channels}</div>
              <div><strong>Codec:</strong> {audioMetadata.codec}</div>
            </div>
          )}
        </div>
      )}
      
      {(file || audioFiles.length > 0) && (
        <>
          {!isMultiFileMode && originalAudioUrl && (
            <div className="original-audio">
              <h3>Original Audio</h3>
              <audio 
                controls 
                src={originalAudioUrl} 
                className="audio-preview"
                ref={audioElement => {
                  if (audioElement && audioMetadata && audioMetadata.duration <= 0) {
                    // Listen for duration once audio is loaded
                    audioElement.onloadedmetadata = () => {
                      if (audioElement.duration && !isNaN(audioElement.duration)) {
                        setAudioMetadata(prev => ({
                          ...prev,
                          duration: audioElement.duration
                        }));
                      }
                    };
                  }
                }}
              ></audio>
            </div>
          )}
          
          <div className="compression-options">
            <div className="form-group">
              <label className="form-label">Output Format</label>
              <select
                value={format}
                onChange={handleFormatChange}
                className="form-control"
                disabled={isProcessing}
              >
                {config.ffmpeg.formats.map((fmt) => (
                  <option key={fmt} value={fmt}>{getFormatDisplayName(fmt)}</option>
                ))}
              </select>
              {isMultiFileMode && (format === 'aac' || format === 'm4a') && (
                <div className="format-warning">
                  <strong>Note:</strong> M4A/AAC files may cause issues when concatenating, especially with different bitrates. 
                  MP3 is more reliable for concatenation. If you encounter problems, try:
                  <ul>
                    <li>Using MP3 format instead</li>
                    <li>Converting your files to MP3 before uploading</li>
                    <li>Making sure all input files have the same bitrate</li>
                  </ul>
                </div>
              )}
            </div>
            
            <div className="form-group">
              <label className="form-label">Bitrate (quality)</label>
              <select
                value={bitrate}
                onChange={handleBitrateChange}
                className="form-control"
                disabled={isProcessing || format === 'wav'}
              >
                {config.ffmpeg.bitrateOptions.map((br) => (
                  <option key={br} value={br}>{br}</option>
                ))}
              </select>
            </div>
            
            <div className="form-group">
              <label className="form-label">Sample Rate</label>
              <select
                value={sampleRate}
                onChange={handleSampleRateChange}
                className="form-control"
                disabled={isProcessing}
              >
                <option value="16000">16,000 Hz</option>
                <option value="32000">32,000 Hz</option>
                <option value="44100">44,100 Hz (CD Quality)</option>

              </select>
            </div>
            
            <div className="form-group">
              <label className="form-label">Channels</label>
              <select
                value={channels}
                onChange={handleChannelsChange}
                className="form-control"
                disabled={isProcessing}
              >
                <option value="1">Mono (1 channel)</option>
                <option value="2">Stereo (2 channels)</option>
              </select>
            </div>
          </div>
          
          <button
            onClick={handleProcess}
            className="button button-primary"
            disabled={
              isProcessing || 
              !ffmpegLoaded || 
              (isMultiFileMode ? audioFiles.length < 2 : !file)
            }
          >
            {isProcessing 
              ? (isMultiFileMode ? 'Concatenating...' : 'Compressing...') 
              : (isMultiFileMode ? 'Concatenate Files' : 'Compress Audio')}
          </button>
        </>
      )}
      
      {isProcessing && (
        <div className="progress-container">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <div className="progress-text">{progress}%</div>
        </div>
      )}
      
      {compressedFile && (
        <div className="compressed-result">
          <h3>{isMultiFileMode ? 'Concatenation Complete' : 'Compression Complete'}</h3>
          <div className="file-info">
            {isMultiFileMode ? (
              <div><strong>Original Files Total:</strong> {formatFileSize(calculateTotalSize())}</div>
            ) : (
              <div><strong>Original:</strong> {formatFileSize(file.size)}</div>
            )}
            <div><strong>Output File:</strong> {formatFileSize(compressedFile.size)}</div>
            <div><strong>Compression Ratio:</strong> {calculateCompressionRatio()}:1</div>
          </div>
          
          <audio controls src={compressedFile.url} className="audio-preview"></audio>
          
          <button onClick={handleDownload} className="button button-success">
            Download {isMultiFileMode ? 'Concatenated' : 'Compressed'} File
          </button>
        </div>
      )}
      
      {error && error.includes('browser security restriction') && (
        <div className="cors-instructions">
          <h3>Technical Details for Advanced Users</h3>
          <p>This tool requires proper <strong>CORS</strong> (Cross-Origin Resource Sharing) headers to function. These are security features in modern browsers that restrict how web pages can load resources from different origins.</p>
          
          <details>
            <summary>Technical Solution for Development</summary>
            <div className="technical-solution">
              <p>If you're running Chrome locally for development, you can start it with security flags disabled:</p>
              <pre>
                {`chrome.exe --disable-web-security --disable-site-isolation-trials --user-data-dir="C:/ChromeDevSession"`}
              </pre>
              <p>For production use, ensure your server has these headers:</p>
              <pre>
                {`Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Opener-Policy: same-origin`}
              </pre>
            </div>
          </details>
          
          <p><strong>Note:</strong> Disabling security features is only recommended for development environments, never for regular browsing.</p>
        </div>
      )}
    </div>
  );
};

// Add CSS styles for the new components
const styles = `
  .metadata-display {
    margin-top: 10px;
    padding: 10px;
    background-color: #f8f9fa;
    border-radius: 5px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 8px;
  }
  
  .split-options {
    display: flex;
    gap: 20px;
    margin: 15px 0;
  }
  
  .split-result {
    margin-top: 20px;
    padding: 15px;
    border: 1px solid #ddd;
    border-radius: 5px;
    background-color: #f9f9f9;
  }
  
  .split-files-container {
    margin-top: 15px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-height: 400px;
    overflow-y: auto;
    padding: 10px;
    border: 1px solid #eee;
    border-radius: 4px;
  }
  
  .split-file-item {
    display: grid;
    grid-template-columns: 2fr 1fr 2fr 1fr;
    align-items: center;
    gap: 10px;
    padding: 10px;
    border-bottom: 1px solid #eee;
  }
  
  .split-file-item:last-child {
    border-bottom: none;
  }
  
  .split-file-name {
    font-size: 0.9rem;
    word-break: break-all;
  }
  
  .split-file-size {
    font-size: 0.8rem;
    color: #666;
  }
  
  .button-small {
    padding: 5px 10px;
    font-size: 0.8rem;
  }
  
  .mode-toggle {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-bottom: 20px;
  }
  
  .loading-duration {
    display: inline-block;
    font-style: italic;
    color: #666;
    animation: pulse 1.5s infinite;
  }
  
  @keyframes pulse {
    0% { opacity: 0.6; }
    50% { opacity: 1; }
    100% { opacity: 0.6; }
  }
  
  @media (max-width: 768px) {
    .split-file-item {
      grid-template-columns: 1fr;
      gap: 5px;
    }
    
    .mode-toggle {
      flex-direction: column;
    }
    
    .metadata-display {
      grid-template-columns: 1fr;
    }
  }
`;

// Inject styles
const styleElement = document.createElement('style');
styleElement.textContent = styles;
document.head.appendChild(styleElement);

export default AudioCompressor; 