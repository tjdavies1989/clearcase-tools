import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import SunEditor from 'suneditor-react';
import 'suneditor/dist/css/suneditor.min.css';
import { htmlToMarkdown, markdownToHtml, fileToHtml } from '../../utils/formatConverter';
import { asBlob } from 'html-docx-js-typescript';
import config from '../../config';

const TemplateGenerator = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState('Upload files to generate a pre-filled template');
  const [instructionFile, setInstructionFile] = useState(null);
  const [templateFile, setTemplateFile] = useState(null);
  const [reportContent, setReportContent] = useState('');
  const [error, setError] = useState(null);
  const [isConvertingPdf, setIsConvertingPdf] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [templateContent, setTemplateContent] = useState('');
  const resultRef = useRef(null);
  const editorRef = useRef(null);
  
  // Load template from predefined templates when selected
  useEffect(() => {
    const loadPredefinedTemplate = async () => {
      if (!selectedTemplate) return;
      
      try {
        // Find the selected template in config
        const templateInfo = config.templates.find(t => t.id === selectedTemplate);
        if (!templateInfo) return;
        
        setMessage(`Loading template: ${templateInfo.name}...`);
        
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
        
        setMessage('Template loaded successfully');
      } catch (err) {
        console.error('Template loading error:', err);
        setError(`Failed to load template: ${err.message}`);
        setSelectedTemplate('');
      }
    };
    
    loadPredefinedTemplate();
  }, [selectedTemplate]);
  
  // Handle file selection for each file type
  const handleFileChange = (e, fileType) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    const file = e.target.files[0];
    
    switch(fileType) {
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
  };
  
  // Process files with AI
  const generateTemplate = async () => {
    if (!instructionFile || (!templateFile && !templateContent)) {
      setMessage('Error: Letter of Instruction and Blank Template are required');
      setError('Letter of Instruction and Blank Template are required');
      return;
    }
    
    setIsProcessing(true);
    setMessage('Generating template...');
    setError(null);
    
    try {
      // Process the instruction file based on its type
      let instructionText;
      
      // Check if it's a PDF that needs conversion
      if (instructionFile.type === 'application/pdf' || 
          instructionFile.name.toLowerCase().endsWith('.pdf')) {
        setMessage('Converting PDF to text...');
        setIsConvertingPdf(true);
        
        try {
          // Convert PDF to HTML (without images)
          const instructionHtml = await fileToHtml(instructionFile);
          // Convert HTML to plain text for API consumption
          instructionText = htmlToMarkdown(instructionHtml);
          
          if (!instructionText || instructionText.trim() === '') {
            throw new Error('No text could be extracted from the PDF. The file may be image-based or protected.');
          }
        } catch (conversionError) {
          console.error('PDF conversion error:', conversionError);
          throw new Error(`PDF conversion failed: ${conversionError.message}. Try uploading a text or HTML file instead.`);
        } finally {
          setIsConvertingPdf(false);
        }
      } else if (instructionFile.type === 'text/html' || 
                 instructionFile.name.toLowerCase().endsWith('.html') || 
                 instructionFile.name.toLowerCase().endsWith('.htm')) {
        // Handle HTML files
        try {
          const htmlContent = await fileToHtml(instructionFile);
          instructionText = htmlToMarkdown(htmlContent);
        } catch (htmlError) {
          throw new Error(`Failed to process HTML file: ${htmlError.message}`);
        }
      } else {
        // Handle text and other files
        try {
          instructionText = await readFileAsText(instructionFile);
        } catch (textError) {
          throw new Error(`Failed to read text file: ${textError.message}`);
        }
      }
      
      // Get template text - either from uploaded file or selected predefined template
      let templateText;
      if (templateContent) {
        templateText = templateContent;
      } else {
        try {
          templateText = await readFileAsText(templateFile);
        } catch (templateError) {
          throw new Error(`Failed to read template file: ${templateError.message}`);
        }
      }
      
      setMessage('Processing with AI...');
      
      // Format the messages for the API
      const messages = [
        {
          role: 'system',
          content: config.systemPrompts.templateGeneration + 
            "\n\nALWAYS format your response in proper Markdown WITHOUT USING CODE FENCES. DO NOT wrap your response in markdown blocks. Just return the raw markdown directly."
        },
        {
          role: 'user',
          content: `LETTER OF INSTRUCTION:\n${instructionText}\n\nBLANK TEMPLATE:\n${templateText}\n\nIMPORTANT: Your response MUST be formatted in Markdown. DO NOT use code fences. Return the markdown content directly.`
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
          model: config.modelSettings.templateGeneration.model,
          messages,
          max_tokens: config.modelSettings.templateGeneration.maxTokens,
          temperature: config.modelSettings.templateGeneration.temperature,
          response_format: config.modelSettings.templateGeneration.responseFormat
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to generate template');
      }
      
      const result = await response.json();
      const processedResult = result.choices[0].message.content;
      
      // Clean the result - remove markdown code fences if present
      const cleanedResult = cleanMarkdownCodeFences(processedResult);
      
      // Convert markdown to HTML for the WYSIWYG editor
      const htmlContent = markdownToHtml(cleanedResult);
      
      setReportContent(htmlContent);
      setMessage('Template generated successfully!');
      
      // Scroll to result
      setTimeout(() => {
        if (resultRef.current) {
          resultRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    } catch (err) {
      console.error('Template generation error:', err);
      setError(`Generation failed: ${err.message}`);
      setMessage('Error during generation: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };
  
  // Save report as DOCX
  const saveAsDocx = async () => {
    try {
      // Prepare HTML for DOCX conversion
      const htmlForDocx = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <title>Template Document</title>
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
            ${reportContent}
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
      const filename = `Template_Document_${dateStr}.docx`;

      // Download file
      downloadFile(docxBlob, filename);
      setMessage('Template saved as Word document!');
    } catch (error) {
      console.error('Error saving document:', error);
      setError('Error saving document: ' + error.message);
      setMessage('Error saving document: ' + error.message);
    }
  };
  
  // Save report as HTML
  const saveAsHtml = () => {
    try {
      // Prepare styled HTML document
      const htmlDocument = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <title>Template Document</title>
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
            ${reportContent}
          </body>
        </html>
      `;
      
      // Create blob and download
      const htmlBlob = new Blob([htmlDocument], { type: 'text/html' });
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
      const filename = `Template_Document_${dateStr}.html`;
      
      downloadFile(htmlBlob, filename);
      setMessage('Template saved as HTML document!');
    } catch (error) {
      console.error('Error saving HTML document:', error);
      setError('Error saving document: ' + error.message);
      setMessage('Error saving document: ' + error.message);
    }
  };
  
  // Save report as Text
  const saveAsText = () => {
    try {
      // Convert HTML to markdown
      const markdownContent = htmlToMarkdown(reportContent);
      
      // Create blob and download
      const textBlob = new Blob([markdownContent], { type: 'text/plain' });
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
      const filename = `Template_Document_${dateStr}.txt`;
      
      downloadFile(textBlob, filename);
      setMessage('Template saved as Text document!');
    } catch (error) {
      console.error('Error saving Text document:', error);
      setError('Error saving document: ' + error.message);
      setMessage('Error saving document: ' + error.message);
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
  
  // Clean markdown code fences
  const cleanMarkdownCodeFences = (text) => {
    if (!text) return '';
    
    // Remove ```markdown at the beginning if present
    let cleaned = text.replace(/^```markdown\s*/i, '');
    
    // Remove ``` at the end if present
    cleaned = cleaned.replace(/\s*```\s*$/, '');
    
    return cleaned;
  };
  
  // Utility function to read file as text
  const readFileAsText = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  };

  // Handle SunEditor getting reference
  const handleEditorReady = (sunEditor) => {
    editorRef.current = sunEditor;
  };

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
    <div className="template-generator">
      <Link to="/" className="back-button">← Back to Tools</Link>
      
      <h2>Medicolegal Template Generation</h2>
      <p className="processing-status">{message}</p>
      
      {error && (
        <div className="alert alert-error">{error}</div>
      )}
      
      <div className="file-uploads">
        <div className="file-upload-item">
          <h3>Letter of Instruction</h3>
          <p className="required-label">Required</p>
          <p className="file-format-info">Supports: Text, HTML, PDF</p>
          <label htmlFor="instruction-file-input" className="file-label">
            {instructionFile ? instructionFile.name : 'Select Letter of Instruction'}
            <input 
              id="instruction-file-input"
              type="file" 
              accept=".txt,.md,.markdown,.html,.htm,.pdf" 
              onChange={(e) => handleFileChange(e, 'instruction')}
              style={{ display: 'none' }}
            />
          </label>
        </div>
        
        <div className="file-upload-item">
          <h3>Blank Template</h3>
          <p className="required-label">Required</p>
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
                  accept=".txt,.md,.markdown,.doc,.docx" 
                  onChange={(e) => handleFileChange(e, 'template')}
                  style={{ display: 'none' }}
                  disabled={isProcessing || !!selectedTemplate}
                />
              </label>
            </div>
          </div>
        </div>
      </div>
      
      <button 
        className="button button-primary" 
        onClick={generateTemplate} 
        disabled={isProcessing || !instructionFile || (!templateFile && !templateContent)}
      >
        Generate Template
      </button>
      
      {isProcessing && (
        <div className="processing-indicator">
          <div className="spinner"></div>
          <span>{isConvertingPdf ? 'Converting PDF...' : 'Generating...'}</span>
        </div>
      )}
      
      {reportContent && (
        <div className="result" ref={resultRef}>
          <h3>Template Editor</h3>
          
          <div className="wysiwyg-editor">
            <SunEditor
              setContents={reportContent}
              onChange={(content) => setReportContent(content)}
              setOptions={editorOptions}
              onLoad={handleEditorReady}
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

export default TemplateGenerator; 