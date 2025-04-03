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