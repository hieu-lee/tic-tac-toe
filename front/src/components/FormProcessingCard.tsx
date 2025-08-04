import React from 'react';
import { Button } from "@/components/ui/button";
import { previewFile } from '@/helpers/form_helpers';
import { Loader2, Check, Trash2, AlertCircle } from 'lucide-react';

export function FormProcessingCard({ 
  path, 
  isSelected, 
  onSelect,
  isProcessing = false,
  isCompleted = false,
  processingError,
  onRemove
}: { 
  path: string;
  isSelected?: boolean;
  onSelect?: () => void;
  isProcessing?: boolean;
  isCompleted?: boolean;
  processingError?: string;
  onRemove?: () => void;
}) {
  const getStatusIcon = () => {
    if (processingError) {
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    }
    if (isProcessing) {
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    }
    if (isCompleted) {
      return <Check className="h-4 w-4 text-green-500" />;
    }
    return null;
  };

  const getStatusText = () => {
    if (processingError) {
      return "Processing failed";
    }
    if (isProcessing) {
      return "Processing...";
    }
    if (isCompleted) {
      return "Completed";
    }
    return "Pending";
  };

  return (
    <div 
      className={`flex items-center rounded-lg border p-4 transition-colors ${
        isSelected 
          ? 'border-green-500 bg-green-50 dark:bg-green-900/20' 
          : 'border-border hover:border-accent'
      }`}
    >
      {/* Red bin icon on the left */}
      <div className="mr-3">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
          onClick={(e) => {
            e.stopPropagation();
            onRemove?.();
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Main content area - clickable for selection */}
      <div 
        className="flex-1 cursor-pointer"
        onClick={onSelect}
      >
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-foreground">
                {path.split('/').pop()}
              </h3>
              {getStatusIcon()}
            </div>
            <p className="text-sm text-muted-foreground">
              {path}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {getStatusText()}
            </p>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="ml-3">
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            previewFile(path);
          }}
        >
          Open
        </Button>
      </div>
    </div>
  )
}
