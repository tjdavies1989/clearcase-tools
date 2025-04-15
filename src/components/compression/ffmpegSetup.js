import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

// This function will load FFmpeg with proper CORS settings
export const loadFFmpeg = async () => {
  const ffmpeg = new FFmpeg();

  // Log loading status
  ffmpeg.on('log', ({ message }) => {
    console.log(`FFmpeg: ${message}`);
  });

  const localSource = {
      name: 'Local files',
      coreURL: `${window.location.origin}/ffmpeg/ffmpeg-core.js`,
      wasmURL: `${window.location.origin}/ffmpeg/ffmpeg-core.wasm`
  };

  try {
    console.log(`Attempting to load FFmpeg from ${localSource.name}`);
    await ffmpeg.load({
      coreURL: localSource.coreURL,
      wasmURL: localSource.wasmURL,
      // workerURL: `${window.location.origin}/ffmpeg/ffmpeg-core.worker.js` // Uncomment if worker file is present and needed
    });
    
    console.log(`FFmpeg loaded successfully from ${localSource.name}`);
    return ffmpeg;
  } catch (error) {
    console.error(`Failed to load FFmpeg from ${localSource.name}:`, error);
    // Check if the specific files seem to be missing
    const coreExists = await checkIfResourceExists(localSource.coreURL);
    const wasmExists = await checkIfResourceExists(localSource.wasmURL);

    let errorMessage = `Failed to load FFmpeg from local files. `; 
    if (!coreExists) {
      errorMessage += `Could not find ${localSource.coreURL}. `;
    }
    if (!wasmExists) {
      errorMessage += `Could not find ${localSource.wasmURL}. `;
    }
    if (!coreExists || !wasmExists) {
      errorMessage += `Please ensure ffmpeg-core.js and ffmpeg-core.wasm are present in the /public/ffmpeg/ directory. You may need to download them manually from https://unpkg.com/@ffmpeg/core@0.12.6/dist/`;
    }

    throw new Error(errorMessage);
  }
};

// Helper function to check if a resource exists
const checkIfResourceExists = async (url) => {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch (error) {
    return false;
  }
};

// Helper function to compress audio using FFmpeg
export const compressAudio = async (ffmpeg, inputFile, outputFormat, bitrate, sampleRate = '44100', channels = '2') => {
  if (!ffmpeg.loaded) {
    throw new Error('FFmpeg is not loaded');
  }

  try {
    // Write the file to memory
    const inputFileName = `input.${inputFile.name.split('.').pop()}`;
    const outputFileName = `output.${outputFormat}`;
    
    // Convert file to buffer
    const fileData = await fetchFile(inputFile);
    
    // Write the file to FFmpeg's virtual file system
    await ffmpeg.writeFile(inputFileName, fileData);
    
    // Set up compression command based on format and bitrate
    let command = [];
    
    // Common parameters for all formats
    const commonParams = [
      '-i', inputFileName,
      '-ar', sampleRate,    // Sample rate
      '-ac', channels       // Audio channels
    ];
    
    switch (outputFormat) {
      case 'mp3':
        command = [
          ...commonParams,
          '-b:a', bitrate,
          '-codec:a', 'libmp3lame',
          outputFileName
        ];
        break;
      case 'm4a':  // For AAC
        command = [
          ...commonParams,
          '-b:a', bitrate,
          '-codec:a', 'aac',
          outputFileName
        ];
        break;
      case 'opus':
        command = [
          ...commonParams,
          '-b:a', bitrate,
          '-codec:a', 'libopus',
          outputFileName
        ];
        break;
      case 'wav':
        command = [
          ...commonParams,
          outputFileName
        ];
        break;
      default:
        throw new Error(`Unsupported format: ${outputFormat}`);
    }
    
    // Log the command for debugging
    console.log('FFmpeg command:', command.join(' '));
    
    // Execute FFmpeg command
    await ffmpeg.exec(command);
    
    // Read the output file
    const outputData = await ffmpeg.readFile(outputFileName);
    
    // Create a Blob from the compressed data
    const mimeType = getMimeType(outputFormat);
    const blob = new Blob([outputData], { type: mimeType });
    
    // Clean up by removing temporary files
    await ffmpeg.deleteFile(inputFileName);
    await ffmpeg.deleteFile(outputFileName);
    
    return blob;
  } catch (error) {
    console.error('Error compressing audio:', error);
    throw new Error(`Compression failed: ${error.message}`);
  }
};

