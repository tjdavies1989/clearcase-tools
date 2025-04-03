/**
 * Utilities for converting between Markdown and HTML formats
 */
import Turndown from 'turndown';
import showdown from 'showdown';
import * as pdfjs from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.entry';

// Set worker path for PDF.js - using local worker file instead of CDN
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// Configure showdown converter (Markdown to HTML)
const showdownConverter = new showdown.Converter({
  tables: true,
  tasklists: true,
  strikethrough: true,
  simplifiedAutoLink: true,
  parseImgDimensions: true,
  simpleLineBreaks: true,
  openLinksInNewWindow: true,
  emoji: true
});

// Make sure it converts headers properly
showdownConverter.setOption('prefixHeaderId', 'heading-');
showdownConverter.setOption('ghCompatibleHeaderId', true);

// Configure turndown converter (HTML to Markdown)
const turndownService = new Turndown({
  headingStyle: 'atx',
  hr: '---',
  bulletListMarker: '*',
  codeBlockStyle: 'fenced',
  emDelimiter: '*'
});

// Improve bullet list handling
turndownService.addRule('listItems', {
  filter: 'li',
  replacement: function(content, node, options) {
    content = content.replace(/^\s+/, '').replace(/\s+$/, '');
    const prefix = options.bulletListMarker + ' ';
    const indent = ' '.repeat(prefix.length);
    
    return prefix + content.replace(/\n/gm, '\n' + indent);
  }
});

// Preserve tables better
turndownService.addRule('tableCell', {
  filter: ['th', 'td'],
  replacement: function(content, node) {
    return ' ' + content + ' |';
  }
});

/**
 * Convert Markdown text to HTML
 * @param {string} markdown - Markdown text
 * @returns {string} HTML content
 */
export function markdownToHtml(markdown) {
  if (!markdown) return '';
  
  try {
    // Create proper paragraph breaks
    const processedMarkdown = markdown
      .replace(/\n\s*\n/g, '\n\n')  // Normalize paragraph breaks
      .trim();
      
    return showdownConverter.makeHtml(processedMarkdown);
  } catch (error) {
    console.error('Error converting Markdown to HTML:', error);
    return '<p>Error converting content</p>';
  }
}

/**
 * Convert HTML to Markdown
 * @param {string} html - HTML content
 * @returns {string} Markdown text
 */
export function htmlToMarkdown(html) {
  if (!html) return '';
  
  try {
    return turndownService.turndown(html);
  } catch (error) {
    console.error('Error converting HTML to Markdown:', error);
    return 'Error converting content';
  }
}

/**
 * Extract text from a PDF file
 * @param {File} file - PDF file
 * @returns {Promise<string>} - HTML content without images
 */
export async function pdfToHtml(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    
    let htmlContent = '<div class="pdf-content">';
    
    // Extract text from each page
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      htmlContent += `<div class="pdf-page">`;
      
      // Process each text item
      let lastY = null;
      textContent.items.forEach((item) => {
        // If y position changes significantly, add a paragraph break
        if (lastY !== null && Math.abs(lastY - item.transform[5]) > 5) {
          htmlContent += '<br>';
        }
        
        // Add the text content
        htmlContent += `<span>${escapeHtml(item.str)}</span>`;
        
        lastY = item.transform[5];
      });
      
      htmlContent += '</div>';
      
      // Add page break if not the last page
      if (i < pdf.numPages) {
        htmlContent += '<hr class="page-break">';
      }
    }
    
    htmlContent += '</div>';
    return htmlContent;
  } catch (error) {
    console.error('Error converting PDF to HTML:', error);
    throw new Error('Failed to convert PDF to HTML: ' + error.message);
  }
}

/**
 * Detect file type and convert to HTML if needed
 * @param {File} file - The uploaded file
 * @returns {Promise<string>} - HTML content
 */
export async function fileToHtml(file) {
  const fileType = file.type || '';
  const fileName = file.name || '';
  
  try {
    // PDF files
    if (fileType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) {
      return await pdfToHtml(file);
    }
    
    // Text files - read as text and convert to HTML if plain text
    if (fileType === 'text/plain' || fileName.toLowerCase().endsWith('.txt')) {
      const text = await readFileAsText(file);
      return `<div class="text-content">${text.split('\n').map(line => 
        `<p>${escapeHtml(line)}</p>`).join('')}</div>`;
    }
    
    // Markdown files
    if (fileType === 'text/markdown' || 
        fileName.toLowerCase().endsWith('.md') || 
        fileName.toLowerCase().endsWith('.markdown')) {
      const text = await readFileAsText(file);
      return markdownToHtml(text);
    }
    
    // HTML files - just read the content directly
    if (fileType === 'text/html' || fileName.toLowerCase().endsWith('.html') || fileName.toLowerCase().endsWith('.htm')) {
      return await readFileAsText(file);
    }
    
    // Default - try to read as text
    const text = await readFileAsText(file);
    return `<div class="unknown-content">${text.split('\n').map(line => 
      `<p>${escapeHtml(line)}</p>`).join('')}</div>`;
  } catch (error) {
    console.error('Error converting file to HTML:', error);
    throw new Error('File conversion failed: ' + error.message);
  }
}

/**
 * Read file as text
 * @param {File} file - File to read
 * @returns {Promise<string>} - File contents as text
 */
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

/**
 * Escape HTML special characters
 * @param {string} unsafe - Unsafe HTML string
 * @returns {string} - Escaped HTML string
 */
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
} 