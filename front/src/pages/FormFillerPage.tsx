"use client";

import React, { useRef, useEffect } from "react";
import Chat from "@/components/Chat";

import ChangesList from "@/components/ChangesList";
import { FilePreviewCard } from "@/components/FilePreviewCard";
import { FormProcessingCard } from "@/components/FormProcessingCard";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  previewFile,
} from "@/helpers/form_helpers";
import {
  Check,
  CheckCircle,
  Edit3,
  ExternalLink,
  FileCheck,
  FileText,
  Upload,
} from "lucide-react";
import PdfViewer from "@/components/PdfViewer";
import DocxViewer from "@/components/DocxViewer";
import FormSelectionCard from "@/components/FormSelectionCard";
import {
  DefaultService,
  CancelError,
  FillEntrySchema,
  ProcessFillEntriesRequest,
  ExtractContextRequest
} from "@/client";
import { DEFAULT_PROVIDER } from "@/const";
import { useFormFillerContext, FormProcessingJob } from "@/contexts/FormFillerContext";
import { toast } from "sonner"
import { getFills, getFilledLine, GetFileExtension, RemoveFileExtension } from "@/utils/utils";
import TranslationUI from "@/components/TranslationUI";

export default function FormFillingAI() {
  const {
    currentStep,
    setCurrentStep,
    selectedForm,
    contextDir,
    setContextDir,
    contextKeys,
    setContextKeys,
    processingJobs,
    addProcessingJob,
    removeProcessingJob,
    updateProcessingJob,
    wrapRequest,
    viewerKey,
    setViewerKey,
    setContextExtracted,
    isInteractive,
    onSelectForm
  } = useFormFillerContext();

  const processingJobsRef = useRef<FormProcessingJob[]>(processingJobs);
  useEffect(() => {
    processingJobsRef.current = processingJobs;
  }, [processingJobs]);

  // Get current selected form data from processing jobs
  const currentJob = selectedForm ? processingJobs.find(job => job.filePath === selectedForm) : undefined;
  // Start extracting context as soon as the user selects a directory.
  // We store the resulting promise so we can await it later when truly needed.
  const contextPromiseRef = useRef<Promise<any> | null>(null);

  const handleFileUpload = async () => {
    const filePaths = await window.easyFormContext.selectFiles()
    if (!filePaths) {
      console.error("No file selected");
      return;
    }

    // Add all selected files as processing jobs
    filePaths.forEach(filePath => {
      if (!processingJobs.find(job => job.filePath === filePath)) {
        addProcessingJob(filePath);
        // Start processing this form immediately
        processFormJob(filePath);
      }
    });

    onSelectForm(filePaths[0]);
  };

  const startNewForm = () => {
    setCurrentStep(1);
    onSelectForm(undefined);
    setContextDir(undefined);
    setViewerKey((prevKey: number) => prevKey + 1);
    setContextExtracted(false);
    // Clear all processing jobs
    processingJobs.forEach(job => removeProcessingJob(job.filePath));
    // Reset stored context promise when starting over
    contextPromiseRef.current = null;
  }

  const handleChooseContextDir = async () => {
    const dir = await window.easyFormContext.selectDirectory();
    if (dir) {
      setContextDir(dir);
      setContextExtracted(false);
    }
  };

  const toUploadStep = () => {
    setCurrentStep(2);
    // Kick off context extraction immediately (do not await)
    contextPromiseRef.current = DefaultService.apiExtractContextContextExtractPost({
      context_dir: contextDir?.path || "",
      provider: DEFAULT_PROVIDER as ExtractContextRequest.provider,
    }).then(res => res.context).catch((error) => {
      setContextExtracted(true);
      console.error("Context extraction failed:", error);
      return null;
    });
  }

  const changedLinesToFilledEntries =
    (changedLines: ChangeLine[], fillEntries: FillEntrySchema[]): FillEntrySchema[] => {
      if (!fillEntries || changedLines.length === 0) {
        return fillEntries || [];
      }

      const updatedEntries: FillEntrySchema[] = structuredClone(fillEntries);

      // Group changed lines by entryIndex
      const linesByEntry: { [key: number]: ChangeLine[] } = {};
      changedLines.forEach(line => {
        if (!linesByEntry[line.entryIndex]) {
          linesByEntry[line.entryIndex] = [];
        }
        linesByEntry[line.entryIndex].push(line);
      });

      for (const entryIndexStr in linesByEntry) {
        const entryIndex = parseInt(entryIndexStr, 10);
        const linesForEntry = linesByEntry[entryIndex];

        // Sort lines by lineIndex to ensure correct order
        linesForEntry.sort((a, b) => a.lineIndex - b.lineIndex);

        const newFilledLines = linesForEntry.map(l => l.filledLine).join('\n');

        updatedEntries[entryIndex].filled_lines = newFilledLines;
      }

      return updatedEntries;
    }

  const updateChange = async (changeId: number, newValue: string) => {
    if (!currentJob?.fillPattern) {
      toast("No pattern to be filled found");
      return;
    }
    if (!selectedForm) {
      toast("No file selected for manual edit save");
      return;
    }

    const updatedLine = currentJob.changedLines.find(line => line.id === changeId);
    if (!updatedLine) {
      console.error("Change line not found:", changeId);
      return
    }
    const { ok, fills } = getFills(
      updatedLine.originalLine,
      newValue,
      currentJob.fillPattern)
    if (!ok) {
      toast("Please only modify the placeholders")
      return
    }

    const newChangedLines = currentJob.changedLines.map((line) =>
      line.id === changeId
        ? { ...line, filledLine: newValue }
        : line
    )
    const newFillEntries = changedLinesToFilledEntries(newChangedLines, currentJob.fillEntries);

    const filledKeys: Map<string, string | null> = new Map()

    if (updatedLine.contextKeys.length == fills.length) {
      updatedLine.contextKeys.map((key, id) => {
        if (key) {
          filledKeys.set(key, fills[id]);
        } else {
          console.log(`key name for value ${fills[id]} is missing`)
        }
      })
    } else {
      console.error(`Manual edits : #fills (${fills.length}) != #keys ${updatedLine.contextKeys.length}`)
    }

    try {
      toast("Regenerating form with manual edits...")
      const extension = GetFileExtension(selectedForm);
      const newOutputPath = `${RemoveFileExtension(selectedForm)}_filled${extension}`;
      await (selectedForm.endsWith('.pdf')
        ? DefaultService.apiFillPdfPdfFillPost({
          form_path: selectedForm,
          fill_entries: newFillEntries,
          checkbox_entries: currentJob.filledCheckbox,
          output_path: newOutputPath,
          context_dir: contextDir?.path,
        })
        : DefaultService.apiFillDocxDocxFillPost({
          form_path: selectedForm,
          fill_entries: newFillEntries,
          checkbox_entries: currentJob.filledCheckbox,
          output_path: newOutputPath,
        }));
      toast("Form regenerated")

      console.log("Updating context keys:")
      console.log(filledKeys);

      if (contextDir) {
        filledKeys.forEach((value, key) => {
          if (value) {
            DefaultService.apiAddContextContextAddPost({
              context_dir: contextDir.path,
              key,
              value,
            })
          }
        })
      }

      console.log("Manual edit save complete!");
      setViewerKey((prevKey: number) => prevKey + 1);

      // Update the processing job with new data
      updateProcessingJob(selectedForm, {
        changedLines: newChangedLines,
        fillEntries: newFillEntries,
        outputPath: newOutputPath
      });
    } catch (error) {
      console.error("Manual edit save failed:", error);
    }
  }

  // Helper function to calculate changed lines from fill entries
  const calculateChangedLines = (fillEntries: FillEntrySchema[], fillPattern?: string): ChangeLine[] => {
    const changedLines: ChangeLine[] = [];
    let id = 0;
    fillEntries.forEach((entry, entryIndex) => {
      const originalLines = entry.lines.split("\n");
      const filledLines = (entry.filled_lines || entry.lines).split("\n");
      let contextKeyId = 0

      for (let lineIndex = 0; lineIndex < originalLines.length; lineIndex++) {
        const keys: (string | null)[] = []
        if (fillPattern) {
          const numKeys = originalLines[lineIndex]
            .match(new RegExp(fillPattern, 'g'))?.length
          if (numKeys)
            Array.from(
              {
                length: numKeys
              }).forEach((_) => {
                keys.push(entry.context_keys[contextKeyId++])
              });
        }
        changedLines.push({
          originalLine: originalLines[lineIndex],
          filledLine: filledLines[lineIndex],
          contextKeys: keys,
          id: id++,
          entryIndex: entryIndex,
          lineIndex: lineIndex,
        });
      }
    });

    return changedLines;
  };

  const processFormJob = async (formPath: string) => {
    if (!contextDir) {
      console.error("No context directory selected");
      updateProcessingJob(formPath, {
        isProcessing: false,
        processingError: "No context directory selected"
      });
      return;
    }

    try {
      console.log("Processing form:", formPath);

      // Get form text
      const { text: formText, is_interactive } = await wrapRequest(formPath, DefaultService.apiExtractFormTextFormTextPost({
        form_path: formPath,
      }));
      updateProcessingJob(formPath, { formText });

      // Detect pattern
      const { pattern } = await wrapRequest(formPath, DefaultService.apiDetectPatternPatternDetectPost({
        text: formText,
        is_interactive,
      }));
      updateProcessingJob(formPath, { fillPattern: pattern });

      // Get context
      let context;
      if (contextPromiseRef.current) {
        context = await contextPromiseRef.current;
      } else {
        const extractResp = await wrapRequest(formPath, DefaultService.apiExtractContextContextExtractPost({
          context_dir: contextDir.path,
          provider: DEFAULT_PROVIDER as ExtractContextRequest.provider,
        }));
        context = extractResp.context;
      }
      console.log("Context fetched:");
      console.dir(context);
      setContextExtracted(true);

      // Detect fill entries
      const { entries: fillEntries } = await wrapRequest(formPath, DefaultService.apiDetectFillEntriesFillEntriesDetectPost({
        lines: formText.split('\n'),
        pattern,
      }));

      if (!fillEntries || fillEntries.length === 0) {
        updateProcessingJob(formPath, {
          tooComplexForm: true,
          isProcessing: false,
          isCompleted: true,
          outputPath: formPath,
        });
        toast(`Form ${formPath.split('/').pop()} is too complex for AI auto-fill`);
        return;
      }

      // Process fill entries
      const { entries: filledEntries, missing_keys } = await wrapRequest(formPath, DefaultService.apiProcessFillEntriesFillEntriesProcessPost({
        entries: fillEntries,
        context_dir: contextDir.path,
        pattern,
        form_path: formPath,
        provider: DEFAULT_PROVIDER as ProcessFillEntriesRequest.provider,
      }));

      // Process checkbox entries
      const { entries: checkboxEntries } = await wrapRequest(formPath, DefaultService.apiDetectCheckboxEntriesCheckboxEntriesDetectPost({
        lines: formText.split('\n'),
      }));
      const { entries: filledCheckbox } = await wrapRequest(formPath, DefaultService.apiProcessCheckboxEntriesCheckboxEntriesProcessPost({
        entries: checkboxEntries,
        context_dir: contextDir.path,
        provider: DEFAULT_PROVIDER as ProcessFillEntriesRequest.provider,
      }));

      // Generate output path
      const extension = GetFileExtension(formPath);
      const outputPath = `${RemoveFileExtension(formPath)}_filled${extension}`;

      // Fill the form
      await (formPath.endsWith('.pdf')
        ? wrapRequest(formPath, DefaultService.apiFillPdfPdfFillPost({
          form_path: formPath,
          fill_entries: filledEntries,
          checkbox_entries: filledCheckbox,
          output_path: outputPath,
          context_dir: contextDir.path,
        }))
        : wrapRequest(formPath, DefaultService.apiFillDocxDocxFillPost({
          form_path: formPath,
          fill_entries: filledEntries,
          checkbox_entries: filledCheckbox,
          output_path: outputPath,
        })));

      // Calculate changed lines
      const changedLines = calculateChangedLines(filledEntries, pattern);

      // Update job as completed
      updateProcessingJob(formPath, {
        fillEntries: filledEntries,
        missingKeys: missing_keys,
        changedLines,
        filledCheckbox,
        outputPath,
        isProcessing: false,
        isCompleted: true,
      });

      if (processingJobsRef.current.some(j => j.filePath === formPath)) {
        toast(`Form ${formPath.split('/').pop()} processed successfully!`);
      }

    } catch (error) {
      // Ignore cancellation – it's expected when the user removes the form
      if (error instanceof CancelError || (error instanceof Error && error.message === 'Request aborted')) {
        return;
      }
      console.error("Processing failed for", formPath, ":", error);
      updateProcessingJob(formPath, {
        isProcessing: false,
        processingError: error instanceof Error ? error.message : "Processing failed"
      });
      if (processingJobsRef.current.some(j => j.filePath === formPath)) {
        toast(`Failed to process ${formPath.split('/').pop()}: ${error}`);
      }
    }
  };

  // Sync form with current context data
  const syncFormWithContext = async (formPath: string) => {
    if (!contextDir) {
      console.log("No context directory to sync with");
      return;
    }

    const job = processingJobs.find(j => j.filePath === formPath);
    if (!job || !job.isCompleted || job.tooComplexForm || !job.fillEntries || !job.fillPattern) {
      console.log("Form is not ready for sync or too complex");
      return;
    }

    try {
      console.log("Syncing form with current context data...");

      // Read current context data from backend
      const response = await DefaultService.apiReadContextContextReadPost({
        context_dir: contextDir.path
      });
      const currentContext = response.context;

      // Check if any filled values are outdated
      let needsUpdate = false;
      const updatedFillEntries: typeof job.fillEntries = structuredClone(job.fillEntries);

      job.fillEntries.forEach((entry, entryIndex) => {
        const filledLines = (entry.filled_lines || entry.lines).split("\n");
        const originalLines = entry.lines.split("\n");
        let contextKeyIndex = 0;

        for (let lineIndex = 0; lineIndex < filledLines.length; lineIndex++) {
          const filledLine = filledLines[lineIndex];
          const originalLine = originalLines[lineIndex];

          // Get fills from the filled line
          const { ok, fills } = getFills(originalLine, filledLine, job.fillPattern!);

          if (ok && fills.length > 0) {
            // Prepare a copy of the current fill values so we can mutate them safely
            const updatedFills: (string | null)[] = [...fills];

            fills.forEach((fillValue, fillIndex) => {
              const contextKey = entry.context_keys[contextKeyIndex + fillIndex];

              if (contextKey && currentContext[contextKey] !== undefined) {
                const currentValue = String(currentContext[contextKey]);

                // Only mark for update when there is an existing value and it differs from the context
                if (fillValue && fillValue !== currentValue) {
                  console.log(`Found outdated value for key "${contextKey}": "${fillValue}" -> "${currentValue}"`);
                  needsUpdate = true;
                  updatedFills[fillIndex] = currentValue;
                }
              }
            });

            // If at least one placeholder was updated, rebuild the line deterministically
            if (needsUpdate) {
              filledLines[lineIndex] = getFilledLine(originalLine, updatedFills, job.fillPattern!);
            }

            contextKeyIndex += fills.length;
          }
        }

        // Update the filled_lines in the entry
        updatedFillEntries[entryIndex].filled_lines = filledLines.join('\n');
      });

      if (needsUpdate) {
        console.log("Updating form with synced values...");

        // Generate new output path
        const extension = GetFileExtension(formPath);
        const newOutputPath = `${RemoveFileExtension(formPath)}_filled${extension}`;

        // Fill the form with updated entries
        await (formPath.endsWith('.pdf')
          ? DefaultService.apiFillPdfPdfFillPost({
            form_path: formPath,
            fill_entries: updatedFillEntries,
            checkbox_entries: job.filledCheckbox,
            output_path: newOutputPath,
          })
          : DefaultService.apiFillDocxDocxFillPost({
            form_path: formPath,
            fill_entries: updatedFillEntries,
            checkbox_entries: job.filledCheckbox,
            output_path: newOutputPath,
          }));

        // Calculate new changed lines
        const newChangedLines = calculateChangedLines(updatedFillEntries, job.fillPattern);

        // Update the processing job
        updateProcessingJob(formPath, {
          fillEntries: updatedFillEntries,
          changedLines: newChangedLines,
          outputPath: newOutputPath
        });

        // Refresh the viewer
        setViewerKey(prev => prev + 1);

      } else {
        console.log("Form is already up to date with context");
      }

    } catch (error) {
      console.error("Failed to sync form with context:", error);
    }
  };

  const reviewForm = async () => {
    if (!selectedForm) {
      console.error("No form selected for review");
      return;
    }

    // Find the processing job for the selected form
    const job = processingJobs.find(j => j.filePath === selectedForm);

    if (!job) {
      console.error("No processing job found for selected form");
      return;
    }

    if (job.isProcessing) {
      toast("Form is still being processed. Please wait...");
      return;
    }

    if (!job.isCompleted) {
      toast("Form processing not completed yet");
      return;
    }

    // Move to review step - all data is now in the processing job
    setCurrentStep(3);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto p-2">
        <div className="mx-auto max-w-6xl">

          <Tabs value={currentStep.toString()} className="w-full">
            <TabsList className="mb-4 grid w-full grid-cols-4 transition-all duration-300">
              <TabsTrigger value="1" disabled={currentStep < 1}>
                <FileText className="mr-2 h-4 w-4" />
                Select Context
              </TabsTrigger>
              <TabsTrigger value="2" disabled={currentStep < 2}>
                <Upload className="mr-2 h-4 w-4" />
                Upload Form
              </TabsTrigger>
              <TabsTrigger value="3" disabled={currentJob?.tooComplexForm || currentStep < 3}>
                <CheckCircle className="mr-2 h-4 w-4" />
                Review & Edit
              </TabsTrigger>
              <TabsTrigger value="4" disabled={currentStep < 4}>
                <FileCheck className="h-4 w-4 mr-2" />
                Complete
              </TabsTrigger>
            </TabsList>

            {/* Step 2: Upload Form */}
            <TabsContent value="2" className="space-y-6 animate-in fade-in-0 slide-in-from-right-4 duration-500">
              {processingJobs.length !== 0 ? (
                <TranslationUI
                  onRemoveProcessingJob={removeProcessingJob}
                  onSelectForm={onSelectForm}
                  processingJobs={processingJobs}
                  onUploadForm={handleFileUpload}
                  // @ts-ignore
                  selectedForm={selectedForm || "/Users/tung.vu/Documents/form_pdf_long.pdf"}
                />
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>Upload Form</CardTitle>
                    <CardDescription>
                      Select the form you want to fill automatically.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-lg border-2 border-dashed border-border p-8 text-center transition-colors hover:border-accent">
                      <Button
                        onClick={handleFileUpload}
                        className="flex cursor-pointer flex-col items-center justify-center p-8 border-none bg-transparent hover:bg-accent w-full h-full"
                      >
                        <Upload className="mb-4 h-12 w-12 text-muted-foreground" />
                        <span className="text-lg font-medium text-foreground">
                          Click to upload a DOCX or PDF form
                        </span>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Supports PDF files up to 10MB
                        </p>
                      </Button>
                    </div>

                    {processingJobs.length > 0 && (
                      processingJobs.map((job) => {
                        return (
                          <FormProcessingCard
                            key={job.filePath}
                            path={job.filePath}
                            isSelected={selectedForm === job.filePath}
                            onSelect={() => onSelectForm(job.filePath)}
                            isProcessing={job.isProcessing}
                            isCompleted={job.isCompleted}
                            processingError={job.processingError}
                            onRemove={() => removeProcessingJob(job.filePath)}
                          />
                        )
                      })
                    )}
                  </CardContent>
                </Card>
              )}

            </TabsContent>

            {/* Step 1: Select Context */}
            <TabsContent value="1" className="space-y-6 animate-in fade-in-0 slide-in-from-left-4 duration-500">
              <Card>
                <CardHeader>
                  <CardTitle>Choose context folder</CardTitle>
                  <CardDescription>
                    Provide a folder with context files (e.g., .docx, .pdf, .txt) to help the AI fill out the form.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg border-2 border-dashed border-border p-8 text-center transition-colors hover:border-accent">
                    <Button
                      onClick={handleChooseContextDir}
                      className="flex cursor-pointer flex-col items-center justify-center p-8 border-none bg-transparent hover:bg-accent w-full h-full"
                    >
                      <Upload className="mb-4 h-12 w-12 text-muted-foreground" />
                      <span className="text-lg font-medium text-foreground">
                        Click to choose context folder
                      </span>
                    </Button>
                  </div>

                  {contextDir && (
                    contextDir.filePaths.map((filePath, id) => (
                      <FilePreviewCard
                        key={id}
                        path={filePath}
                      />
                    ))
                  )}

                </CardContent>
              </Card>
            </TabsContent>

            {/* Step 3: Review & Edit */}
            <TabsContent value="3"
              className="space-y-6 animate-in fade-in-0 slide-in-from-right-4 duration-500">
              {!currentJob?.tooComplexForm ? (
                <>
                  <FormSelectionCard
                    title="Select Form to Review"
                    description="Choose which completed form you want to review and edit"
                    selectedForm={selectedForm}
                    processingJobs={processingJobs}
                    placeholder="Select a form to review"
                    onFormSelect={async (value) => {
                      onSelectForm(value);
                      // Refresh viewer when form is selected
                      setViewerKey(prev => prev + 1);
                      // Sync form with current context
                      await syncFormWithContext(value);
                    }}
                  />

                  <div className={
                    `grid grid-cols-1 gap-2 lg:${isInteractive ? "grid-cols-1" : "grid-cols-2"}`
                  }>
                    {/* Left Panel: PDF Preview */}
                    <Card className="h-[75vh] py-4 gap-2">
                      <CardHeader>
                        <CardTitle>Form Preview</CardTitle>
                      </CardHeader>
                      <CardContent className="overflow-auto flex-1">
                        {selectedForm?.endsWith(".pdf") && <PdfViewer key={viewerKey} pdfPath={currentJob?.outputPath || selectedForm}></PdfViewer>}
                        {selectedForm?.endsWith(".docx") && (
                          <DocxViewer key={viewerKey} filePath={currentJob?.outputPath || selectedForm}></DocxViewer>
                        )}
                      </CardContent>
                    </Card>

                    {/* Right Panel: Field Status */}
                    {!isInteractive && (
                      <Card className="h-[75vh]">
                        <CardHeader>
                          <CardTitle className="flex items-center space-x-2">
                            <Edit3 className="h-5 w-5" />
                            <span>Changes List</span>
                          </CardTitle>
                          <CardDescription>Review AI-generated changes</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4 overflow-y-auto">
                          <ChangesList
                            changes={
                              currentJob?.fillPattern ?
                                (currentJob?.changedLines || []).filter(
                                  (changeLine) => {
                                    return new RegExp(currentJob.fillPattern!).test(changeLine.originalLine)
                                  }
                                ) : []
                            }
                            onUpdateChange={updateChange}
                          />
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </>
              ) : (
                <div className="h-[calc(100vh-14rem)] overflow-hidden">
                  <Chat
                    contextDir={contextDir}
                    contextKeys={contextKeys}
                    setContextKeys={setContextKeys}
                    selectedForm={selectedForm}
                    onSelectForm={onSelectForm}
                    processingJobs={processingJobs}
                  >
                  </Chat>
                </div>
              )}
            </TabsContent>

            {/* Step 4: Complete (when too complex) */}
            <TabsContent value="4" className="space-y-6 animate-in fade-in-0 slide-in-from-right-4 duration-500">
              <>
                <FormSelectionCard
                  title="Select Completed Form"
                  description="Choose which completed form you want to view or download"
                  selectedForm={selectedForm}
                  processingJobs={processingJobs}
                  placeholder="Select a completed form"
                  onFormSelect={async (value) => {
                    onSelectForm(value);
                    // Load the selected form's data for display
                    const job = processingJobs.find(j => j.filePath === value);
                    if (job && job.isCompleted) {
                      setViewerKey(prev => prev + 1);
                      // Sync form with current context if not too complex
                      if (!job.tooComplexForm) {
                        await syncFormWithContext(value);
                      }
                    }
                  }}
                />

                <div className={`grid gap-6 ${currentJob?.tooComplexForm ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'}`}>
                  {/* Original File */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center space-x-2">
                        <FileText className="h-5 w-5" />
                        <span>Original File</span>
                      </CardTitle>
                      <CardDescription>The original form you uploaded</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center space-x-4 p-4 bg-accent rounded-lg border border-border">
                        <div className="flex-1">
                          <h3 className="font-medium text-foreground break-all">{selectedForm}</h3>
                          <p className="text-sm text-muted-foreground">
                            {selectedForm?.endsWith(".pdf") ? "PDF" : "DOCX"}
                          </p>
                        </div>
                      </div>
                      {/* Preview Button takes all width */}
                      <div className="mt-4 flex justify-end">
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() =>
                            previewFile(selectedForm || "")}>
                          <ExternalLink className="mr-2" />
                          Open
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Filled File */}
                  {!currentJob?.tooComplexForm && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center space-x-2">
                          <FileCheck className="h-5 w-5 text-green-600" />
                          <span>Filled File</span>
                        </CardTitle>
                        <CardDescription>The completed form with AI-filled data</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-center space-x-4 p-4 bg-green-100 dark:bg-green-800 rounded-lg border border-border">
                          <div className="flex-1">
                            <h3 className="font-medium text-foreground break-all">{currentJob?.outputPath || selectedForm}</h3>
                            <p className="text-sm text-muted-foreground">
                              {selectedForm?.endsWith(".pdf") ? "PDF" : "DOCX"}
                            </p>
                          </div>
                        </div>
                        {/* Preview Button takes all width */}
                        <div className="mt-4 flex justify-end">
                          <Button variant="outline" className="w-full" onClick={() => previewFile(currentJob?.outputPath || "")}>
                            <ExternalLink className="mr-2" />
                            Preview
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </>
            </TabsContent>
          </Tabs>

        </div>
      </div>

      <div className="flex-shrink-0 bg-background border-t border-border p-2 transition-all duration-300">
        <div className="mx-auto max-w-6xl">
          {currentStep === 1 && (
            <div className="flex justify-end">
              <Button
                onClick={() => toUploadStep()}
                disabled={!contextDir}
              >
                Next: Upload Form
              </Button>
            </div>
          )}

          {currentStep === 2 && (
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => { setCurrentStep(1); }}>
                Back
              </Button>
              {(() => {
                const job = processingJobs.find(j => j.filePath === selectedForm);

                return (
                  <Button
                    onClick={reviewForm}
                    disabled={
                      !selectedForm ||
                      !contextDir ||
                      !job || job.isProcessing || !job.isCompleted
                    }
                  >
                    Review
                  </Button>
                );
              })()}
            </div>
          )}

          {currentStep === 3 && (
            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={() => setCurrentStep(2)}>
                Back
              </Button>
              <Button
                className="bg-green-500 hover:bg-green-600"
                onClick={() => setCurrentStep(4)}
                disabled={processingJobs.length === 0 || processingJobs.some(job => !job.isCompleted)}
              >
                <Check className="h-4 w-4 mr-2" />
                Next
              </Button>
            </div>
          )}

          {currentStep === 4 && (
            <div className="flex justify-between items-center">
              <Button variant="outline" onClick={() => setCurrentStep(3)}>
                Back
              </Button>
              <Button onClick={startNewForm}>
                Start New Form
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