// Helper function to get the correct MIME type
const getMimeType = (format) => {
  switch (format) {
    case 'mp3':
      return 'audio/mpeg';
    case 'm4a':
      return 'audio/mp4';
    case 'opus':
      return 'audio/opus';
    case 'wav':
      return 'audio/wav';
    default:
      return `audio/${format}`;
  }
};

// Function to concatenate multiple audio files
export const concatenateAudioFiles = async (ffmpeg, files, outputFormat, bitrate, sampleRate = '44100', channels = '2') => {
  if (!ffmpeg.loaded) {
    throw new Error('FFmpeg is not loaded');
  }

  if (!files || files.length === 0) {
    throw new Error('No files provided for concatenation');
  }

  try {
    // Create a temporary directory for intermediate files
    const tempDir = 'temp_concat/';
    try {
      await ffmpeg.createDir(tempDir);
    } catch (dirError) {
      // Directory might already exist, which is fine
      console.log('Directory may already exist, continuing:', dirError);
    }

    // For the concat command, we need a list of input files
    let intermediateFiles = [];
    let concatFileContent = '';

    // Process all input files and convert them to a common format for easier concatenation
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const originalFileName = `input_${i}.${file.name.split('.').pop()}`;
      const tempFileName = `${tempDir}temp_${i}.wav`;  // WAV format for intermediate files
      
      try {
        // Write the input file to memory
        const fileData = await fetchFile(file);
        await ffmpeg.writeFile(originalFileName, fileData);
        
        // Convert to a uniform format (WAV) to ensure compatibility during concatenation
        await ffmpeg.exec([
          '-i', originalFileName,
          '-ar', sampleRate,    // Sample rate
          '-ac', channels,      // Audio channels
          '-c:a', 'pcm_s16le',  // Linear PCM format
          '-f', 'wav',          // Force WAV format
          tempFileName
        ]);
        
        // Check if the intermediate file was created
        try {
          // Test if file exists by trying to read its stats
          await ffmpeg.readFile(tempFileName, { length: 4 });
          
          // Add to list of files to concatenate
          intermediateFiles.push(tempFileName);
          concatFileContent += `file '${tempFileName}'\n`;
        } catch (fileError) {
          console.error(`Failed to create intermediate file for ${file.name}:`, fileError);
          throw new Error(`Failed to process file ${file.name}: ${fileError.message}`);
        }
        
        // Clean up original input file
        try {
          await ffmpeg.deleteFile(originalFileName);
        } catch (deleteError) {
          console.warn(`Failed to delete original file ${originalFileName}:`, deleteError);
          // Non-fatal, continue processing
        }
      } catch (processError) {
        console.error(`Error processing file ${file.name}:`, processError);
        throw new Error(`Failed to process file ${file.name}: ${processError.message}`);
      }
    }

    if (intermediateFiles.length === 0) {
      throw new Error('No valid files were processed for concatenation');
    }
    
    // Create a concat list file
    const concatFileName = `${tempDir}concat_list.txt`;
    await ffmpeg.writeFile(concatFileName, concatFileContent);
    
    // Output filename
    const outputFileName = `output.${outputFormat}`;
    
    // Concatenate the files
    console.log('Executing concat command with list:', concatFileContent);
    await ffmpeg.exec([
      '-f', 'concat',
      '-safe', '0',
      '-i', concatFileName,
      '-c:a', getCodecForFormat(outputFormat),
      ...(outputFormat !== 'wav' ? ['-b:a', bitrate] : []),
      '-ar', sampleRate,
      '-ac', channels,
      '-metadata', 'title=',         // Clear metadata
      '-metadata', 'artist=',        // Clear metadata
      '-metadata', 'album=',         // Clear metadata
      '-metadata', 'comment=',       // Clear metadata
      '-metadata', 'year=',          // Clear metadata
      '-map_metadata', '-1',         // Remove all metadata
      '-flags', '+bitexact',         // Use exact bitrate
      outputFileName
    ]);
    
    // Read the concatenated output file
    let outputData;
    try {
      outputData = await ffmpeg.readFile(outputFileName);
    } catch (readError) {
      console.error('Failed to read output file:', readError);
      throw new Error(`Failed to read concatenated file: ${readError.message}`);
    }
    
    // Create a Blob from the compressed data
    const mimeType = getMimeType(outputFormat);
    const blob = new Blob([outputData], { type: mimeType });
    
    // Clean up all temporary files (but don't throw if cleanup fails)
    const cleanup = async () => {
      try {
        for (const file of intermediateFiles) {
          try {
            await ffmpeg.deleteFile(file);
          } catch (e) {
            console.warn(`Cleanup: Failed to delete ${file}:`, e);
          }
        }
        
        try {
          await ffmpeg.deleteFile(concatFileName);
        } catch (e) {
          console.warn(`Cleanup: Failed to delete concat list:`, e);
        }
        
        try {
          await ffmpeg.deleteFile(outputFileName);
        } catch (e) {
          console.warn(`Cleanup: Failed to delete output file:`, e);
        }
        
        try {
          await ffmpeg.deleteDir(tempDir);
        } catch (e) {
          console.warn(`Cleanup: Failed to delete temp directory:`, e);
        }
      } catch (cleanupError) {
        console.warn('Non-fatal cleanup error:', cleanupError);
      }
    };
    
    // Run cleanup but don't wait for it - allows returning the blob faster
    cleanup();
    
    return blob;
  } catch (error) {
    // Attempt to clean up on error
    try {
      const filesToDelete = await ffmpeg.readdir('temp_concat/');
      for (const file of filesToDelete) {
        try {
          await ffmpeg.deleteFile(`temp_concat/${file}`);
        } catch (e) {}
      }
      try {
        await ffmpeg.deleteDir('temp_concat/');
      } catch (e) {}
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
    
    console.error('Error concatenating audio files:', error);
    throw new Error(`Concatenation failed: ${error.message || 'Unknown error'}`);
  }
};

