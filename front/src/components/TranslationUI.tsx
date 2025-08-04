import React, {
  useState,
  useEffect,
  useRef,
} from "react";
import { LanguageCombobox } from "./LanguageCombobox";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PanelLeft, Plus } from "lucide-react";
import DocxViewer from "@/components/DocxViewer";
import {
  NO_TRANSLATION,
  DEFAULT_PROVIDER
} from "@/const";
import Markdown from 'react-markdown'
import {
  GetMarkdownText,
  GetFileExtension
} from "@/utils/utils";
import { DefaultService } from "@/client";
import { FormProcessingJob, useFormFillerContext } from "@/contexts/FormFillerContext";
import { SmallFormProcessingCard } from "@/components/SmallFormProcessingCard";
import PlainPdfViewer from "@/components/PlainPdfViewer";

/**
  * Assume that `formPath` always exists
  */
export default function TranslationUI(
  {
    processingJobs,
    selectedForm,
    onSelectForm,
    onRemoveProcessingJob,
    onUploadForm,
  }: {
    processingJobs: FormProcessingJob[],
    selectedForm: string
    onSelectForm: (formPath: string) => void;
    onRemoveProcessingJob: (formPath: string) => void;
    onUploadForm: () => void;
  }
) {
  const [lang, setLang] = useState<string>(NO_TRANSLATION)
  const [markdownContent, setMarkdownContent] = useState<string>('')
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  // Holds the absolute path returned by the backend for the translated file (DOCX or Markdown)
  const [translatedOutputPath, setTranslatedOutputPath] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [showOriginal, setShowOriginal] = useState<boolean>(true);
  const { wrapRequest } = useFormFillerContext();
  const translationTaskAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Cancel any ongoing translation when component unmounts or dependencies change
    return () => {
      if (translationTaskAbortRef.current) {
        translationTaskAbortRef.current.abort();
      }
    };
  }, [selectedForm, lang]);

  useEffect(() => {
    const loadTranslation = async () => {
      if (lang === NO_TRANSLATION) {
        return
      }

      // Cancel any existing translation
      if (translationTaskAbortRef.current) {
        translationTaskAbortRef.current.abort();
      }

      // Create new abort controller for this translation
      const abortController = new AbortController();
      translationTaskAbortRef.current = abortController;

      console.log("Loading translation for", selectedForm, "to", lang);

      try {
        // Reset previous path before starting a new translation cycle
        setTranslatedOutputPath(null);

        switch (GetFileExtension(selectedForm)) {
          case '.docx': {
            setIsTranslating(true);
            const resp = await wrapRequest(selectedForm, DefaultService.apiTranslateFileTranslatePost({
              file_path: selectedForm,
              language: lang,
              provider: DEFAULT_PROVIDER,
            }));

            if (!abortController.signal.aborted) {
              setIsTranslating(false);
              setTranslatedOutputPath(resp.output_path);
            }
            break;
          }

          case '.pdf': {
            setIsTranslating(true);
            const resp = await wrapRequest(selectedForm, DefaultService.apiTranslateFileTranslatePost({
              file_path: selectedForm,
              language: lang,
              provider: DEFAULT_PROVIDER,
            }));

            if (!abortController.signal.aborted) {
              setIsTranslating(false);
              setTranslatedOutputPath(resp.output_path);

              // Load markdown only if the translated file is a .md file
              if (GetFileExtension(resp.output_path) === '.md') {
                setMarkdownContent(await GetMarkdownText(resp.output_path));
              }
            }

            break;
          }
          default:
            console.error("WTF it is not PDF or DOCX")
            return
        }
      } catch (error: any) {
        // Ignore abort errors
        if (error.name !== 'AbortError') {
          console.error("Translation error:", error);
          setIsTranslating(false);
        }
      }
    }

    loadTranslation();
  }, [lang]);

  useEffect(() => {
    // Cancel any ongoing translation when file changes
    if (translationTaskAbortRef.current) {
      translationTaskAbortRef.current.abort();
    }

    setIsTranslating(false);
    setLang(NO_TRANSLATION);
    setMarkdownContent('');
    setTranslatedOutputPath(null);
  }, [selectedForm]);

  return <div className="relative">
    {/* Mobile backdrop */}
    {!isCollapsed && (
      <div
        className="fixed inset-0 bg-black/50 z-30 lg:hidden"
        onClick={() => setIsCollapsed(true)}
      />
    )}

    <div className="flex gap-2 h-[75vh]">
      {/* Form Sidebar */}
      <Card className={` 
        py-2 gap-2 fixed lg:static inset-y-0 left-0 z-40
        ${isCollapsed ? "w-4/5 sm:w-80 lg:w-0" : "w-4/5 sm:w-80 lg:w-60"}
        h-screen lg:h-full
        overflow-hidden shadow-sm border-gray-200
        transition-all duration-300 ease-in-out
        ${isCollapsed ? "-translate-x-full lg:translate-x-0" : "translate-x-0"}
        ${isCollapsed ? "lg:min-w-0 lg:overflow-hidden" : ""}
        flex-shrink-0
      `}>
        <CardHeader className="px-4 py-2 border-b [.border-b]:pb-2">
          <Button
            className="w-full"
            variant="secondary"
            onClick={onUploadForm}
          >
            <Plus className="mr-2 h-4 w-4" />
            Upload form
          </Button>
        </CardHeader>
        <CardContent className="p-3 overflow-y-auto flex-1 space-y-2">
          {processingJobs.map(
            (job) => (
              <SmallFormProcessingCard
                key={job.filePath}
                path={job.filePath}
                isSelected={selectedForm === job.filePath}
                onSelect={() => onSelectForm(job.filePath)}
                isProcessing={job.isProcessing}
                isCompleted={job.isCompleted}
                processingError={job.processingError}
                onRemove={() => onRemoveProcessingJob(job.filePath)}
              />
            )
          )}
        </CardContent>
      </Card>

      {/* Mobile/Tablet view - Single preview */}
      <div className="flex-1 block lg:hidden">
        <Card className=" py-2 gap-2 h-full overflow-hidden shadow-sm border-gray-200">
          <CardHeader className="flex flex-row items-center justify-between px-3 py-2 border-b [.border-b]:pb-2">
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setIsCollapsed(!isCollapsed)}
                title="Toggle sidebar"
                className="h-7 w-7"
              >
                <PanelLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowOriginal(!showOriginal)}
                className="h-7 px-3"
              >
                {showOriginal ? "Original" : "Translated"}
              </Button>
            </div>
            {!showOriginal && (
              <LanguageCombobox
                lang={lang}
                onLangSelect={(newLang) => setLang(newLang)}
              />
            )}
          </CardHeader>
          <CardContent className="p-0 overflow-auto flex-1">
            {showOriginal ? (
              selectedForm.endsWith('.docx') ? (
                <DocxViewer filePath={selectedForm} />
              ) : (
                <PlainPdfViewer pdfPath={selectedForm} />
              )
            ) : (
              (lang === NO_TRANSLATION) ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <svg className="w-16 h-16 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                  </svg>
                  <p className="text-lg font-medium">No Translation Selected</p>
                  <p className="text-sm mt-1">Choose a language from the dropdown above</p>
                </div>
              ) : isTranslating ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                  <p className="text-lg font-medium">Translating...</p>
                  <p className="text-sm mt-1">Please wait while we translate your document</p>
                </div>
              ) : translatedOutputPath ? (
                (() => {
                  const ext = GetFileExtension(translatedOutputPath);
                  if (ext === '.md') {
                    return (
                      <div className="p-6">
                        <Markdown className="prose prose-sm max-w-none">{markdownContent}</Markdown>
                      </div>
                    );
                  } else if (ext === '.pdf') {
                    return <PlainPdfViewer pdfPath={translatedOutputPath} />;
                  } else {
                    return <DocxViewer filePath={translatedOutputPath} />;
                  }
                })()
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <p className="text-lg font-medium">Translation unavailable</p>
                  <p className="text-sm mt-1">The translated document could not be generated. Please try again.</p>
                </div>
              )
            )}
          </CardContent>
        </Card>
      </div>

      {/* Desktop view - Original and Translated side by side */}
      <div className="hidden lg:flex flex-1 gap-2">
        {/* Original Form Viewer */}
        <Card className="flex-1 h-full overflow-hidden shadow-sm border-gray-200 py-2 gap-2">
          <CardHeader className="flex flex-row items-center justify-between px-3 py-2 border-b [.border-b]:pb-2">
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  console.log("Toggle sidebar")
                  setIsCollapsed(!isCollapsed)
                }}
                title="Toggle sessions"
                className="h-7 w-7"
              >
                <PanelLeft className="h-3.5 w-3.5" />
              </Button>
              <h2 className="text-base font-semibold">Original form</h2>
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-auto flex-1">
            {
              selectedForm.endsWith('.docx') ? (
                <DocxViewer
                  filePath={selectedForm}
                />
              ) : (
                <PlainPdfViewer
                  pdfPath={selectedForm}
                />
              )
            }
          </CardContent>
        </Card>

        {/* Translated Form Viewer */}
        <Card className="flex-1 h-full overflow-hidden shadow-sm border-gray-200 py-2 gap-2">
          <CardHeader className="flex flex-row items-center justify-between px-3 py-2 border-b [.border-b]:pb-2">
            <h2 className="text-base font-semibold">Translated form</h2>
            <LanguageCombobox
              lang={lang}
              onLangSelect={(newLang) => setLang(newLang)}
            />
          </CardHeader>
          <CardContent className="p-0 overflow-auto flex-1">
            {(lang === NO_TRANSLATION) ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-500">
                <svg className="w-16 h-16 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                </svg>
                <p className="text-lg font-medium">No Translation Selected</p>
                <p className="text-sm mt-1">Choose a language from the dropdown above</p>
              </div>
            ) : isTranslating ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-500">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                <p className="text-lg font-medium">Translating...</p>
                <p className="text-sm mt-1">Please wait while we translate your document</p>
              </div>
            ) : translatedOutputPath ? (
              (() => {
                const ext = GetFileExtension(translatedOutputPath);
                if (ext === '.md') {
                  return (
                    <div className="p-6">
                      <Markdown className="prose prose-sm max-w-none">{markdownContent}</Markdown>
                    </div>
                  );
                } else if (ext === '.pdf') {
                  return <PlainPdfViewer pdfPath={translatedOutputPath} />;
                } else {
                  return <DocxViewer filePath={translatedOutputPath} />;
                }
              })()
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-500">
                <p className="text-lg font-medium">Translation unavailable</p>
                <p className="text-sm mt-1">The translated document could not be generated. Please try again.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
}
