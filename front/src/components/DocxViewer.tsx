import React, { useEffect, useState } from "react";
import mammoth from "mammoth";

export default function DocxViewer({ filePath }: { filePath: string }) {
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadFile = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Read file as base64 string
        const { content } = await window.easyFormContext.readFile(filePath);
        
        // Convert base64 string to ArrayBuffer for mammoth
        const binaryString = atob(content);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const arrayBuffer = bytes.buffer;
        
        const result = await mammoth.convertToHtml({
          arrayBuffer: arrayBuffer
        });
        
        setHtml(result.value);
      } catch (err) {
        console.error('Error loading DOCX file:', err);
        setError('Failed to load document');
      } finally {
        setLoading(false);
      }
    };
    
    loadFile();
  }, [filePath]); // Added filePath to dependency array

  if (loading) {
    return <div className="text-black dark:text-white">Loading document...</div>;
  }

  if (error) {
    return <div className="text-red-500">Error: {error}</div>;
  }

  return (
    <div style={{ height: '75vh', overflow: 'auto', border: '1px solid #ccc', padding: '1rem', backgroundColor: 'white', color: 'black' }}>
      {html
        ? <div dangerouslySetInnerHTML={{ __html: html }} />
        : <div className="text-gray-500">No Content to Preview</div>
      }
    </div>
  );
}
