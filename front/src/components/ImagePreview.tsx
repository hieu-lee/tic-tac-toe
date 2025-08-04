import React, { useState } from "react";

interface ImagePreviewProps {
  /**
   * Source URL or data URI for the preview image.
   */
  src: string;
  /**
   * Alt text for accessibility.
   */
  alt?: string;
  /**
   * CSS classes to apply to the thumbnail image.
   */
  className?: string;
}

/**
 * ImagePreview replicates the UX of ChatImage for images that are not yet
 * persisted on‐disk (e.g., the preview shown while composing a message).
 */
const ImagePreview: React.FC<ImagePreviewProps> = ({ src, alt = "preview", className = "" }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <img
        src={src}
        alt={alt}
        className={`cursor-pointer hover:opacity-90 object-cover rounded-md ${className}`}
        onClick={() => setIsModalOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            setIsModalOpen(true);
          }
        }}
      />

      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setIsModalOpen(false)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw]">
            <img
              src={src}
              alt="Full size"
              className="max-h-[90vh] max-w-[90vw] object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              className="absolute top-4 right-4 text-white bg-black/50 rounded-full p-2 hover:bg-black/70"
              onClick={() => setIsModalOpen(false)}
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
      )}
    </>
  );
};

export default ImagePreview; 