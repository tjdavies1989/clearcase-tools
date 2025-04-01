import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import SunEditor from 'suneditor-react';
import 'suneditor/dist/css/suneditor.min.css';
import { htmlToMarkdown, markdownToHtml } from '../../utils/formatConverter';
import { asBlob } from 'html-docx-js-typescript';
import config from '../../config';

const ProcessingTool = () => {
  const [transcriptionFile, setTranscriptionFile] = useState(null);
  const [instructionFile, setInstructionFile] = useState(null);
  const [templateFile, setTemplateFile] = useState(null);
  const [transcriptionContent, setTranscriptionContent] = useState('');
  const [instructionContent, setInstructionContent] = useState('');
  const [templateContent, setTemplateContent] = useState('');
  const [processedResult, setProcessedResult] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const resultRef = useRef(null);
  
  // SunEditor options
  const editorOptions = {
    height: '500px',
    buttonList: [
      ['undo', 'redo'],
      ['font', 'fontSize', 'formatBlock'],
      ['bold', 'underline', 'italic', 'strike', 'subscript', 'superscript'],
      ['removeFormat'],
      '/',
      ['fontColor', 'hiliteColor'],
      ['outdent', 'indent'],
      ['align', 'horizontalRule', 'list', 'table'],
      ['link', 'image'],
      ['fullScreen', 'showBlocks', 'codeView'],
      ['preview', 'print'],
      ['save']
    ],
    defaultStyle: 'font-family: Arial, sans-serif; font-size: 14px;',
    formats: ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote'],
    font: [
      'Arial', 
      'Calibri', 
      'Comic Sans MS', 
      'Courier New', 
      'Garamond', 
      'Georgia', 
      'Tahoma', 
      'Times New Roman', 
      'Trebuchet MS', 
      'Verdana'
    ]
  };
  
  const handleProcessDocument = async () => {
    if (!transcriptionContent) {
      setError('Please upload a transcription file');
      return;
    }
    
    try {
      setError(null);
      setIsProcessing(true);
      
      // Format the messages for the API
      const messages = [
        {
          role: 'system',
          content: config.systemPrompts.medicalDocumentProcessing + 
            "\n\nALWAYS format your response in proper Markdown WITHOUT USING CODE FENCES. DO NOT wrap your response in markdown blocks. Just return the raw markdown directly."
        },
        {
          role: 'user',
          content: `TRANSCRIPTION:\n${transcriptionContent}\n\nLETTER OF INSTRUCTION:\n${instructionContent}\n\n${templateContent ? `TEMPLATE:\n${templateContent}` : ''}\n\nIMPORTANT: Your response MUST be formatted in Markdown. DO NOT use code fences. Return the markdown content directly.`
        }
      ];
      
      // Make the API call
      const response = await fetch(config.apiEndpoints.chatCompletions, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.openaiApiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages,
          max_tokens: 16000,
          temperature: 0,
          response_format: { type: "text" } // Ensures raw text output
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to process document');
      }
      
      const result = await response.json();
      const markdownResult = result.choices[0].message.content;
      
      // Clean the result - remove markdown code fences if present
      const cleanedResult = cleanMarkdownCodeFences(markdownResult);
      
      // Convert to HTML for the editor
      const htmlResult = markdownToHtml(cleanedResult);
      setProcessedResult(htmlResult);
      
      // Scroll to result
      setTimeout(() => {
        if (resultRef.current) {
          resultRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    } catch (err) {
      console.error('Document processing error:', err);
      setError(`Processing failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };
  
  // Clean markdown code fences
  const cleanMarkdownCodeFences = (text) => {
    if (!text) return '';
    
    // Remove ```markdown at the beginning if present
    let cleaned = text.replace(/^```markdown\s*/i, '');
    
    // Remove ``` at the end if present
    cleaned = cleaned.replace(/\s*```\s*$/, '');
    
    return cleaned;
  };
  
  const saveAsDocx = async () => {
    try {
      // Prepare HTML for DOCX conversion
      const htmlForDocx = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <title>Processed Document</title>
            <style>
              body { font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.5; }
              h1 { font-size: 18pt; margin-top: 24pt; margin-bottom: 6pt; }
              h2 { font-size: 16pt; margin-top: 18pt; margin-bottom: 6pt; }
              h3 { font-size: 14pt; margin-top: 14pt; margin-bottom: 4pt; }
              p { margin-bottom: 10pt; }
              table { border-collapse: collapse; width: 100%; margin-bottom: 15pt; }
              th, td { border: 1px solid #ddd; padding: 8pt; }
              th { background-color: #f2f2f2; text-align: left; }
            </style>
          </head>
          <body>
            ${processedResult}
          </body>
        </html>
      `;

      // Convert HTML to DOCX
      const docxBlob = await asBlob(htmlForDocx, {
        orientation: 'portrait',
        margins: {
          top: 1440, // 1 inch
          right: 1440,
          bottom: 1440,
          left: 1440
        }
      });

      // Create filename with date
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
      const filename = `Processed_Document_${dateStr}.docx`;

      // Download file
      downloadFile(docxBlob, filename);
    } catch (error) {
      console.error('Error saving document:', error);
      setError('Error saving document: ' + error.message);
    }
  };
  
  const saveAsHtml = () => {
    try {
      // Prepare styled HTML document
      const htmlDocument = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <title>Processed Document</title>
            <style>
              body { font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.5; max-width: 800px; margin: 0 auto; padding: 20px; }
              h1 { font-size: 18pt; margin-top: 24pt; margin-bottom: 6pt; }
              h2 { font-size: 16pt; margin-top: 18pt; margin-bottom: 6pt; }
              h3 { font-size: 14pt; margin-top: 14pt; margin-bottom: 4pt; }
              p { margin-bottom: 10pt; }
              table { border-collapse: collapse; width: 100%; margin-bottom: 15pt; }
              th, td { border: 1px solid #ddd; padding: 8pt; }
              th { background-color: #f2f2f2; text-align: left; }
            </style>
          </head>
          <body>
            ${processedResult}
          </body>
        </html>
      `;
      
      // Create blob and download
      const htmlBlob = new Blob([htmlDocument], { type: 'text/html' });
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
      const filename = `Processed_Document_${dateStr}.html`;
      
      downloadFile(htmlBlob, filename);
    } catch (error) {
      console.error('Error saving HTML document:', error);
      setError('Error saving document: ' + error.message);
    }
  };
  
  const saveAsText = () => {
    try {
      // Convert HTML to markdown
      const markdownContent = htmlToMarkdown(processedResult);
      
      // Create blob and download
      const textBlob = new Blob([markdownContent], { type: 'text/plain' });
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
      const filename = `Processed_Document_${dateStr}.txt`;
      
      downloadFile(textBlob, filename);
    } catch (error) {
      console.error('Error saving Text document:', error);
      setError('Error saving document: ' + error.message);
    }
  };
  
  // Helper function for downloading files
  const downloadFile = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  const handleFileUpload = (e, fileType) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Update file state
    switch(fileType) {
      case 'transcription':
        setTranscriptionFile(file);
        break;
      case 'instruction':
        setInstructionFile(file);
        break;
      case 'template':
        setTemplateFile(file);
        break;
      default:
        break;
    }
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target.result;
      
      // Set the content based on file type
      switch(fileType) {
        case 'transcription':
          setTranscriptionContent(content);
          break;
        case 'instruction':
          setInstructionContent(content);
          break;
        case 'template':
          setTemplateContent(content);
          break;
        default:
          break;
      }
    };
    reader.onerror = () => {
      setError('Failed to read the file');
    };
    
    if (file.type === 'text/plain' || file.type === 'text/markdown' || file.name.endsWith('.md') || file.name.endsWith('.txt')) {
      reader.readAsText(file);
    } else {
      setError('Please upload a plain text or markdown file');
    }
  };
  
  return (
    <div className="processing-tool">
      <Link to="/" className="back-button">← Back to Tools</Link>
      
      <h2>Medicolegal Document Processing</h2>
      
      {error && (
        <div className="alert alert-error">{error}</div>
      )}
      
      <div className="file-uploads">
        <div className="file-upload-item">
          <h3>Transcription</h3>
          <p className="required-label">Required</p>
          <label htmlFor="transcription-file-input" className="file-label">
            {transcriptionFile ? transcriptionFile.name : 'Select Transcription File'}
            <input 
              id="transcription-file-input"
              type="file" 
              accept=".txt,.md,text/plain,text/markdown" 
              onChange={(e) => handleFileUpload(e, 'transcription')}
              style={{ display: 'none' }}
              disabled={isProcessing}
            />
          </label>
        </div>
        
        <div className="file-upload-item">
          <h3>Letter of Instruction</h3>
          <p className="required-label">Required</p>
          <label htmlFor="instruction-file-input" className="file-label">
            {instructionFile ? instructionFile.name : 'Select Letter of Instruction'}
            <input 
              id="instruction-file-input"
              type="file" 
              accept=".txt,.md,text/plain,text/markdown" 
              onChange={(e) => handleFileUpload(e, 'instruction')}
              style={{ display: 'none' }}
              disabled={isProcessing}
            />
          </label>
        </div>
        
        <div className="file-upload-item">
          <h3>Template</h3>
          <p className="optional-label">Optional</p>
          <label htmlFor="template-file-input" className="file-label">
            {templateFile ? templateFile.name : 'Select Template File'}
            <input 
              id="template-file-input"
              type="file" 
              accept=".txt,.md,text/plain,text/markdown" 
              onChange={(e) => handleFileUpload(e, 'template')}
              style={{ display: 'none' }}
              disabled={isProcessing}
            />
          </label>
        </div>
      </div>
      
      <button
        onClick={handleProcessDocument}
        className="button button-primary"
        disabled={isProcessing || !transcriptionContent}
      >
        {isProcessing ? 'Processing...' : 'Process Document'}
      </button>
      
      {isProcessing && (
        <div className="processing-indicator">
          <div className="spinner"></div>
          <p>Processing your document...</p>
        </div>
      )}
      
      {processedResult && (
        <div className="result" ref={resultRef}>
          <h3>Processing Result</h3>
          
          <div className="wysiwyg-editor">
            <SunEditor
              setContents={processedResult}
              onChange={(content) => setProcessedResult(content)}
              setOptions={editorOptions}
            />
          </div>
          
          <div className="action-buttons">
            <button 
              className="button" 
              onClick={saveAsDocx}
            >
              Save as Word
            </button>
            <button 
              className="button" 
              onClick={saveAsHtml}
            >
              Save as HTML
            </button>
            <button 
              className="button button-success" 
              onClick={saveAsText}
            >
              Save as Text
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProcessingTool; 