import React from 'react';
import { Button } from "@/components/ui/button";
import { previewFile } from '@/helpers/form_helpers';

export function FilePreviewCard({ path }: { path: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border p-4">
      <div className="flex-1">
        <h3 className="font-medium text-foreground">
          {path.split('/').pop()}
        </h3>
        <p className="text-sm text-muted-foreground">
          {path}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => previewFile(path)}
      >
        Open
      </Button>
    </div>
  )
}
