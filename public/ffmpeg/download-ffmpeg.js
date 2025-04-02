// This script will download FFmpeg files for local use
(async () => {
  try {
    // Create a div to show download progress
    const progressDiv = document.createElement('div');
    progressDiv.style.position = 'fixed';
    progressDiv.style.top = '0';
    progressDiv.style.left = '0';
    progressDiv.style.width = '100%';
    progressDiv.style.background = '#f8f9fa';
    progressDiv.style.padding = '20px';
    progressDiv.style.zIndex = '9999';
    progressDiv.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
    progressDiv.innerHTML = '<h3>Downloading FFmpeg files...</h3><p>This only happens once. Please wait...</p><div id="download-progress" style="height: 20px; background: #eee; border-radius: 10px; overflow: hidden;"><div id="progress-bar" style="height: 100%; width: 0%; background: #007bff; transition: width 0.3s;"></div></div>';
    document.body.appendChild(progressDiv);

    const updateProgress = (percent) => {
      document.getElementById('progress-bar').style.width = `${percent}%`;
      progressDiv.querySelector('p').textContent = `Downloading FFmpeg files... ${percent}% complete`;
    };

    // List of files to download
    const files = [
      { 
        url: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js',
        dest: 'ffmpeg-core.js' 
      },
      { 
        url: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.wasm',
        dest: 'ffmpeg-core.wasm'
      }
    ];

    // Download each file
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const response = await fetch(file.url);
      
      if (!response.ok) {
        throw new Error(`Failed to download ${file.url}: ${response.statusText}`);
      }
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      // Create a download link
      const a = document.createElement('a');
      a.href = url;
      a.download = file.dest;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      // Update progress
      updateProgress(((i + 1) / files.length) * 100);
    }

    // Completion message
    progressDiv.innerHTML = '<h3>Download Complete!</h3><p>Please follow these steps:</p><ol><li>Move the downloaded files to <code>public/ffmpeg/</code> folder</li><li>Refresh this page</li></ol><button id="close-btn" style="padding: 8px 16px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">Close</button>';
    
    document.getElementById('close-btn').addEventListener('click', () => {
      document.body.removeChild(progressDiv);
    });
    
  } catch (error) {
    console.error('Error downloading FFmpeg:', error);
    alert(`Error downloading FFmpeg: ${error.message}`);
  }
})(); 