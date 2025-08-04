import React from "react";
import { Check, Clock } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ProcessingJob {
  filePath: string;
  isCompleted: boolean;
  isProcessing?: boolean;
  tooComplexForm?: boolean;
}

interface SmallFormSelectorProps {
  selectedForm: string | undefined;
  processingJobs: ProcessingJob[];
  onFormSelect: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export default function SmallFormSelector({
  selectedForm,
  processingJobs,
  onFormSelect,
  placeholder = "Select form",
  className = ""
}: SmallFormSelectorProps) {
  if (processingJobs.length === 0) {
    return null;
  }

  return (
    <Select
      value={selectedForm || ""}
      onValueChange={onFormSelect}
    >
      <SelectTrigger className={`h-9 w-[200px] text-sm ${className}`}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {processingJobs.map((job) => {

          return (
            <SelectItem
              key={job.filePath}
              value={job.filePath}
              disabled={!job.isCompleted}
            >
              <div className="flex items-center gap-2 text-sm">
                {!job.isCompleted ? (
                  <Clock className="h-3 w-3 text-blue-500 animate-pulse" />
                ) : (<Check className="h-3 w-3 text-green-500" />)
                }
                <span className={!job.isCompleted ? "text-muted-foreground" : ""}>
                  {job.filePath.split('/').pop()}
                </span>
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