// Helper function to get the correct codec for a format
const getCodecForFormat = (format) => {
  switch (format) {
    case 'mp3':
      return 'libmp3lame';
    case 'm4a':
      return 'aac';
    case 'opus':
      return 'libopus';
    case 'wav':
      return 'pcm_s16le';
    default:
      return format;
  }
};

// Special function to handle m4a files which are problematic for concatenation
export const concatenateM4aFiles = async (ffmpeg, files, outputFormat, bitrate, sampleRate = '44100', channels = '2') => {
  if (!ffmpeg.loaded) {
    throw new Error('FFmpeg is not loaded');
  }

  if (!files || files.length === 0) {
    throw new Error('No files provided for concatenation');
  }

  try {
    // For M4A files, we'll use a different approach:
    // 1. Convert all to MP3 first (more reliable intermediate format)
    // 2. Concatenate the MP3s
    // 3. Convert back to desired format

    // First, write all files to FFmpeg's virtual filesystem
    const intermediateFiles = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileName = `input_${i}.${file.name.split('.').pop()}`;
      
      console.log(`Processing file ${i+1}/${files.length}: ${file.name}`);
      
      // Write the input file to memory
      const fileData = await fetchFile(file);
      await ffmpeg.writeFile(fileName, fileData);
      
      // Convert to intermediate MP3 (or WAV for even more reliability)
      const intermediateName = `temp_${i}.mp3`;
      
      // Use simpler conversion with more compatibility flags
      await ffmpeg.exec([
        '-i', fileName,
        '-ar', sampleRate,
        '-ac', channels,
        '-c:a', 'libmp3lame',
        '-b:a', '128k',          // Use consistent bitrate for all intermediate files
        '-map_metadata', '-1',   // Strip metadata
        intermediateName
      ]);
      
      intermediateFiles.push(intermediateName);
      
      // Clean up original file
      await ffmpeg.deleteFile(fileName);
    }
    
    // Create a single file by concatenating with the concat demuxer
    // For complex audio issues, demuxer works better than the filter
    const outputFileName = `output.${outputFormat === 'aac' ? 'm4a' : outputFormat}`;
    
    // If we have only one file, rename it
    if (intermediateFiles.length === 1) {
      // Just convert to the final format
      await ffmpeg.exec([
        '-i', intermediateFiles[0],
        '-ar', sampleRate,
        '-ac', channels,
        '-c:a', getCodecForFormat(outputFormat === 'aac' ? 'm4a' : outputFormat),
        ...(outputFormat !== 'wav' ? ['-b:a', bitrate] : []),
        '-map_metadata', '-1',
        outputFileName
      ]);
    } else {
      // Create filter complex command for concatenation
      // This is more reliable than the concat demuxer for problematic files
      let filterComplex = '';
      let inputs = [];
      
      for (let i = 0; i < intermediateFiles.length; i++) {
        inputs.push('-i', intermediateFiles[i]);
        filterComplex += `[${i}:0]`;
      }
      
      filterComplex += `concat=n=${intermediateFiles.length}:v=0:a=1[out]`;
      
      // Build the command
      const command = [
        ...inputs,
        '-filter_complex', filterComplex,
        '-map', '[out]',
        '-ar', sampleRate,
        '-ac', channels,
        '-c:a', getCodecForFormat(outputFormat === 'aac' ? 'm4a' : outputFormat),
        ...(outputFormat !== 'wav' ? ['-b:a', bitrate] : []),
        '-map_metadata', '-1',
        outputFileName
      ];
      
      console.log('Executing complex filter concat command:', command.join(' '));
      await ffmpeg.exec(command);
    }
    
    // Read the output file
    const outputData = await ffmpeg.readFile(outputFileName);
    
    // Create a Blob from the data
    const mimeType = getMimeType(outputFormat === 'aac' ? 'm4a' : outputFormat);
    const blob = new Blob([outputData], { type: mimeType });
    
    // Clean up
    for (const file of intermediateFiles) {
      try {
        await ffmpeg.deleteFile(file);
      } catch (e) {
        console.warn(`Failed to delete intermediate file ${file}:`, e);
      }
    }
    
    try {
      await ffmpeg.deleteFile(outputFileName);
    } catch (e) {
      console.warn(`Failed to delete output file:`, e);
    }
    
    return blob;
  } catch (error) {
    console.error('Error concatenating m4a files:', error);
    throw new Error(`M4A concatenation failed: ${error.message || 'Unknown error'}`);
  }
};

