import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AreaHighlight,
  PdfHighlighter,
  Highlight,
  PdfLoader,
  Tip,
  IHighlight,
  NewHighlight,
  ScaledPosition,
  Content,
  Popup,
} from "react-pdf-highlighter";
import { testHighlights as _testHighlights } from "./test-highlights";
import { getDocument } from "pdfjs-dist";
import {
  DefaultService,
  PdfWidgetSchema
} from "@/client";
import { useFormFillerContext } from "@/contexts/FormFillerContext";

const getNextId = () => String(Math.random()).slice(2);

const parseIdFromHash = () =>
  document.location.hash.slice("#highlight-".length);

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


export default function PdfViewer({ pdfPath }: { pdfPath: string }) {
  const [highlights, setHighlights] = useState<Array<IHighlight>>([]);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string>("");
  const [formWidgets, setFormWidgets] = useState<PdfWidgetSchema[]>([]);
  const {
    contextDir
  } = useFormFillerContext();

  const scrollViewerTo = useRef((highlight: IHighlight) => { });

  const scrollToHighlightFromHash = useCallback(() => {
    const highlight = getHighlightById(parseIdFromHash());
    if (highlight) {
      scrollViewerTo.current(highlight);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("hashchange", scrollToHighlightFromHash, false);
    return () => {
      window.removeEventListener(
        "hashchange",
        scrollToHighlightFromHash,
        false,
      );
    };
  }, [scrollToHighlightFromHash]);

  useEffect(() => {
    let currentBlobUrl: string | null = null;

    const loadPdf = async () => {
      try {
        const { content } = await window.easyFormContext.readFile(
          pdfPath
        );
        const binaryData = atob(content);

        const pdf = await getDocument({ data: binaryData }).promise;

        const widgetsReduce: PdfWidgetSchema[] = []

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const annotations = await page.getAnnotations();

          const widgets = annotations.filter(annotation => annotation.subtype === "Widget");
          widgetsReduce.push(
            ...widgets.map((widget) => {
              return {
                field_name: widget.fieldName,
                field_value: widget.fieldValue,
                field_label: widget.alternativeText
              }
            })
          )
        }

        setFormWidgets(widgetsReduce);

        const byteArray = new Uint8Array(binaryData.length);
        for (let i = 0; i < binaryData.length; i++) {
          byteArray[i] = binaryData.charCodeAt(i);
        }

        const blob = new Blob([byteArray], { type: "application/pdf" });
        currentBlobUrl = URL.createObjectURL(blob);
        setPdfBlobUrl(currentBlobUrl);
      } catch (error) {
        console.error("Error loading PDF:", error);
      }
    };

    loadPdf();

    return () => {
      // Clean up blob URL when component unmounts or pdfPath changes
      if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl);
      }
    };
  }, [pdfPath]);

  const getHighlightById = (id: string) => {
    return highlights.find((highlight) => highlight.id === id);
  };

  const addHighlight = (highlight: NewHighlight) => {
    console.log("Saving highlight", highlight);
    setHighlights((prevHighlights) => [
      { ...highlight, id: getNextId() },
      ...prevHighlights,
    ]);
  };

  const updateHighlight = (
    highlightId: string,
    position: Partial<ScaledPosition>,
    content: Partial<Content>,
  ) => {
    console.log("Updating highlight", highlightId, position, content);
    setHighlights((prevHighlights) =>
      prevHighlights.map((h) => {
        const {
          id,
          position: originalPosition,
          content: originalContent,
          ...rest
        } = h;
        return id === highlightId
          ? {
            id,
            position: { ...originalPosition, ...position },
            content: { ...originalContent, ...content },
            ...rest,
          }
          : h;
      }),
    );
  };


  return (
    <div className="App" style={{ display: "flex", height: "100%" }}>
      <div
        style={{
          height: "100%",
          width: "100%",
          position: "relative",
        }}
      >
        <PdfLoader url={pdfBlobUrl} beforeLoad={<div>Loading</div>}>
          {(pdfDocument) => {
            formWidgets.map((formWidget) => {
              setTimeout(() => {
                const el = document.getElementsByName(formWidget.field_name)[0] as HTMLInputElement;
                if (el) {
                  el.addEventListener('blur', (_event) => {
                    console.log(
                      `Input ${formWidget.field_name} of key ${formWidget.field_label} unfocused`);
                    DefaultService.apiSaveInteractivePdfPdfSaveInteractivePost({
                      form_path: pdfPath,
                      widgets: [
                        {
                          ...formWidget,
                          field_value: el.value ? el.value : null
                        }
                      ]
                    })
                    if (contextDir && formWidget.field_label) {
                      DefaultService.apiAddContextContextAddPost({
                        context_dir: contextDir.path,
                        key: formWidget.field_label.trim().replace(/\s+/g, '_'),
                        value: el.value ? el.value : ''
                      })
                    }
                  });
                } else {
                  console.log('Form field not found');
                }
              }, 300);
            })
            return (
              <PdfHighlighter
                pdfDocument={pdfDocument}
                enableAreaSelection={(event) => event.altKey}
                onScrollChange={resetHash}
                scrollRef={(scrollTo) => {
                  scrollViewerTo.current = scrollTo;
                  scrollToHighlightFromHash();
                }}
                onSelectionFinished={(
                  position,
                  content,
                  hideTipAndSelection,
                  transformSelection,
                ) => (
                  <Tip
                    onOpen={transformSelection}
                    onConfirm={(comment) => {
                      addHighlight({ content, position, comment });
                      hideTipAndSelection();
                    }}
                  />
                )}
                highlightTransform={(
                  highlight,
                  index,
                  setTip,
                  hideTip,
                  viewportToScaled,
                  screenshot,
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
                      onChange={(boundingRect) => {
                        updateHighlight(
                          highlight.id,
                          { boundingRect: viewportToScaled(boundingRect) },
                          { image: screenshot(boundingRect) },
                        );
                      }}
                    />
                  );

                  return (
                    <Popup
                      popupContent={<HighlightPopup {...highlight} />}
                      onMouseOver={(popupContent) =>
                        setTip(highlight, (highlight) => popupContent)
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
            )
          }}
        </PdfLoader>
      </div>
    </div>
  );
}
