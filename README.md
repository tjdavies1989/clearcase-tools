# ClearCase Tools

A unified web application with multiple tools for medicolegal document processing, transcription, and audio compression.

## Features

The application includes the following tools:

1. **Template Generation** - Create custom document templates for various medicolegal purposes
2. **Audio Compression** - Compress audio files using FFmpeg for more efficient storage and sharing
3. **Transcription** - Transcribe audio files to text using OpenAI's Whisper model
4. **Document Processing** - Process and analyze document contents for key information

## Setup Instructions

### Prerequisites

- Node.js v16+ and npm
- API keys for OpenAI services (for Template Generation, Processing, and Transcription)

### Installation

1. Clone this repository
2. Navigate to the project directory:
   ```
   cd clearcase-tools
   ```
3. Install dependencies:
   ```
   npm install
   ```
4. Update the API key in `src/config.js` with your own OpenAI API key
5. Start the development server:
   ```
   npm start
   ```

## Configuration

All configuration options are stored in `src/config.js`. You need to update:

- `openaiApiKey` - Your OpenAI API key for all services (template generation, transcription, and document processing)

The configuration also includes system prompts for different services and settings for the FFmpeg audio compression.

## HTTPS Requirement

This application runs over HTTPS to ensure compatibility with FFmpeg and browser security policies. The development server is automatically configured to use HTTPS.

## Building for Production

To build the app for production:

```
npm run build
```

This will create optimized files in the `build` folder that you can deploy to your web server.

## Important Notes

- FFmpeg is loaded via WebAssembly in the browser for audio compression. This requires proper CORS headers and HTTPS.
- The app uses OpenAI's API for template generation, transcription, and document processing. Make sure you have a valid API key.
- If you encounter any CORS issues, ensure the server has the appropriate headers set (Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy). 