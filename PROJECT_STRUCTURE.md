# Project Structure: ClearCase Tools

This document outlines the structure and functionality of the "ClearCase Tools" web application.

## 1. Overall Architecture

The project is a **React single-page application (SPA)** for the frontend (user interface) and uses a minimal **Node.js/Express** server for the backend.

*   **Frontend:** Built with React, using `create-react-app` conventions. It handles the user interface, interactions, and integrates various tools like FFmpeg for audio processing (run directly in the browser using WebAssembly) and communicates with OpenAI APIs for AI-powered features.
*   **Backend:** A simple Express server (`server.js`) primarily responsible for:
    *   Serving the built React application's static files (HTML, CSS, JavaScript) located in the `build/` directory.
    *   Setting necessary HTTP security headers (`Cross-Origin-Opener-Policy`, `Cross-Origin-Embedder-Policy`) required for the browser-based FFmpeg to function correctly.
    *   Attempting to use HTTPS if SSL certificates (`key.pem`, `cert.pem`) are found in the root directory, which is also important for FFmpeg compatibility.

## 2. Core Functionality (Features)

Based on the `README.md` and component structure, the application offers several tools for medicolegal document and audio processing:

1.  **Template Generation:** Creates custom document templates, likely using OpenAI's API based on user input or predefined structures found in `public/templates/`.
2.  **Audio Compression:** Compresses audio files directly in the user's browser using an FFmpeg library compiled to WebAssembly (likely located in `public/ffmpeg/`).
3.  **Transcription:** Transcribes audio files into text, utilising OpenAI's Whisper model via its API.
4.  **Document Processing:** Processes and analyzes document content, potentially extracting key information or summarising, likely using OpenAI's API.

## 3. Directory and File Breakdown

Here's a description of the key files and directories:

*   **`/` (Root Directory):**
    *   `.git/`: Contains Git version control data (hidden by default).
    *   `.gitignore`: Lists files and directories intentionally excluded from Git tracking (e.g., `node_modules`, `build/`).
    *   `build/`: *Generated directory.* Contains the optimized, static files (HTML, CSS, JS) of the production-ready React application. Created by running `npm run build`. This is the directory served by `server.js`.
    *   `changelog.md`: A log documenting changes made to the project over time.
    *   `clearcase-tools/`: Contains a nested `public/` directory with `templates/` and `ffmpeg/`. Its exact purpose isn't perfectly clear from the structure alone, it might be related to deployment packaging or an older project structure.
    *   `e-tools`: A small file with unclear content (`* [32mmaster [m`), possibly a leftover artifact from a terminal command or git operation. Not part of the core application.
    *   `FFmpeg-CORS-Fix.md`: Documentation explaining Cross-Origin Resource Sharing (CORS) headers needed for FFmpeg's browser execution.
    *   `node_modules/`: *Generated directory.* Stores all external JavaScript libraries (dependencies) required by the project, as defined in `package.json`. Managed by `npm`.
    *   `package-lock.json`: Records the exact versions of all installed dependencies, ensuring consistent builds. Managed by `npm`.
    *   `package.json`: The project's manifest file. Contains metadata (name, version), lists dependencies (`dependencies`, `devDependencies`), and defines scripts (`"start"`, `"build"`, `"serve"`, `"test"`) used to run, build, and manage the application.
    *   `public/`: Contains static assets. Files here are either served directly or copied into the `build/` directory during the build process.
        *   `ffmpeg/`: Likely holds the FFmpeg WebAssembly files (`.wasm`, `.js`) needed for browser-side audio compression.
        *   `index.html`: The main HTML page template. The React application gets injected into this page.
        *   `templates/`: Contains text files (`.txt`) used as base templates for the Template Generation feature.
        *   `ClearCase Logo.jpg`: Image file, presumably the application's logo.
    *   `README.md`: Provides a high-level overview, setup instructions, configuration details, and usage notes for the project.
    *   `run-dev-chrome.ps1`: A PowerShell script potentially used by developers to easily start the development environment in Google Chrome with specific flags or settings.
    *   `server.js`: The simple Node.js/Express backend server script. It serves the `build` directory and sets crucial HTTP headers.
    *   `src/`: Contains the source code for the React frontend application.
        *   `App.css`: CSS styles specific to the main `App` component.
        *   `App.js`: The root component of the React application. It sets up routing (using `react-router-dom`) to navigate between different tools/pages.
        *   `components/`: Contains reusable UI pieces (React components).
            *   `LandingPage.js`: The component for the application's main entry page.
            *   `compression/`, `processing/`, `template-generation/`, `transcription/`: Directories containing components specific to each core feature.
        *   `config.js`: Holds application configuration, notably the required OpenAI API key and system prompts for AI interactions. **Requires manual editing** with a valid API key as per the `README.md`.
        *   `index.css`: Global CSS styles applied across the entire application.
        *   `index.js`: The entry point for the React application. It renders the `App` component into the `index.html` page's root element.
        *   `reportWebVitals.js`: A utility for measuring web performance metrics (standard part of `create-react-app`).
        *   `setupProxy.js`: Configuration for the development server's proxy (standard part of `create-react-app`), potentially used to redirect API calls during development, although this app's backend is very simple.
        *   `utils/`: Contains shared helper functions.
            *   `formatConverter.js`: Likely includes functions for converting between different text or document formats needed by the tools.

## 4. Workflow and File Relationships

1.  **Development:** Running `npm start` uses `react-scripts` to start a development server. This server compiles the code in `src/` on-the-fly, serves it (often with hot-reloading), and uses `public/index.html` as the base. `src/index.js` injects `src/App.js` into the page. `App.js` handles routing to display components from `src/components/`. Components use configuration from `src/config.js` and utilities from `src/utils/`. The script also sets specific environment variables (`REACT_APP_COOP`, `REACT_APP_COEP`) used to configure security headers needed by FFmpeg.
2.  **Building:** Running `npm run build` uses `react-scripts` to create an optimized, static version of the frontend in the `build/` directory. It bundles JavaScript, CSS, and includes assets from `public/`.
3.  **Serving (Production-like):** Running `npm run serve` executes `node server.js`. This starts the Express server, which serves the static files located within the `build/` directory and ensures the correct HTTP headers are sent for FFmpeg functionality.

This structure separates the frontend logic (`src/`) from static assets (`public/`), configuration (`src/config.js`), build output (`build/`), and the simple serving mechanism (`server.js`). 