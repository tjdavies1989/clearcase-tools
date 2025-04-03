import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import SunEditor from 'suneditor-react';
import 'suneditor/dist/css/suneditor.min.css';
import { htmlToMarkdown, markdownToHtml, fileToHtml } from '../../utils/formatConverter';
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
  const [isConvertingPdf, setIsConvertingPdf] = useState(false);
  const [error, setError] = useState(null);
  const resultRef = useRef(null);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  
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
          model: config.modelSettings.documentProcessing.model,
          messages,
          max_tokens: config.modelSettings.documentProcessing.maxTokens,
          temperature: config.modelSettings.documentProcessing.temperature,
          response_format: config.modelSettings.documentProcessing.responseFormat
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
  
  const handleFileUpload = async (e, fileType) => {
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
        // Clear dropdown selection when file is uploaded
        setSelectedTemplate('');
        setTemplateContent('');
        break;
      default:
        break;
    }
    
    setError(null);
    
    try {
      if (fileType === 'instruction' && 
          (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))) {
        // Handle PDF conversion for instruction file
        setIsConvertingPdf(true);
        
        try {
          // Convert PDF to HTML (without images)
          const instructionHtml = await fileToHtml(file);
          // Convert HTML to plain text for API consumption
          const instructionText = htmlToMarkdown(instructionHtml);
          
          if (!instructionText || instructionText.trim() === '') {
            throw new Error('No text could be extracted from the PDF. The file may be image-based or protected.');
          }
          
          setInstructionContent(instructionText);
        } catch (conversionError) {
          console.error('PDF conversion error:', conversionError);
          throw new Error(`PDF conversion failed: ${conversionError.message}. Try uploading a text or HTML file instead.`);
        } finally {
          setIsConvertingPdf(false);
        }
      } else if ((fileType === 'instruction' || fileType === 'template') && 
                (file.type === 'text/html' || 
                 file.name.toLowerCase().endsWith('.html') || 
                 file.name.toLowerCase().endsWith('.htm'))) {
        // Handle HTML files
        try {
          const htmlContent = await fileToHtml(file);
          const markdownText = htmlToMarkdown(htmlContent);
          
          if (fileType === 'instruction') {
            setInstructionContent(markdownText);
          } else {
            setTemplateContent(markdownText);
          }
        } catch (htmlError) {
          throw new Error(`Failed to process HTML file: ${htmlError.message}`);
        }
      } else if (file.type === 'text/plain' || 
                file.type === 'text/markdown' || 
                file.name.endsWith('.md') || 
                file.name.endsWith('.txt')) {
        // Handle text files with standard method
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
        
        reader.readAsText(file);
      } else {
        if (fileType === 'instruction') {
          throw new Error('Please upload a text, HTML, PDF, or markdown file for Letter of Instruction');
        } else if (fileType === 'template') {
          throw new Error('Please upload a text, HTML, or markdown file for Template');
        } else {
          throw new Error('Please upload a text or markdown file for Transcription');
        }
      }
    } catch (err) {
      console.error('File upload error:', err);
      setError(err.message);
      
      // Reset the file state on error
      switch(fileType) {
        case 'transcription':
          setTranscriptionFile(null);
          break;
        case 'instruction':
          setInstructionFile(null);
          break;
        case 'template':
          setTemplateFile(null);
          break;
        default:
          break;
      }
    }
  };
  
  // Load template from predefined templates when selected
  useEffect(() => {
    const loadPredefinedTemplate = async () => {
      if (!selectedTemplate) return;
      
      try {
        // Find the selected template in config
        const templateInfo = config.templates.find(t => t.id === selectedTemplate);
        if (!templateInfo) return;
        
        // Fetch the template file
        const response = await fetch(templateInfo.path);
        if (!response.ok) {
          throw new Error(`Failed to load template: ${response.statusText}`);
        }
        
        const content = await response.text();
        setTemplateContent(content);
        setTemplateFile({
          name: `${templateInfo.name} (Predefined)`,
          type: 'text/plain',
          isPreDefined: true
        });
      } catch (err) {
        console.error('Template loading error:', err);
        setError(`Failed to load template: ${err.message}`);
        setSelectedTemplate('');
      }
    };
    
    loadPredefinedTemplate();
  }, [selectedTemplate]);
  
  // Handle template selection change 
  const handleTemplateSelect = (e) => {
    const templateId = e.target.value;
    setSelectedTemplate(templateId);
    
    // Clear uploaded file if a template is selected from dropdown
    if (templateId) {
      setTemplateFile(null);
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
          <p className="file-format-info">Supports: Text, Markdown</p>
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
          <p className="file-format-info">Supports: Text, HTML, PDF, Markdown</p>
          <p className="file-format-warning">Note: PDFs are converted to text only. Image-based or protected PDFs may not convert properly.</p>
          <label htmlFor="instruction-file-input" className="file-label">
            {instructionFile ? instructionFile.name : 'Select Letter of Instruction'}
            <input 
              id="instruction-file-input"
              type="file" 
              accept=".txt,.md,.pdf,.html,.htm,text/plain,text/markdown,application/pdf,text/html" 
              onChange={(e) => handleFileUpload(e, 'instruction')}
              style={{ display: 'none' }}
              disabled={isProcessing}
            />
          </label>
        </div>
        
        <div className="file-upload-item">
          <h3>Template</h3>
          <p className="optional-label">Optional</p>
          <p className="file-format-info">Supports: Text, HTML, Markdown</p>
          <div className="template-selection">
            <div className="template-dropdown">
              <label htmlFor="template-select" className="form-label">Select a predefined template:</label>
              <select 
                id="template-select"
                className="form-control"
                value={selectedTemplate}
                onChange={handleTemplateSelect}
                disabled={isProcessing || templateFile && !templateFile.isPreDefined}
              >
                <option value="">-- Select a template --</option>
                {config.templates.map(template => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="template-upload">
              <p className="divider-text">- OR -</p>
              <label htmlFor="template-file-input" className="file-label">
                {templateFile && !templateFile.isPreDefined ? templateFile.name : 'Upload custom template'}
                <input 
                  id="template-file-input"
                  type="file" 
                  accept=".txt,.md,.html,.htm,text/plain,text/markdown,text/html" 
                  onChange={(e) => handleFileUpload(e, 'template')}
                  style={{ display: 'none' }}
                  disabled={isProcessing || !!selectedTemplate}
                />
              </label>
            </div>
          </div>
        </div>
      </div>
      
      <button
        onClick={handleProcessDocument}
        className="button button-primary"
        disabled={isProcessing || !transcriptionContent}
      >
        {isProcessing ? 'Processing...' : 'Process Document'}
      </button>
      
      {(isProcessing || isConvertingPdf) && (
        <div className="processing-indicator">
          <div className="spinner"></div>
          <p>{isConvertingPdf ? 'Converting PDF...' : 'Processing your document...'}</p>
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