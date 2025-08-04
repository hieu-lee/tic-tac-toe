import React, { type ReactNode } from "react";

interface DragWindowRegionProps {
  title?: ReactNode;
}

export default function DragWindowRegion({ title }: DragWindowRegionProps) {
  return (
    <div className="flex w-screen items-center justify-center">
      <div className="draglayer">
        {title && (
          <div className="flex flex-1 select-none whitespace-nowrap p-2 text-xs text-muted-foreground justify-center">
            {title}
          </div>
        )}
      </div>
    </div>
  );
}

