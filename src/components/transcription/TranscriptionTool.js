import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import SunEditor from 'suneditor-react';
import 'suneditor/dist/css/suneditor.min.css';
import config from '../../config';
import { loadFFmpeg, fetchFile } from '../compression/ffmpegSetup';
import { markdownToHtml } from '../../utils/formatConverter';

// Separate component for file items to properly use hooks
const FileItem = ({ fileObj, index, totalFiles, onMoveUp, onMoveDown, onRemove, isProcessing }) => {
  const audioRef = useRef(null);
  const [duration, setDuration] = useState(0);
  
  // Format file size
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
  
  // Format duration display
  const getAudioLengthDisplay = (durationSeconds) => {
    if (!durationSeconds) return 'Unknown';
    const minutes = Math.floor(durationSeconds / 60);
    const seconds = Math.floor(durationSeconds % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };
  
  return (
    <div className="file-item">
      <div className="file-order">{index + 1}</div>
      <div className="file-name">{fileObj.file.name}</div>
      <div className="file-size">
        {formatFileSize(fileObj.file.size)}
        {duration > 0 && <span> ({getAudioLengthDisplay(duration)})</span>}
      </div>
      <div className="file-preview">
        <audio 
          ref={audioRef}
          onLoadedMetadata={() => {
            if (audioRef.current) {
              setDuration(audioRef.current.duration);
            }
          }}
          controls 
          src={fileObj.previewUrl} 
          className="mini-audio-preview"
        ></audio>
      </div>
      <div className="file-actions">
        <button 
          onClick={() => onMoveUp(fileObj.id)}
          disabled={index === 0 || isProcessing}
          className="icon-button move-up"
          title="Move earlier in sequence"
        >
          ↑
        </button>
        <button 
          onClick={() => onMoveDown(fileObj.id)}
          disabled={index === totalFiles - 1 || isProcessing}
          className="icon-button move-down"
          title="Move later in sequence"
        >
          ↓
        </button>
        <button 
          onClick={() => onRemove(fileObj.id)}
          disabled={isProcessing}
          className="icon-button remove"
          title="Remove file"
        >
          ×
        </button>
      </div>
    </div>
  );
};

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
  const [cleanedTranscription, setCleanedTranscription] = useState('');
  const [isCleaning, setIsCleaning] = useState(false);
  const editorRef = useRef(null);
  const [statusMessage, setStatusMessage] = useState('');
  
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
      multipleFiles.forEach(fileObj => {
        if (fileObj.previewUrl) {
          URL.revokeObjectURL(fileObj.previewUrl);
        }
      });
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
      // Create objects with unique IDs and preview URLs for each file
      const fileObjects = validFiles.map(file => ({
        file,
        id: `file-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        previewUrl: URL.createObjectURL(file)
      }));
      
      setMultipleFiles(fileObjects);
      setFile(null); // Clear single file selection
      setTranscriptionResult(null);
      setError(null);
      setShowFileSizeWarning(false);
    } else {
      setError('Please select valid audio or video files');
    }
  };
  
  // Move a file up in the list (earlier in transcription order)
  const moveFileUp = (id) => {
    setMultipleFiles(prev => {
      const index = prev.findIndex(fileObj => fileObj.id === id);
      if (index <= 0) return prev;
      
      const newFiles = [...prev];
      const temp = newFiles[index];
      newFiles[index] = newFiles[index - 1];
      newFiles[index - 1] = temp;
      
      return newFiles;
    });
  };
  
  // Move a file down in the list (later in transcription order)
  const moveFileDown = (id) => {
    setMultipleFiles(prev => {
      const index = prev.findIndex(fileObj => fileObj.id === id);
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
    setMultipleFiles(prev => {
      // Find the file to remove and revoke its preview URL
      const fileToRemove = prev.find(fileObj => fileObj.id === id);
      if (fileToRemove && fileToRemove.previewUrl) {
        URL.revokeObjectURL(fileToRemove.previewUrl);
      }
      
      // Filter out the file
      return prev.filter(fileObj => fileObj.id !== id);
    });
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
      
      const chunkDuration = 10 * 60; // 10 minutes in seconds
      const overlap = 2; // 2 seconds overlap
      
      // Calculate number of chunks and set for progress tracking
      const numberOfChunks = Math.ceil(duration / (chunkDuration - overlap));
      setChunksTotal(numberOfChunks);
      
      const inputFileName = 'input' + file.name.substring(file.name.lastIndexOf('.'));
      await ffmpeg.writeFile(inputFileName, await fetchFile(file));
      
      const chunks = [];
      
      // Iterate exactly numberOfChunks times
      for (let i = 0; i < numberOfChunks; i++) {
        const startTime = i * (chunkDuration - overlap); // Calculate startTime based on index
        setCurrentChunk(i + 1);
        
        const chunkName = `chunk_${i}${file.name.substring(file.name.lastIndexOf('.'))}`;
        const outputChunkName = `chunk_${i}.mp3`; // Force MP3 output for chunks
        const currentChunkDuration = (i === numberOfChunks - 1) 
          ? (duration - startTime) // Calculate precise duration for the last chunk
          : chunkDuration;         // Use standard duration for others
        
        // Execute FFmpeg command to extract and re-encode chunk to MP3
        await ffmpeg.exec([
          '-i', inputFileName,
          '-ss', startTime.toString(),
          '-t', currentChunkDuration.toString(), // Use calculated duration
          '-c:a', 'libmp3lame', // Re-encode using MP3 codec
          '-b:a', '128k',        // Set a reasonable bitrate
          '-vn',                // Disable video processing if input is video
          outputChunkName
        ]);
        
        // Get the chunk as a file
        const data = await ffmpeg.readFile(outputChunkName);
        const blob = new Blob([data.buffer], { type: 'audio/mpeg' }); // Correct MIME type for MP3
        chunks.push(new File([blob], outputChunkName, { type: 'audio/mpeg' }));
        
        // Clean up
        await ffmpeg.deleteFile(outputChunkName);
        
        // Update progress based on loop index 'i'
        setChunkProgress(((i + 1) / numberOfChunks) * 100);
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
    setError(null); // Clear previous errors
    
    let combinedText = '';
    let chunkErrors = []; // Store errors for individual chunks
    
    console.log(`Starting transcription for ${files.length} file(s)/chunk(s).`);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      console.log(`Processing chunk ${i + 1} of ${files.length}: ${file.name}`);

      try { // Move try...catch inside the loop
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
          // Throw specific error for this chunk
          throw new Error(`Chunk ${i + 1} failed: ${response.status} - ${errorData.error?.message || 'API error'}`);
        }
        
        // Process response - Assuming JSON as per config
        const jsonResult = await response.json();
        const result = jsonResult.text;
        
        if (result) {
          console.log(`Chunk ${i + 1} transcribed successfully.`);
          combinedText += (combinedText ? '\n\n' : '') + result;
        } else {
           console.warn(`Chunk ${i + 1} returned empty result.`);
           chunkErrors.push(`Chunk ${i + 1} returned empty result.`);
        }
        
      } catch (err) {
        // Catch error for this specific chunk
        console.error(`Error transcribing chunk ${i + 1}:`, err);
        chunkErrors.push(`Error in chunk ${i + 1}: ${err.message}`);
        // Continue to the next chunk instead of stopping
      }
    }
      
    setTranscriptionResult(combinedText);
    
    // Report any chunk errors
    if (chunkErrors.length > 0) {
      setError(`Transcription completed with errors in ${chunkErrors.length} chunk(s):\n- ${chunkErrors.join('\n- ')}`);
    } else if (!combinedText) {
       setError('Transcription finished, but no text was generated. All chunks may have failed or returned empty.');
    } else {
       setError(null); // Clear error if successful
    }
    
    setIsProcessing(false);
  };

  const handleTranscribe = async () => {
    // Handle multi-file case first
    if (multipleFiles.length > 0) {
      const rawFiles = multipleFiles.map(fileObj => fileObj.file);
      // TODO: Consider pre-processing M4A files even in multi-file mode?
      try {
        setIsProcessing(true); 
        setStatusMessage('Processing multiple files...');
        // Consider if chunking/re-encoding is needed for multiple files here
        await transcribeMultipleFiles(rawFiles); 
      } catch (err) {
        console.error('Multi-file transcription error:', err);
        setError(`Transcription failed: ${err.message}`);
      } finally {
        setIsProcessing(false);
        setStatusMessage('');
      }
      return;
    }

    // Handle single file case
    if (!file) return;

    let processedFiles = []; // Define outside try
    setError(null);
    setIsProcessing(true);
    setIsChunking(false); // Default to false
    setStatusMessage('Preparing file...');
    setChunkProgress(0);
    setTranscriptionResult(null); // Clear previous results

    try {
      if (!ffmpeg) {
        throw new Error('Audio processing library (FFmpeg) is not loaded.');
      }
      
      // Check if processing (chunking or re-encoding) is necessary
      const duration = await getAudioDuration(file);
      const isM4A = file.name.toLowerCase().endsWith('.m4a') || file.type === 'audio/mp4' || file.type === 'audio/x-m4a';
      const needsProcessing = isM4A || duration > (10 * 60); // Process if M4A or > 10 minutes

      if (needsProcessing) {
          // Process the file using chunkAudioFile
          setStatusMessage('Processing audio file...');
          setIsChunking(true); // Indicate processing (might not be actual *chunking*)
          processedFiles = await chunkAudioFile(file);
          
          // Update UI based on whether chunking actually occurred
          if (processedFiles.length > 1) {
            console.log(`File split into ${processedFiles.length} chunks.`);
            // Keep isChunking true
          } else {
            console.log('File processed into a single segment (re-encoded).');
            setIsChunking(false); // Set back to false if only one file resulted
          }
      } else {
          // File is short and not M4A, send original
          console.log('File is <= 10 mins and not M4A, sending original directly.');
          processedFiles = [file];
          setIsChunking(false);
      }

      // Proceed with transcription using the processed file(s)
      setStatusMessage('Transcribing...');
      await transcribeMultipleFiles(processedFiles);
      setStatusMessage(''); // Clear on success

    } catch (err) {
      console.error('Single file transcription error:', err);
      setError(`Transcription failed: ${err.message}`);
      setStatusMessage(''); // Clear on error
    } finally {
      // Ensure UI flags are reset
      setIsProcessing(false);
      // isChunking should be correctly set within the try block now
      // But reset just in case an error occurred before it was set back
      if (processedFiles.length <= 1) {
         setIsChunking(false);
      }
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
  
  // Format file size
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
  
  // Get audio duration for display
  const getAudioLengthDisplay = (durationSeconds) => {
    if (!durationSeconds) return 'Unknown';
    const minutes = Math.floor(durationSeconds / 60);
    const seconds = Math.floor(durationSeconds % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };
  
  // Clean markdown code fences (copied from ProcessingTool for safety, though prompt requests no fences)
  const cleanMarkdownCodeFences = (text) => {
    if (!text) return '';
    // Remove ```markdown at the beginning if present
    let cleaned = text.replace(/^```markdown\s*/i, '');
    // Remove ``` at the end if present
    cleaned = cleaned.replace(/\s*```\s*$/, '');
    return cleaned;
  };

  // SunEditor options (similar to ProcessingTool)
  const editorOptions = {
    height: '400px', // Adjusted height
    buttonList: [
      ['undo', 'redo'],
      ['font', 'fontSize', 'formatBlock'],
      ['bold', 'underline', 'italic', 'strike', 'subscript', 'superscript'],
      ['removeFormat'],
      '/', // Line break
      ['fontColor', 'hiliteColor'],
      ['outdent', 'indent'],
      ['align', 'horizontalRule', 'list', 'table'],
      ['link'], // Removed image button
      ['fullScreen', 'showBlocks', 'codeView'],
      ['preview', 'print'],
    ],
    defaultStyle: 'font-family: Arial, sans-serif; font-size: 14px;',
    formats: ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote'],
  };

  const handleCleanTranscript = async () => {
    if (!transcriptionResult) return;

    setError(null);
    setIsCleaning(true);
    setCleanedTranscription(''); // Clear previous cleaned result

    try {
      const { model, maxTokens, temperature, responseFormat } = config.modelSettings.transcriptionCleanup;
      const systemPrompt = config.systemPrompts.transcriptionCleanup;

      const response = await fetch(config.apiEndpoints.chatCompletions, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.openaiApiKey}`,
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: transcriptionResult }
          ],
          max_tokens: maxTokens,
          temperature: temperature,
          response_format: responseFormat,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API error: ${response.status} ${response.statusText} - ${errorData.error?.message || 'Unknown error'}`);
      }

      const data = await response.json();
      const cleanedResult = data.choices[0]?.message?.content;

      if (!cleanedResult) {
        throw new Error('No cleaned transcript received from the API.');
      }
      
      // Clean potential markdown fences (just in case)
      const cleanedMarkdown = cleanMarkdownCodeFences(cleanedResult);
      
      // Convert markdown to HTML for SunEditor
      const htmlResult = markdownToHtml(cleanedMarkdown);
      setCleanedTranscription(htmlResult);

    } catch (err) {
      console.error('Transcription cleaning error:', err);
      setError(`Cleaning failed: ${err.message}`);
    } finally {
      setIsCleaning(false);
    }
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
          <div className="multiple-files-container">
            <div className="file-list-header">
              <div className="file-order">#</div>
              <div className="file-name">Filename</div>
              <div className="file-size">Size</div>
              <div className="file-preview">Preview</div>
              <div className="file-actions">Actions</div>
            </div>
            
            {multipleFiles.map((fileObj, index) => (
              <FileItem 
                key={fileObj.id}
                fileObj={fileObj}
                index={index}
                totalFiles={multipleFiles.length}
                onMoveUp={moveFileUp}
                onMoveDown={moveFileDown}
                onRemove={removeFile}
                isProcessing={isProcessing}
              />
            ))}
            
            <div className="transcription-sequence-info">
              <p>The files will be transcribed in the order shown above. Use the up/down arrows to change the sequence.</p>
            </div>
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
          
          {(isProcessing || isChunking) && (
            <div className="processing-indicator">
              <div className="spinner"></div>
              <p>{isChunking ? `Processing chunks... (${currentChunk}/${chunksTotal} - ${chunkProgress.toFixed(1)}%)` : 'Transcribing...'}</p>
            </div>
          )}

          {transcriptionResult && !isProcessing && (
            <div className="result">
              <h3>Raw Transcription</h3>
              <textarea
                value={transcriptionResult}
                readOnly
                className="form-control result-textarea"
                rows="15"
              />
              <div className="action-buttons">
                <button onClick={handleCopy} className="button">Copy Text</button>
                <button onClick={handleDownload} className="button">Download Text</button>
                
                {/* Add Clean Transcript Button */}
                {!isCleaning && !cleanedTranscription && (
                   <button 
                     onClick={handleCleanTranscript} 
                     className="button button-primary"
                     disabled={isCleaning}
                   >
                     Clean Transcript
                   </button>
                )}
              </div>

              {/* Cleaning Indicator */}
              {isCleaning && (
                <div className="processing-indicator">
                  <div className="spinner"></div>
                  <p>Cleaning transcript...</p>
                </div>
              )}

              {/* Cleaned Transcript Editor */}
              {cleanedTranscription && !isCleaning && (
                <div className="cleaned-result">
                   <h3>Cleaned Transcription Editor</h3>
                   <div className="wysiwyg-editor">
                     <SunEditor
                       setContents={cleanedTranscription}
                       onChange={(content) => setCleanedTranscription(content)} // Allow editing
                       setOptions={editorOptions}
                       ref={editorRef} // Assign ref if needed later
                     />
                   </div>
                   {/* Optional: Add save/copy buttons for the cleaned transcript */}
                   <div className="action-buttons">
                      <button onClick={() => navigator.clipboard.writeText(cleanedTranscription)} className="button">Copy Cleaned HTML</button>
                      {/* Add other actions like save as needed */}
                   </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
      
      {/* Add styles for the new components */}
      <style jsx="true">{`
        .multiple-files-container {
          margin-top: 10px;
          border: 1px solid #ddd;
          border-radius: 4px;
          padding: 10px;
          background-color: #f9f9f9;
        }
        
        .file-list-header {
          display: grid;
          grid-template-columns: 50px 2fr 1fr 2fr 120px;
          gap: 10px;
          font-weight: bold;
          padding: 8px 0;
          border-bottom: 1px solid #ddd;
        }
        
        .file-item {
          display: grid;
          grid-template-columns: 50px 2fr 1fr 2fr 120px;
          gap: 10px;
          align-items: center;
          padding: 10px 0;
          border-bottom: 1px solid #eee;
        }
        
        .file-item:last-child {
          border-bottom: none;
        }
        
        .file-order {
          text-align: center;
          font-weight: bold;
        }
        
        .file-name {
          word-break: break-all;
        }
        
        .file-size {
          color: #555;
          font-size: 0.9em;
        }
        
        .file-preview {
          width: 100%;
        }
        
        .mini-audio-preview {
          width: 100%;
          height: 30px;
        }
        
        .file-actions {
          display: flex;
          gap: 5px;
          justify-content: flex-end;
        }
        
        .icon-button {
          width: 30px;
          height: 30px;
          border: 1px solid #ccc;
          background-color: #f0f0f0;
          border-radius: 4px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
        }
        
        .icon-button:hover:not([disabled]) {
          background-color: #e0e0e0;
        }
        
        .icon-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .move-up, .move-down {
          color: #0056b3;
        }
        
        .remove {
          color: #dc3545;
        }
        
        .transcription-sequence-info {
          margin-top: 10px;
          padding: 10px;
          background-color: #e8f4f8;
          border-radius: 4px;
          font-size: 0.9em;
          color: #004085;
        }
        
        @media (max-width: 768px) {
          .file-list-header, .file-item {
            grid-template-columns: 40px 2fr 1fr 80px;
          }
          
          .file-preview {
            display: none;
          }
        }
      `}</style>
    </div>
  );
};

export default TranscriptionTool; 