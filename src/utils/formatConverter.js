/**
 * Utilities for converting between Markdown and HTML formats
 */
import Turndown from 'turndown';
import showdown from 'showdown';

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