import React, { useEffect, useState } from "react";

interface ChatImageProps {
  path: string;
}

const ChatImage: React.FC<ChatImageProps> = React.memo(({ path }) => {
  const [dataSrc, setDataSrc] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const { content } = await window.easyFormContext.readFile(path);
        const extMatch = path.match(/\.([a-zA-Z0-9]+)$/);
        const ext = extMatch ? extMatch[1].toLowerCase() : "png";
        const mime = ext === "jpg" || ext === "jpeg" ? "jpeg" : ext;
        if (isMounted) {
          setDataSrc(`data:image/${mime};base64,${content}`);
        }
      } catch (err) {
        console.error("Failed to load image", err);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [path]);

  if (!dataSrc) return null;
  
  return (
    <>
      <img
        src={dataSrc}
        alt="attached"
        className="mt-2 max-w-full max-h-60 w-auto rounded-md cursor-pointer hover:opacity-90 object-contain"
        onClick={() => setIsModalOpen(true)}
      />
      
      {/* Modal overlay */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setIsModalOpen(false)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw]">
            <img
              src={dataSrc}
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
});

export default ChatImage; 