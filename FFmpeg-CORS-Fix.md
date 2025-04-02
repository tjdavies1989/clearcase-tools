# FFmpeg CORS Issues and Solutions

## The Problem

The audio compression tool uses FFmpeg via WebAssembly, which requires special security headers due to browser security restrictions. Modern browsers implement Cross-Origin Resource Sharing (CORS) policies that prevent WebAssembly modules from loading unless specific conditions are met.

Error message you might see:
```
Failed to load audio processing library. This appears to be a browser security restriction.
```

## Solutions

### For Development Testing

1. **Use the PowerShell script**
   
   We've included a PowerShell script that launches Chrome with security disabled for testing:
   
   ```powershell
   .\run-dev-chrome.ps1
   ```
   
   This will launch Chrome with the necessary flags to bypass CORS restrictions.
   
   ⚠️ **WARNING**: Only use this for development! Don't use this Chrome instance for regular browsing.

2. **Use HTTPS for development**
   
   The React development server supports HTTPS. Start your app with:
   
   ```
   npm start
   ```
   
   This uses the settings in package.json which already sets HTTPS=true.

### For Production Deployment

1. **Set proper HTTP headers on your server**
   
   Your server needs to send these headers with every response:
   
   ```
   Cross-Origin-Embedder-Policy: require-corp
   Cross-Origin-Opener-Policy: same-origin
   ```
   
   These are already set in the Express server in server.js.

2. **Use the Express server we've provided**
   
   Build and serve your app with:
   
   ```
   npm run build
   npm run serve
   ```
   
   The included Express server sets all required headers.

3. **HTTPS is strongly recommended**
   
   Browsers are more restrictive with CORS in HTTP contexts. Use HTTPS in production.

## Technical Details

### Why This Happens

WebAssembly requires these security policies for shared memory operations:

1. **Cross-Origin-Embedder-Policy (COEP)**: Controls whether a document can load resources from other origins.
2. **Cross-Origin-Opener-Policy (COOP)**: Controls how a document interacts with its opener.

### Testing If Headers Are Working

Visit `chrome://net-internals/#headers` and enter your site URL to check if headers are being set correctly.

You can also use browser developer tools (Network tab) to check response headers.

## Browser Compatibility

- **Chrome/Edge**: Best compatibility with WebAssembly and FFmpeg
- **Firefox**: May work with proper headers
- **Safari**: Limited support for some WebAssembly features
- **Mobile browsers**: Limited support

## Additional Resources

- [MDN: Cross-Origin Resource Sharing](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [Web.dev: Making your website "cross-origin isolated"](https://web.dev/articles/coop-coep)
- [FFmpeg WebAssembly documentation](https://github.com/ffmpegwasm/ffmpeg.wasm) 