import React, { useRef, useEffect } from "react";
import {
  getDocument,
  PDFDocumentProxy,
  GlobalWorkerOptions
} from "pdfjs-dist";

GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();
export default function PlainPdfViewer({ pdfPath }: { pdfPath: string }) {
  const containerRef = useRef<HTMLDivElement>(null);


  useEffect(() => {
    let pdf: PDFDocumentProxy | null = null;
    let resizeTimeout: ReturnType<typeof setTimeout>;
    let lastWidth = 0;
    // A monotonically increasing identifier that lets us cancel any in-flight
    // page rendering jobs whenever we need to re-render the whole document.
    // Every time we call `renderPages` we capture the current value and bump it.
    // Page loops from an earlier invocation exit early when they detect that a
    // newer render cycle has started. This prevents two concurrent loops from
    // appending canvases to the container and creating duplicate pages.
    let renderVersion = 0;

    const container = containerRef.current;
    if (!container) return;

    const renderPdf = async () => {
      const { content } = await window.easyFormContext.readFile(pdfPath);
      const binaryData = atob(content);

      pdf = await getDocument({ data: binaryData }).promise;
      await renderPages();
    };

    const renderPages = async () => {
      // Capture the version for this render cycle and bump the global counter
      const currentVersion = ++renderVersion;

      if (!pdf || !containerRef.current) return;

      const container = containerRef.current;

      // We'll build the new set of pages in a detached fragment first and only
      // swap it into the live DOM once rendering is complete. This guarantees
      // that, at any point in time, the container either shows the old set of
      // pages or the fully-rendered new set – never a partially-rendered mix.
      const fragment = document.createDocumentFragment();

      // Clear the current pages immediately so the user doesn’t see two sets at
      // once.  If this render cycle aborts halfway through the old pages will
      // come back when the fragment is discarded by the next cycle.
      container.innerHTML = '';

      const containerWidth = container.clientWidth;
      const devicePixelRatio = window.devicePixelRatio || 1;

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        // If a newer render cycle has started, abort this one early
        if (currentVersion !== renderVersion) {
          return;
        }

        const page = await pdf.getPage(pageNum);
        const baseViewport = page.getViewport({ scale: 1 });

        const scale = (containerWidth / baseViewport.width) * devicePixelRatio;
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.display = 'block';
        canvas.style.marginBottom = '10px';
        canvas.style.width = containerWidth + 'px';
        canvas.style.height = (viewport.height / devicePixelRatio) + 'px';

        fragment.appendChild(canvas);

        // Render the page.  If the task was aborted (because a newer render
        // started) pdf.js will reject the promise – we can safely ignore it.
        try {
          await page.render({
            canvasContext: ctx,
            viewport: viewport,
          }).promise;
        } catch (e) {
          // Ignore cancellation errors – they are expected when we abort.
          if (currentVersion === renderVersion) {
            console.error('Failed to render page', e);
          }
        }
      }

      // All pages rendered; if this render cycle is still the current one, swap
      // the fragment into the container atomically.
      if (currentVersion === renderVersion) {
        container.appendChild(fragment);
      }
    };

    const handleResize = (entries: ResizeObserverEntry[]) => {
      const entry = entries[0];
      const newWidth = entry.contentRect.width;

      if (Math.abs(newWidth - lastWidth) > 5) {
        lastWidth = newWidth;

        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          if (pdf) renderPages();
        }, 100);
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    renderPdf();

    return () => {
      // Bump the version so that any in-flight rendering loop aborts early
      renderVersion++;
      clearTimeout(resizeTimeout);
      resizeObserver.disconnect();
    };
  }, [pdfPath]);

  return (
    <div
      style={{
        height: "100%",
        width: "100%",
        position: "relative",
        color: "black",
      }}
    >
      <div ref={containerRef} />
    </div>
  )
}
