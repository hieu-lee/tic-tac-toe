import React, {
  createContext,
  useContext,
  useState,
  useRef,
  ReactNode,
  Dispatch,
  SetStateAction
} from "react";
import { DefaultService, FillEntrySchema } from "@/client";

export type FormProcessingJob = {
  filePath: string;
  fillEntries: FillEntrySchema[];
  missingKeys: string[];
  changedLines: ChangeLine[];
  formText: string;
  fillPattern?: string;
  filledCheckbox: any[];
  tooComplexForm: boolean;
  isProcessing: boolean;
  isCompleted: boolean;
  processingError?: string;
  outputPath?: string;
};

import type { CancelablePromise } from "@/client";

interface FormFillerContextType {
  /* wizard step */
  currentStep: number;
  setCurrentStep: Dispatch<SetStateAction<number>>;

  /* selected files / directories */
  selectedForm?: string;
  onSelectForm: (path?: string) => void;
  isInteractive: boolean;
  contextDir?: DirWFilePaths;
  setContextDir: Dispatch<SetStateAction<DirWFilePaths | undefined>>;
  contextKeys: string[];
  setContextKeys: Dispatch<SetStateAction<string[]>>;

  /* context extraction status */
  contextExtracted: boolean;
  setContextExtracted: Dispatch<SetStateAction<boolean>>;

  /* processing jobs */
  processingJobs: FormProcessingJob[];
  setProcessingJobs: Dispatch<SetStateAction<FormProcessingJob[]>>;
  addProcessingJob: (filePath: string) => void;
  removeProcessingJob: (filePath: string) => void;
  updateProcessingJob: (filePath: string, updates: Partial<FormProcessingJob>) => void;

  /* request helpers */
  wrapRequest: <T>(filePath: string, p: CancelablePromise<T>) => CancelablePromise<T>;

  // This is for reloading docs after manual edit
  viewerKey: number;
  setViewerKey: Dispatch<SetStateAction<number>>;
}

/*
 * The actual React context – undefined by default so we can throw an error if
 * callers forget to wrap the tree with the provider.
 */
const FormFillerContext = createContext<FormFillerContextType | undefined>(
  undefined
);

export const FormFillerProvider = ({ children }: { children: ReactNode }) => {
  // --- In-flight request tracking
  const inFlightRef = useRef<Record<string, CancelablePromise<any>[]>>({});

  const wrapRequest = <T,>(filePath: string, p: CancelablePromise<T>): CancelablePromise<T> => {
    (inFlightRef.current[filePath] ??= []).push(p);
    p.finally(() => {
      const arr = inFlightRef.current[filePath];
      if (arr) {
        inFlightRef.current[filePath] = arr.filter((it: CancelablePromise<any>) => it !== p);
        if (inFlightRef.current[filePath].length === 0) delete inFlightRef.current[filePath];
      }
    });
    return p;
  };

  /**
   * User-land type guard that checks whether the supplied value looks like a
   * `CancelablePromise`. We can’t rely on the compile-time type here because
   * callers might push plain Promises into the tracking map by mistake.
   */
  function isCancelablePromise<T>(value: unknown): value is CancelablePromise<T> {
    return (
      typeof value === "object" &&
      value !== null &&
      // `cancel` is the distinguishing feature we care about.
      typeof (value as { cancel?: unknown }).cancel === "function"
    );
  }

  const cancelInFlight = (filePath: string) => {
    inFlightRef.current[filePath]?.forEach(p => {
      try {
        if (isCancelablePromise(p)) {
          p.cancel();
          // Swallow the rejection that `CancelablePromise` will raise once
          // `cancel()` is called. This prevents unhandled-rejection warnings in
          // the console while still allowing individual requests to attach their
          // own error handlers.
          p.catch(() => { });
        }
      } catch {
        /* noop – cancellation errors are non-fatal */
      }
    });
    delete inFlightRef.current[filePath];
  };

  // Wizard / UI state
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [selectedForm, setSelectedForm] = useState<string | undefined>();
  const [isInteractive, setIsInteractive] = useState<boolean>(false);
  const [contextDir, setContextDir] = useState<DirWFilePaths | undefined>();
  const [contextKeys, setContextKeys] = useState<string[]>([]);
  const [contextExtracted, setContextExtracted] = useState<boolean>(false);

  // Processing jobs state
  const [processingJobs, setProcessingJobs] = useState<FormProcessingJob[]>([]);
  const [viewerKey, setViewerKey] = useState<number>(0);

  // Processing job management functions
  const addProcessingJob = (filePath: string) => {
    const newJob: FormProcessingJob = {
      filePath,
      fillEntries: [],
      missingKeys: [],
      changedLines: [],
      formText: "",
      fillPattern: undefined,
      filledCheckbox: [],
      tooComplexForm: false,
      isProcessing: true,
      isCompleted: false,
      processingError: undefined,
      outputPath: undefined,
    };
    setProcessingJobs(prev => [...prev, newJob]);
  };

  const onSelectForm = (path?: string) => {
    setSelectedForm(path);
    if (path) {
      DefaultService.apiIsInteractivePdfIsInteractivePost({
        form_path: path
      }).then(({ is_interactive }) => {
        setIsInteractive(is_interactive);
      })
    }
  }

  const removeProcessingJob = (filePath: string) => {
    cancelInFlight(filePath);
    setProcessingJobs(prev => {
      // Decide if we need to cancel: only when the job is *not* completed
      const jobToRemove = prev.find(j => j.filePath === filePath);
      if (jobToRemove && !jobToRemove.isCompleted) {
        // Fire-and-forget cancellation request to backend
        DefaultService.apiCancelFormFormCancelPost({ form_path: filePath }).catch(() => {
          /* network failure is non-fatal for client */
        });
      }

      const newJobs = prev.filter(job => job.filePath !== filePath);

      // If the removed form was the selected form, auto-select the first available form
      if (selectedForm === filePath && newJobs.length > 0) {
        const firstAvailableForm = newJobs[0].filePath;
        setSelectedForm(firstAvailableForm);
      } else if (selectedForm === filePath && newJobs.length === 0) {
        // No forms left, clear selection
        setSelectedForm(undefined);
      }

      return newJobs;
    });
  };

  const updateProcessingJob = (filePath: string, updates: Partial<FormProcessingJob>) => {
    setProcessingJobs(prev =>
      prev.map(job =>
        job.filePath === filePath ? { ...job, ...updates } : job
      )
    );
  };

  const value: FormFillerContextType = {
    currentStep,
    setCurrentStep,
    selectedForm,
    contextDir,
    setContextDir,
    contextKeys,
    setContextKeys,
    contextExtracted,
    setContextExtracted,
    processingJobs,
    setProcessingJobs,
    addProcessingJob,
    removeProcessingJob,
    updateProcessingJob,
    wrapRequest,
    viewerKey,
    setViewerKey,
    isInteractive,
    onSelectForm
  };

  return (
    <FormFillerContext.Provider value={value}>
      {children}
    </FormFillerContext.Provider>
  );
};

export const useFormFillerContext = () => {
  const ctx = useContext(FormFillerContext);
  if (ctx === undefined) {
    throw new Error(
      "useFormFillerContext must be used within a FormFillerProvider"
    );
  }
  return ctx;
};
