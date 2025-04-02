import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import config from '../../config';

// This function will load FFmpeg with proper CORS settings
export const loadFFmpeg = async () => {
  const ffmpeg = new FFmpeg();

  // Log loading status
  ffmpeg.on('log', ({ message }) => {
    console.log(`FFmpeg: ${message}`);
  });

  // Try multiple versions and sources to load FFmpeg
  const sources = [
    // First try loading from local files
    {
      name: 'Local files',
      coreURL: `${window.location.origin}/ffmpeg/ffmpeg-core.js`,
      wasmURL: `${window.location.origin}/ffmpeg/ffmpeg-core.wasm`
    },
    // Try version 0.10.1 which is more widely compatible
    {
      name: 'unpkg CDN v0.10.1',
      coreURL: 'https://unpkg.com/@ffmpeg/core@0.10.1/dist/ffmpeg-core.js',
      wasmURL: 'https://unpkg.com/@ffmpeg/core@0.10.1/dist/ffmpeg-core.wasm'
    },
    // Try version 0.11.0
    {
      name: 'unpkg CDN v0.11.0',
      coreURL: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js',
      wasmURL: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.wasm'
    },
    // Try jsdelivr as an alternative CDN
    {
      name: 'jsdelivr CDN v0.10.1',
      coreURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.10.1/dist/ffmpeg-core.js',
      wasmURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.10.1/dist/ffmpeg-core.wasm'
    }
  ];

  let lastError = null;

  // Try each source
  for (const source of sources) {
    try {
      console.log(`Attempting to load FFmpeg from ${source.name}`);
      
      // Try the simple load approach first
      try {
        await ffmpeg.load({
          coreURL: source.coreURL,
          wasmURL: source.wasmURL
        });
        
        console.log(`FFmpeg loaded successfully from ${source.name}`);
        return ffmpeg;
      } catch (simpleLoadError) {
        console.warn(`Simple load from ${source.name} failed:`, simpleLoadError);
        
        // Try with corePath instead (for older versions)
        if (source.name.includes('0.10.1')) {
          try {
            await ffmpeg.load({
              corePath: source.coreURL.substring(0, source.coreURL.lastIndexOf('/') + 1)
            });
            
            console.log(`FFmpeg loaded successfully from ${source.name} using corePath`);
            return ffmpeg;
          } catch (corePathError) {
            console.warn(`corePath load from ${source.name} failed:`, corePathError);
          }
        }
        
        // Continue to next approach
        throw simpleLoadError;
      }
    } catch (error) {
      console.warn(`Failed to load FFmpeg from ${source.name}:`, error);
      lastError = error;
      
      // If local loading failed and we have a download page, suggest using it
      if (source.name === 'Local files') {
        const localFilesExist = await checkIfLocalFilesExist();
        if (!localFilesExist) {
          // If we have a ffmpeg downloader page, show message about it
          const downloaderExists = await checkIfResourceExists('/ffmpeg/index.html');
          if (downloaderExists) {
            console.warn('Local FFmpeg files not found. Please download them using the downloader page.');
            const error = new Error('Local FFmpeg files not found. Please download them from /ffmpeg/index.html');
            error.isLocalFilesError = true;
            error.downloaderUrl = `${window.location.origin}/ffmpeg/index.html`;
            throw error;
          }
        }
      }
    }
  }
  
  // If we get here, all loading attempts failed
  console.error('All FFmpeg loading approaches failed:', lastError);
  throw new Error(`Failed to load FFmpeg: ${lastError?.message || 'Unknown error'}`);
};

// Helper function to check if local FFmpeg files exist
const checkIfLocalFilesExist = async () => {
  try {
    const response = await fetch(`${window.location.origin}/ffmpeg/ffmpeg-core.js`, { method: 'HEAD' });
    return response.ok;
  } catch (error) {
    return false;
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

export default {
  loadFFmpeg,
  compressAudio
}; 