import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import config from '../../config';

// This function will load FFmpeg with proper CORS settings
export const loadFFmpeg = async () => {
  const ffmpeg = new FFmpeg();

  // Log loading status
  ffmpeg.on('log', ({ message }) => {
    console.log(`FFmpeg: ${message}`);
  });

  // Load FFmpeg securely by using proper CORS headers and HTTPS
  try {
    // Use toBlobURL to ensure proper handling of Cross-Origin issues
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/';
    const coreURL = await toBlobURL(
      `${baseURL}ffmpeg-core.js`,
      'application/javascript'
    );
    const wasmURL = await toBlobURL(
      `${baseURL}ffmpeg-core.wasm`,
      'application/wasm'
    );

    await ffmpeg.load({
      coreURL,
      wasmURL
    });

    return ffmpeg;
  } catch (error) {
    console.error('Error loading FFmpeg:', error);
    throw new Error(`Failed to load FFmpeg: ${error.message}`);
  }
};

// Helper function to compress audio using FFmpeg
export const compressAudio = async (ffmpeg, inputFile, outputFormat, bitrate) => {
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
    
    switch (outputFormat) {
      case 'mp3':
        command = [
          '-i', inputFileName,
          '-b:a', bitrate,
          '-codec:a', 'libmp3lame',
          outputFileName
        ];
        break;
      case 'aac':
        command = [
          '-i', inputFileName,
          '-b:a', bitrate,
          '-codec:a', 'aac',
          outputFileName
        ];
        break;
      case 'opus':
        command = [
          '-i', inputFileName,
          '-b:a', bitrate,
          '-codec:a', 'libopus',
          outputFileName
        ];
        break;
      case 'wav':
        command = [
          '-i', inputFileName,
          outputFileName
        ];
        break;
      default:
        throw new Error(`Unsupported format: ${outputFormat}`);
    }
    
    // Execute FFmpeg command
    await ffmpeg.exec(command);
    
    // Read the output file
    const outputData = await ffmpeg.readFile(outputFileName);
    
    // Create a Blob from the compressed data
    const blob = new Blob([outputData], { 
      type: `audio/${outputFormat === 'mp3' ? 'mpeg' : outputFormat}` 
    });
    
    // Clean up by removing temporary files
    await ffmpeg.deleteFile(inputFileName);
    await ffmpeg.deleteFile(outputFileName);
    
    return blob;
  } catch (error) {
    console.error('Error compressing audio:', error);
    throw new Error(`Compression failed: ${error.message}`);
  }
};

export default {
  loadFFmpeg,
  compressAudio
}; 