// Export fetchFile for use in other components
export { fetchFile };

// Use named exports only
// export default {
//   loadFFmpeg,
//   compressAudio,
//   concatenateAudioFiles,
//   concatenateM4aFiles
// }; 

// Function to extract audio metadata using FFmpeg
export const getAudioMetadata = async (ffmpeg, file) => {
  if (!ffmpeg.loaded) {
    throw new Error('FFmpeg is not loaded');
  }

  try {
    // First try using browser's native Audio object to get duration
    let nativeDuration = 0;
    let nativeMetadata = {};
    
    try {
      const audioUrl = URL.createObjectURL(file);
      const audio = new Audio();
      
      // Create a promise to wait for metadata to load
      const metadataPromise = new Promise((resolve, reject) => {
        audio.onloadedmetadata = () => {
          nativeDuration = audio.duration;
          nativeMetadata.duration = audio.duration;
          resolve();
        };
        audio.onerror = () => reject(new Error("Failed to load audio metadata"));
        // Set timeout in case it hangs
        setTimeout(() => reject(new Error("Metadata load timeout")), 5000);
      });
      
      // Start loading the audio
      audio.src = audioUrl;
      await metadataPromise;
      URL.revokeObjectURL(audioUrl);
    } catch (nativeErr) {
      console.warn('Could not get metadata using native audio:', nativeErr);
    }
    
    // Write the input file to memory for FFmpeg processing
    const inputFileName = `metadata_${Date.now()}.${file.name.split('.').pop()}`;
    const fileData = await fetchFile(file);
    await ffmpeg.writeFile(inputFileName, fileData);

    // Run FFprobe-like command to get stream info
    await ffmpeg.exec([
      '-i', inputFileName,
      '-f', 'null',
      '-'
    ]);

    // Get logs from FFmpeg for parsing
    let logs = '';
    if (typeof ffmpeg.readLogs === 'function') {
      logs = ffmpeg.readLogs().join('\n');
    } else {
      // For older versions, we can't directly access logs
      console.warn('ffmpeg.readLogs not available, limited metadata extraction');
    }

    // Try to parse metadata from logs - more robust patterns
    const durationMatch = logs.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
    const bitrateMatch = logs.match(/bitrate[:\s]+(\d+) kb\/s/i);
    
    // More flexible audio format regex
    const audioMatch = logs.match(/Audio: ([^,]+)(?:.*?)(\d+)(?:\s*)Hz(?:.*?)(\d+(?:\.\d+)?)(?:\s*)ch|\b(mono|stereo)\b/i);
    
    // More specific pattern for m4a/mp4 files
    const mp4Match = logs.match(/Stream #0:(\d+).*?: Audio: ([^,]+)(?:.*?)(\d+) Hz, ([^,]+)/);

    let duration = nativeDuration;
    if (durationMatch) {
      const hours = parseInt(durationMatch[1]);
      const minutes = parseInt(durationMatch[2]);
      const seconds = parseFloat(durationMatch[3]);
      duration = hours * 3600 + minutes * 60 + seconds;
    }

    // Get bitrate information
    let bitrate = 'Unknown';
    if (bitrateMatch) {
      bitrate = parseInt(bitrateMatch[1]) + ' kb/s';
    }

    // Get codec, sample rate and channels
    let codec = 'Unknown';
    let sampleRate = 'Unknown';
    let channels = 'Unknown';

    if (audioMatch) {
      codec = audioMatch[1] ? audioMatch[1].trim() : 'Unknown';
      sampleRate = audioMatch[2] ? audioMatch[2] + ' Hz' : 'Unknown';
      
      // Check if we have channel info
      if (audioMatch[3]) {
        channels = audioMatch[3] + ' ' + (audioMatch[3] === '1' ? '(Mono)' : '(Stereo)');
      } else if (audioMatch[4]) {
        channels = audioMatch[4] === 'mono' ? '1 (Mono)' : '2 (Stereo)';
      }
    } else if (mp4Match) {
      // Try MP4 specific pattern
      codec = mp4Match[2] ? mp4Match[2].trim() : 'Unknown';
      sampleRate = mp4Match[3] ? mp4Match[3] + ' Hz' : 'Unknown';
      channels = mp4Match[4] ? mp4Match[4].trim() : 'Unknown';
      
      if (channels === 'stereo') channels = '2 (Stereo)';
      else if (channels === 'mono') channels = '1 (Mono)';
    }

    // For m4a files specifically, try using the container type
    if (codec === 'Unknown' && file.name.toLowerCase().endsWith('.m4a')) {
      codec = 'AAC (most likely)';
    }

    // Clean up
    await ffmpeg.deleteFile(inputFileName);

    return {
      duration,
      bitrate,
      codec,
      sampleRate,
      channels,
      ...nativeMetadata
    };
  } catch (error) {
    console.error('Error getting audio metadata:', error);
    
    // Try to get at least duration from native browser API as a last resort
    try {
      const audioUrl = URL.createObjectURL(file);
      const audio = new Audio();
      
      // Create a promise to wait for metadata to load
      const durationPromise = new Promise((resolve) => {
        audio.onloadedmetadata = () => {
          resolve(audio.duration);
        };
        audio.onerror = () => resolve(0);
        setTimeout(() => resolve(0), 3000);
      });
      
      audio.src = audioUrl;
      const duration = await durationPromise;
      URL.revokeObjectURL(audioUrl);
      
      return {
        duration,
        bitrate: 'Unknown',
        codec: 'Unknown',
        sampleRate: 'Unknown',
        channels: 'Unknown'
      };
    } catch (e) {
      console.warn('Complete metadata extraction failure:', e);
      return {
        duration: 0,
        bitrate: 'Unknown',
        codec: 'Unknown',
        sampleRate: 'Unknown',
        channels: 'Unknown'
      };
    }
  }
};

// Simplified function to split audio into chunks with minimal complexity
export const splitAudioFile = async (ffmpeg, file, chunkDurationMinutes, overlapSeconds = 3, outputFormat = 'mp3') => {
  if (!ffmpeg.loaded) {
    throw new Error('FFmpeg is not loaded');
  }

  try {
    // Very simple approach with minimal processing
    // Step 1: Load file
    const inputFileName = 'input.' + file.name.split('.').pop();
    const fileData = await fetchFile(file);
    await ffmpeg.writeFile(inputFileName, fileData);

    // Step 2: Just get duration using HTML5 Audio
    let duration = 0;
    try {
      // Use a promise with timeout to get duration safely
      const url = URL.createObjectURL(file);
      duration = await new Promise((resolve, reject) => {
        const audio = new Audio();
        const timeout = setTimeout(() => {
          resolve(0); // Default to 0 on timeout
        }, 5000);
        
        audio.onloadedmetadata = () => {
          clearTimeout(timeout);
          resolve(audio.duration || 0);
        };
        
        audio.onerror = () => {
          clearTimeout(timeout);
          resolve(0); // Don't crash on error
        };
        
        audio.src = url;
      });
      
      URL.revokeObjectURL(url);
    } catch (e) {
      // Just log and continue with duration=0
      console.warn('Error getting duration:', e);
    }
    
    // If we couldn't get duration, throw now before doing any FFmpeg work
    if (!duration || duration <= 0) {
      throw new Error('Could not determine audio duration');
    }
    
    // Step 3: Calculate basic segment points (chunk duration in seconds)
    const chunkSeconds = chunkDurationMinutes * 60;
    const outputFiles = [];
    
    // Generate segments with very simple math
    let position = 0;
    let index = 1;
    
    // Use a simple while loop with a safety counter
    let safetyCounter = 0;
    const maxSegments = 100; // Reasonable limit
    
    while (position < duration && safetyCounter < maxSegments) {
      safetyCounter++; // Prevent infinite loops
      
      // Simple segment calculation
      const segmentDuration = Math.min(chunkSeconds, duration - position);
      
      // Skip if segment would be too short
      if (segmentDuration < 5) {
        break;
      }
      
      // Unique output filename
      const outputFileName = `output_${index}.${outputFormat}`;
      
      // Execute FFmpeg with minimal options
      await ffmpeg.exec([
        '-i', inputFileName,
        '-ss', position.toString(),
        '-t', segmentDuration.toString(),
        '-c:a', getCodecForFormat(outputFormat),
        '-b:a', '128k', // Fixed bitrate for simplicity
        outputFileName
      ]);
      
      // Read the output and create a blob
      const outputData = await ffmpeg.readFile(outputFileName);
      const blob = new Blob([outputData], { type: getMimeType(outputFormat) });
      
      // Format times for filenames (simple format)
      const startTime = formatTime(position);
      const endTime = formatTime(position + segmentDuration);
      
      // Add file to results
      outputFiles.push({
        blob,
        name: `${file.name.split('.')[0]}_part${index}_${startTime}-${endTime}.${outputFormat}`,
        startTime,
        endTime,
        duration: segmentDuration
      });
      
      // Clean up segment file immediately
      await ffmpeg.deleteFile(outputFileName);
      
      // Move to next segment (with overlap)
      position += segmentDuration - overlapSeconds;
      index++;
    }
    
    // Clean up input file
    await ffmpeg.deleteFile(inputFileName);
    
    // Return results if we have any
    if (outputFiles.length === 0) {
      throw new Error('No segments were created');
    }
    
    return outputFiles;
  } catch (error) {
    // Ensure any error is properly converted to a string
    const message = error?.message || 'Unknown error';
    throw new Error('Splitting failed: ' + message);
  }
};

// Simple time formatter (avoid complexity)
function formatTime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${pad(hrs)}.${pad(mins)}.${pad(secs)}`;
}

// Simple zero-padding
function pad(num) {
  return num.toString().padStart(2, '0');
} 