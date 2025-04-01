import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { loadFFmpeg, compressAudio } from './ffmpegSetup';
import config from '../../config';

const AudioCompressor = () => {
  const [file, setFile] = useState(null);
  const [format, setFormat] = useState('mp3');
  const [bitrate, setBitrate] = useState('128k');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [compressedFile, setCompressedFile] = useState(null);
  const ffmpegRef = useRef(null);
  
  // Load FFmpeg on component mount
  useEffect(() => {
    const initFFmpeg = async () => {
      try {
        setError(null);
        const ffmpeg = await loadFFmpeg();
        ffmpegRef.current = ffmpeg;
        setFfmpegLoaded(true);
      } catch (err) {
        console.error('Error loading FFmpeg:', err);
        setError(`Failed to load audio processing library: ${err.message}`);
      }
    };
    
    initFFmpeg();
    
    // Cleanup on unmount
    return () => {
      if (ffmpegRef.current) {
        // No explicit cleanup needed for FFmpeg in the browser
        ffmpegRef.current = null;
      }
    };
  }, []);
  
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile && selectedFile.type.startsWith('audio/')) {
      setFile(selectedFile);
      setCompressedFile(null);
      setError(null);
    } else if (selectedFile) {
      setError('Please select a valid audio file');
      setFile(null);
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
  
  const handleCompress = async () => {
    if (!file || !ffmpegLoaded) return;
    
    try {
      setError(null);
      setIsProcessing(true);
      setProgress(0);
      
      // Start compression
      const compressed = await compressAudio(
        ffmpegRef.current,
        file,
        format,
        bitrate
      );
      
      // Create a URL for the compressed file
      const url = URL.createObjectURL(compressed);
      
      setCompressedFile({
        url,
        name: `compressed_${file.name.split('.')[0]}.${format}`,
        size: compressed.size,
        type: compressed.type
      });
      
      setProgress(100);
    } catch (err) {
      console.error('Compression error:', err);
      setError(`Compression failed: ${err.message}`);
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
  
  return (
    <div className="audio-compressor">
      <Link to="/" className="back-button">← Back to Tools</Link>
      
      <h2>Audio Compression Tool</h2>
      
      {error && (
        <div className="alert alert-error">{error}</div>
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
          
          <div className="form-group">
            <label className="form-label">Output Format</label>
            <select
              value={format}
              onChange={handleFormatChange}
              className="form-control"
              disabled={isProcessing}
            >
              {config.ffmpeg.formats.map((fmt) => (
                <option key={fmt} value={fmt}>{fmt.toUpperCase()}</option>
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
    </div>
  );
};

export default AudioCompressor; 