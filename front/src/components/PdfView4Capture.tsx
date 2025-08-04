import { useEffect, useState } from "react";
import React from "react";
import {
  AreaHighlight,
  PdfHighlighter,
  Highlight,
  PdfLoader,
  IHighlight,
  Popup,
} from "react-pdf-highlighter";
import { testHighlights as _testHighlights } from "./test-highlights";
import { createBlobUrlFromContent } from "@/helpers/form_helpers";

const resetHash = () => {
  document.location.hash = "";
};

const HighlightPopup = ({
  comment,
}: {
  comment: { text: string; emoji: string };
}) =>
  comment.text ? (
    <div className="Highlight__popup">
      {comment.emoji} {comment.text}
    </div>
  ) : null;


interface PdfView4CaptureProps {
  pdfPath: string;
  onImageCaptured?: (file: File) => void;
  onClose?: () => void;
}

export default function PdfView4Capture({ pdfPath, onImageCaptured, onClose }: PdfView4CaptureProps) {
  const [highlights, _setHighlights] = useState<Array<IHighlight>>([]);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string>("");

  // Track whether the Option (Alt) key is currently pressed so we can
  // provide immediate visual feedback (crosshair cursor) to the user
  // when area-selection is available.
  const [isAltDown, setIsAltDown] = useState(false);

  // Global keyboard listeners – attached once and cleaned up on unmount.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey) {
        setIsAltDown(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!e.altKey) {
        setIsAltDown(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  useEffect(() => {
    const loadPdf = async () => {
      try {
        const url = await createBlobUrlFromContent(pdfPath, "application/pdf");
        setPdfBlobUrl(url);
      } catch (error) {
        console.error("Error loading PDF:", error);
      }
    };

    loadPdf();

    return () => {
      // Clean up blob URL when component unmounts
      if (pdfBlobUrl) {
        URL.revokeObjectURL(pdfBlobUrl);
      }
    };
  }, []);

  const copyImageToClipboard = async (imageData: string) => {
    try {
      // Convert data URL to blob
      const response = await fetch(imageData);
      const blob = await response.blob();

      // Send to chat if callback provided
      if (onImageCaptured) {
        const file = new File([blob], "screenshot.png", { type: "image/png" });
        onImageCaptured(file);
      }

      // Close modal if callback provided
      if (onClose) {
        onClose();
      }
    } catch (error) {
      console.error('Failed to copy image to clipboard:', error);
    }
  };


  return (
    <div
      className="App"
      // Switch cursor to a crosshair when the Option key is held
      style={{ display: "flex", height: "100vh", cursor: isAltDown ? "crosshair" : "default" }}
    >
      <div
        style={{
          height: "100vh",
          width: "75vw",
          position: "relative",
        }}
      >
        <PdfLoader url={pdfBlobUrl} beforeLoad={<div>Loading</div>}>
          {(pdfDocument) => (
            <PdfHighlighter
              pdfDocument={pdfDocument}
              enableAreaSelection={(event) => event.altKey}
              onScrollChange={resetHash}
              scrollRef={(_) => { }}
              onSelectionFinished={(
                _position,
                content,
                hideTipAndSelection,
                _transformSelection,
              ) => {
                // Immediately hide the selection box
                hideTipAndSelection();

                // If this is an area selection with image content, copy to clipboard
                if (content.image) {
                  copyImageToClipboard(content.image);
                }

                // Return null to prevent any tip UI from showing
                return null;
              }}
              highlightTransform={(
                highlight,
                index,
                setTip,
                hideTip,
                _viewportToScaled,
                _screenshot,
                isScrolledTo,
              ) => {
                const isTextHighlight = !highlight.content?.image;

                const component = isTextHighlight ? (
                  <Highlight
                    isScrolledTo={isScrolledTo}
                    position={highlight.position}
                    comment={highlight.comment}
                  />
                ) : (
                  <AreaHighlight
                    isScrolledTo={isScrolledTo}
                    highlight={highlight}
                    onChange={(_) => { }}
                  />
                );

                return (
                  <Popup
                    popupContent={<HighlightPopup {...highlight} />}
                    onMouseOver={(popupContent) =>
                      setTip(highlight, (_highlight) => popupContent)
                    }
                    onMouseOut={hideTip}
                    key={index}
                  >
                    {component}
                  </Popup>
                );
              }}
              highlights={highlights}
            />
          )}
        </PdfLoader>
      </div>
    </div>
  );
}
