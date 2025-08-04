import React from "react";
import { Check, Clock } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  fillEntries?: any;
  missingKeys?: any;
  changedLines?: any;
  formText?: string;
  fillPattern?: string;
  filledCheckbox?: any;
  outputPath?: string;
}

interface FormSelectionCardProps {
  title: string;
  description: string;
  selectedForm: string | undefined;
  processingJobs: ProcessingJob[];
  onFormSelect: (value: string) => void;
  placeholder?: string;
}

export default function FormSelectionCard({
  title,
  description,
  selectedForm,
  processingJobs,
  onFormSelect,
  placeholder = "Select a form"
}: FormSelectionCardProps) {
  return (
    <Card>
      {(title || description) && (
        <CardHeader>
          {title && <CardTitle>{title}</CardTitle>}
          {description && (
            <CardDescription>
              {description}
            </CardDescription>
          )}
        </CardHeader>
      )}
      <CardContent>
        <Select
          value={selectedForm || ""}
          onValueChange={onFormSelect}
        >
          <SelectTrigger className="w-full">
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
                  <div className="flex items-center gap-2">
                    {job.isCompleted && (
                      <Check className="h-4 w-4 text-green-500" />
                    )}
                    {!job.isCompleted && (
                      <Clock className="h-4 w-4 text-blue-500 animate-pulse" />
                    )}
                    <span className={!job.isCompleted ? "text-muted-foreground" : ""}>
                      {job.filePath.split('/').pop()}
                    </span>
                    {!job.isCompleted && (
                      <span className="text-xs text-muted-foreground ml-auto">Processing...</span>
                    )}
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  );
}
