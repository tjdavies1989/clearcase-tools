const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

// Set security headers for all responses
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
});

// Serve static files from the React app build directory
app.use(express.static(path.join(__dirname, 'build')));

// Handle all other requests by returning the React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// Check if we have SSL certificates for HTTPS
const sslOptions = {
  key: fs.existsSync('./key.pem') ? fs.readFileSync('./key.pem') : null,
  cert: fs.existsSync('./cert.pem') ? fs.readFileSync('./cert.pem') : null
};

// Start server with HTTPS if certificates exist, otherwise use HTTP
if (sslOptions.key && sslOptions.cert) {
  // Create HTTPS server
  https.createServer(sslOptions, app).listen(PORT, () => {
    console.log(`HTTPS Server running on port ${PORT}`);
  });
} else {
  // Create HTTP server (less secure, FFmpeg may not work correctly)
  console.warn('WARNING: SSL certificates not found. Running in HTTP mode which may cause FFmpeg to fail.');
  console.warn('For FFmpeg to work properly, generate SSL certificates and use HTTPS.');
  app.listen(PORT, () => {
    console.log(`HTTP Server running on port ${PORT} (FFmpeg may not work correctly)`);
  });
} 