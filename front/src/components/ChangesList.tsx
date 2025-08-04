"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Edit3,
  Check,
  X,
} from "lucide-react";
import React from "react";

interface ChangesListProps {
  changes: ChangeLine[];
  onUpdateChange: (changeId: number, newValue: string) => void;
}

export default function ChangesList({
  changes,
  onUpdateChange,
}: ChangesListProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  const highlightDifferences = (original: string, filled: string) => {
    return (
      <div className="space-y-2">
        <div className="text-sm">
          <span className="font-medium text-foreground">Original:</span>
          <div className="mt-1 max-h-32 overflow-y-auto rounded bg-muted p-2 font-mono text-sm">
            {original}
          </div>
        </div>
        <div className="text-sm">
          <span className="font-medium text-foreground">Filled:</span>
          <div className="mt-1 max-h-32 overflow-y-auto rounded bg-accent p-2 font-mono text-sm">
            {filled}
          </div>
        </div>
      </div>
    );
  };

  const startEdit = (change: ChangeLine) => {
    setEditingId(change.id);
    setEditValue(change.filledLine);
  };

  const saveEdit = (changeId: number) => {
    onUpdateChange(changeId, editValue);
    setEditingId(null);
    setEditValue("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue("");
  };

  if (changes.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <Edit3 className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
        <p>No changes detected yet</p>
        <p className="text-sm">Process your form to see AI-generated changes</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {changes.map((change) => (
        <div
          key={change.id}
          id={`change-${change.id}`}
          className="space-y-3 rounded-lg border p-4 transition-all duration-300"
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => startEdit(change)}
                className="h-8 w-8 p-0"
              >
                <Edit3 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Content */}
          {editingId === change.id ? (
            <div className="space-y-3">
              <div className="text-sm">
                <span className="font-medium text-foreground">Original:</span>
                <div className="mt-1 max-h-32 overflow-y-auto rounded bg-muted p-2 font-mono text-sm">
                  {change.originalLine}
                </div>
              </div>
              <div className="text-sm">
                <span className="font-medium text-foreground">
                  Edit filled value:
                </span>
                <Textarea
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="mt-1 font-mono text-sm"
                  rows={3}
                />
              </div>
              <div className="flex space-x-2">
                <Button size="sm" onClick={() => saveEdit(change.id)}>
                  <Check className="mr-1 h-4 w-4" />
                  Save
                </Button>
                <Button variant="outline" size="sm" onClick={cancelEdit}>
                  <X className="mr-1 h-4 w-4" />
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            highlightDifferences(change.originalLine, change.filledLine)
          )}
        </div>
      ))}
    </div>
  );
}
