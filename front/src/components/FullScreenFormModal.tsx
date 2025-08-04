import React, { useEffect, useRef, useState } from "react";
import PdfViewer from "./PdfViewer";
import PdfView4Capture from "./PdfView4Capture";
import DocxViewer from "./DocxViewer";
import html2canvas from "html2canvas-pro";

interface Point { x: number; y: number; }

interface FullScreenFormModalProps {
  formPath: string;
  onClose: () => void;
  // Callback to attach an image to current chat (if any)
  onImageCaptured?: (file: File) => void;
}

/**
 * Presents the given form file (PDF or DOCX) in a full-viewport overlay similar
 * to the ChatImage modal. Clicking outside the viewer or the ❌ button closes
 * the overlay.
 */
const FullScreenFormModal: React.FC<FullScreenFormModalProps> = ({ formPath, onClose, onImageCaptured }) => {
  const isPdf = formPath.toLowerCase().endsWith(".pdf");

  // Selection state
  const [isSelecting, setIsSelecting] = useState(false);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [currentPoint, setCurrentPoint] = useState<Point | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Handle Option key for selection mode (for DOCX files only)
  useEffect(() => {
    if (isPdf) return; // Don't add key listeners for PDF files
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey) {
        setIsSelecting(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (!e.altKey) {
        setIsSelecting(false);
        setStartPoint(null);
        setCurrentPoint(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [isPdf]);

  // Mouse events for drawing rectangle
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isSelecting) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setStartPoint({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setCurrentPoint({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    e.preventDefault();
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isSelecting || !startPoint) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCurrentPoint({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleMouseUp = async () => {
    if (!isSelecting || !startPoint || !currentPoint) return;
    // Prepare capture
    try {
      const element = containerRef.current;
      if (!element) return;
      const canvas = await html2canvas(element as HTMLElement, {
        useCORS: true,
        backgroundColor: null,
        scale: window.devicePixelRatio || 1,
        ignoreElements: (el) => el.classList?.contains("selection-overlay"),
      });

      const scaleFactor = canvas.width / element.clientWidth;

      const x = Math.min(startPoint.x, currentPoint.x);
      const y = Math.min(startPoint.y, currentPoint.y);
      const width = Math.abs(startPoint.x - currentPoint.x);
      const height = Math.abs(startPoint.y - currentPoint.y);

      const cropped = document.createElement("canvas");
      cropped.width = Math.max(1, Math.round(width * scaleFactor));
      cropped.height = Math.max(1, Math.round(height * scaleFactor));
      const ctx = cropped.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(canvas, x * scaleFactor, y * scaleFactor, width * scaleFactor, height * scaleFactor, 0, 0, cropped.width, cropped.height);

      // Convert to blob
      cropped.toBlob(async (blob) => {
        if (!blob) return;
        // Copy to clipboard
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob })
          ]);
        } catch (err) {
          console.error("Failed to copy image to clipboard", err);
        }

        // Send to chat if callback provided
        if (onImageCaptured) {
          const file = new File([blob], "crop.png", { type: "image/png" });
          onImageCaptured(file);
        }

        // Close modal after capture
        onClose();
      }, "image/png");
    } catch (err) {
      console.error("Error capturing selection", err);
    } finally {
      // reset selection
      setStartPoint(null);
      setCurrentPoint(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="relative max-h-[95vh] max-w-[95vw] bg-white text-black rounded shadow-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        ref={containerRef}
        onMouseDown={!isPdf ? handleMouseDown : undefined}
        onMouseMove={!isPdf ? handleMouseMove : undefined}
        onMouseUp={!isPdf ? handleMouseUp : undefined}
        style={{ cursor: (!isPdf && isSelecting) ? "crosshair" : "default" }}
      >
        Hold Option (⌥) to select area for question
        {isPdf ? (
          <PdfView4Capture 
            pdfPath={formPath}
            onImageCaptured={onImageCaptured}
            onClose={onClose}
          />
        ) : (
          <DocxViewer filePath={formPath} />
        )}

        {/* Selection rectangle - only for DOCX files */}
        {!isPdf && isSelecting && startPoint && currentPoint && (
          <div
            className="selection-overlay"
            style={{
              position: "absolute",
              border: "2px dashed #0ea5e9",
              background: "rgba(14,165,233,0.2)",
              left: Math.min(startPoint.x, currentPoint.x),
              top: Math.min(startPoint.y, currentPoint.y),
              width: Math.abs(currentPoint.x - startPoint.x),
              height: Math.abs(currentPoint.y - startPoint.y),
              pointerEvents: "none",
            }}
          />
        )}

        {/* Close button */}
        <button
          className="absolute top-4 right-4 text-white bg-black/50 rounded-full p-2 hover:bg-black/70"
          onClick={onClose}
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default FullScreenFormModal; 
