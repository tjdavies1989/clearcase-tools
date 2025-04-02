import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { loadFFmpeg, compressAudio } from './ffmpegSetup';
import config from '../../config';

const AudioCompressor = () => {
  const [file, setFile] = useState(null);
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
    };
  }, []);
  
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile && selectedFile.type.startsWith('audio/')) {
      setFile(selectedFile);
      setCompressedFile(null);
      setError(null);
      
      // Create a URL for the original file to preview
      if (originalAudioUrl) {
        URL.revokeObjectURL(originalAudioUrl);
      }
      const url = URL.createObjectURL(selectedFile);
      setOriginalAudioUrl(url);
    } else if (selectedFile) {
      setError('Please select a valid audio file');
      setFile(null);
      setOriginalAudioUrl(null);
    }
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
    if (!file || !compressedFile) return null;
    const ratio = (file.size / compressedFile.size).toFixed(2);
    return ratio;
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
  
  return (
    <div className="audio-compressor">
      <Link to="/" className="back-button">← Back to Tools</Link>
      
      <h2>Audio Compression Tool</h2>
      
      {error && (
        <div className="alert alert-error">{error}</div>
      )}
      
      {statusMessage && (
        <div className="status-message">{statusMessage}</div>
      )}
      
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
      
      {file && (
        <>
          <div className="file-info">
            <strong>File:</strong> {file.name} ({formatFileSize(file.size)})
          </div>
          
          {originalAudioUrl && (
            <div className="original-audio">
              <h3>Original Audio</h3>
              <audio controls src={originalAudioUrl} className="audio-preview"></audio>
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
                <option value="8000">8,000 Hz</option>
                <option value="11025">11,025 Hz</option>
                <option value="22050">22,050 Hz</option>
                <option value="44100">44,100 Hz (CD Quality)</option>
                <option value="48000">48,000 Hz (DVD Quality)</option>
                <option value="96000">96,000 Hz (Studio Quality)</option>
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
            onClick={handleCompress}
            className="button button-primary"
            disabled={isProcessing || !ffmpegLoaded}
          >
            {isProcessing ? 'Compressing...' : 'Compress Audio'}
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
          <h3>Compression Complete</h3>
          <div className="file-info">
            <div><strong>Original:</strong> {formatFileSize(file.size)}</div>
            <div><strong>Compressed:</strong> {formatFileSize(compressedFile.size)}</div>
            <div><strong>Compression Ratio:</strong> {calculateCompressionRatio()}:1</div>
          </div>
          
          <audio controls src={compressedFile.url} className="audio-preview"></audio>
          
          <button onClick={handleDownload} className="button button-success">
            Download Compressed File
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

export default AudioCompressor; 