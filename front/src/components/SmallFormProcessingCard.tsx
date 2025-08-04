import React from 'react';
import { Button } from "@/components/ui/button";
import { previewFile } from '@/helpers/form_helpers';
import { Loader2, Check, Trash2, AlertCircle, FileText, ExternalLink } from 'lucide-react';

export function SmallFormProcessingCard({
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
      return <AlertCircle className="h-3.5 w-3.5 text-red-500" />;
    }
    if (isProcessing) {
      return <Loader2 className="h-3.5 w-3.5 text-blue-600 animate-spin" />;
    }
    if (isCompleted) {
      return <Check className="h-3.5 w-3.5 text-green-600" />;
    }
    return <div className="h-3.5 w-3.5 rounded-full bg-gray-300" />;
  };

  const getStatusText = () => {
    if (processingError) {
      return { text: "Failed", className: "text-re-600 bg-red-50" };
    }
    if (isProcessing) {
      return { text: "Processing", className: "text-blue-600 bg-blue-50" };
    }
    if (isCompleted) {
      return { text: "Completed", className: "text-green-600 bg-green-50" };
    }
    return { text: "Pending", className: "text-gray-600 bg-gray-100" };
  };

  const status = getStatusText();

  return (
    <div
      className={`relative group rounded-lg border transition-all duration-200 overflow-hidden ${isSelected
        ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
        : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
        }`}
    >
      <div className="flex items-center p-3">
        {/* Main content area - clickable for selection */}
        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={onSelect}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <h3 className="font-medium text-sm truncate">
                  {path.split('/').pop()}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  {getStatusIcon()}
                  <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${status.className}`}>
                    {status.text}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action buttons - absolute positioned overlay */}
      <div className="
        absolute top-1/2 right-3 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300 ease-in-out transform translate-x-2 group-hover:translate-x-0">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 bg-white dark:bg-black hover:text-blue-600 hover:bg-blue-50 transition-all duration-200 border border-gray-200"
          onClick={(e) => {
            e.stopPropagation();
            previewFile(path);
          }}
          title="Open file"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 bg-white dark:bg-black hover:text-red-600 hover:bg-red-50 transition-all duration-200 border border-gray-200"
          onClick={(e) => {
            e.stopPropagation();
            onRemove?.();
          }}
          title="Remove file"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
