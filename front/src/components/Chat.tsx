import React, { useEffect, useState, useRef, useCallback, Dispatch, SetStateAction, ChangeEvent } from "react";
import ReactMarkdown from "react-markdown";
import { FormProcessingJob } from "@/contexts/FormFillerContext";
import {
  Card,
  CardHeader,
  CardContent,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { DefaultService } from "@/client";
import {
  Plus,
  Trash2,
  Send,
  FileText,
  PanelLeft,
  X as XIcon,
  Image as ImageIcon
} from "lucide-react";
import { toast } from "sonner";
import { DEFAULT_PROVIDER } from "@/const";
import SmallFormSelector from "@/components/SmallFormSelector";
import ChatImage from "./ChatImage";
import ImagePreview from "./ImagePreview";
import FullScreenFormModal from "./FullScreenFormModal";
import { useSlashCommand } from "@/hooks/useSlashCommand";
import SuggestionsList from "@/components/SuggestionsList";

interface ChatSession {
  id: string;
  name: string;
  created_at: string;
  messages: { role: "user" | "assistant"; content: string; image_path?: string }[];
  context_dir?: string | null;
}

type ChatProps = {
  contextDir: DirWFilePaths | undefined
  contextKeys: string[]
  setContextKeys: Dispatch<SetStateAction<string[]>>;
  selectedForm: string | undefined
  processingJobs: FormProcessingJob[]
  onSelectForm: (path?: string) => void;
}

export default function Chat(
  {
    contextDir,
    contextKeys,
    setContextKeys,
    selectedForm,
    processingJobs,
    onSelectForm
  }: ChatProps
) {

  // Sidebar (sessions list) visibility
  // On mobile (<640px) the sidebar starts collapsed, on larger screens it is visible by default
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [userInput, setUserInput] = useState<string>("");

  /* Image attachment state */
  const [attachedImage, setAttachedImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  const attachImage = (file: File) => {
    if (!file || !file.type.startsWith("image/")) {
      toast("Only image files are supported");
      return;
    }
    // Revoke previous preview to avoid memory leaks
    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
    setAttachedImage(file);
    setImagePreviewUrl(URL.createObjectURL(file));
  };

  const removeAttachedImage = () => {
    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
    setAttachedImage(null);
    setImagePreviewUrl(null);
  };
  // Indicates whether the assistant is currently generating a response
  const [isAssistantTyping, setIsAssistantTyping] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newSessionName, setNewSessionName] = useState("");
  // Modal state for displaying the currently selected form
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);

  // Slash command functionality
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Get contextKeys from the selected form's processing job
  const slashCommand = useSlashCommand(textareaRef as React.RefObject<HTMLInputElement | HTMLTextAreaElement>, contextKeys);

  const selectedSession = sessions.find((s) => s.id === selectedSessionId) || null;

  const scrollToBottom = () => {
    // defer to allow DOM update
    setTimeout(() => {
      const el = messagesContainerRef.current;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    }, 50);
  };

  // Fetch sessions on mount
  useEffect(() => {
    refreshSessions();
  }, []);

  // Load context keys if contextDir exists but contextKeys is empty
  useEffect(() => {
    const loadContextKeys = async () => {
      if (contextDir && contextKeys.length === 0) {
        try {
          const { context } = await DefaultService.apiReadContextContextReadPost({
            context_dir: contextDir.path,
          });
          setContextKeys(context ? Object.keys(context) : []);
        } catch (error) {
          console.error("Failed to load context keys:", error);
        }
      }
    };
    loadContextKeys();
  }, [contextDir]);

  const refreshSessions = async () => {
    try {
      const { sessions } = await DefaultService.apiListChatSessionsChatSessionsListPost();
      setSessions(sessions as unknown as ChatSession[]);
    } catch (error) {
      console.error("Failed to fetch sessions", error);
      toast("Failed to fetch sessions");
    }
  };

  const createNewSession = async (name?: string) => {
    if (!contextDir) {
      toast("Select a context folder first in the Form wizard!");
      return;
    }
    try {
      const { session } = await DefaultService.apiCreateChatSessionChatSessionsCreatePost({
        context_dir: contextDir.path,
        name: name && name.trim() ? name.trim() : undefined,
      });
      setSessions((prev) => [...prev, session as unknown as ChatSession]);
      setSelectedSessionId(session.id);
      toast("Session created");
    } catch (error) {
      console.error("Failed to create session", error);
      toast("Failed to create session");
    }
  };

  const deleteSession = async (sessionId: string) => {
    try {
      await DefaultService.apiDeleteChatSessionChatSessionsDeletePost({
        context_dir: "", // backend ignores for deletion
        session_id: sessionId,
      });
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (selectedSessionId === sessionId) {
        setSelectedSessionId(null);
      }
    } catch (error) {
      console.error("Failed to delete session", error);
      toast("Failed to delete session");
    }
  };

  const sendMessage = async () => {
    if (!selectedSessionId) {
      toast("Select or create a session first");
      return;
    }

    const messageText = slashCommand.currentInput || userInput;
    if (!messageText.trim() && !attachedImage) return;

    const pendingText = messageText;
    setUserInput("");
    slashCommand.setCurrentInput("");

    let savedImagePath: string | undefined = undefined;

    if (attachedImage) {
      try {
        const dataUrl: string = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(attachedImage);
        });

        savedImagePath = await window.easyFormContext.saveImage(dataUrl);
      } catch (error) {
        console.error("Failed to save image", error);
        toast("Failed to attach image");
      } finally {
        removeAttachedImage();
      }
    }

    // Show typing indicator while waiting for backend response
    setIsAssistantTyping(true);

    // Optimistically add user message
    setSessions((prev) =>
      prev.map((s) =>
        s.id === selectedSessionId
          ? {
            ...s,
            messages: [
              ...s.messages,
              {
                role: "user",
                content: pendingText,
                image_path: savedImagePath,
              },
            ],
          }
          : s
      )
    );

    scrollToBottom();

    try {
      // Ensure backend session is up-to-date with context directory
      if (contextDir) {
        try {
          await DefaultService.apiUpdateChatSessionContextDirChatSessionsUpdateContextDirPost({
            session_id: selectedSessionId,
            new_context_dir: contextDir.path,
          });
        } catch (err) {
          console.warn("Failed to sync context dir:", err);
        }
      }

      // Sync form paths (currently single element but future-proof for multiple)
      if (selectedForm && selectedForm.length > 0) {
        try {
          await DefaultService.apiUpdateChatSessionFormPathsChatSessionsUpdateFormPathsPost({
            session_id: selectedSessionId,
            form_paths: [selectedForm],
          });
        } catch (err) {
          console.warn("Failed to sync form paths:", err);
        }
      }

      // Finally send the chat message
      const { session } = await DefaultService.apiSendChatMessageChatMessagesSendPost({
        context_dir: contextDir?.path ?? "",
        session_id: selectedSessionId,
        user_input: pendingText,
        provider: DEFAULT_PROVIDER,
        image_path: savedImagePath,
      });

      // Update contextKeys in case message update a key
      const { context } = await DefaultService.apiReadContextContextReadPost({
        context_dir: contextDir?.path ?? "",
      })

      setContextKeys(context ? Object.keys(context) : []);

      // Update messages with assistant response and any new info from backend
      setSessions((prev) =>
        prev.map((s) => (s.id === selectedSessionId ? (session as unknown as ChatSession) : s))
      );
    } catch (error) {
      console.error("Failed to send message", error);
      toast("Failed to send message");
    } finally {
      // Hide typing indicator regardless of success or failure
      setIsAssistantTyping(false);
      scrollToBottom();
    }
  };

  // Handle Enter key in chat textarea (send message) and Shift+Enter to insert newline
  const handleChatKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage]
  );

  // Handle paste events for images
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (e.clipboardData.files && e.clipboardData.files.length > 0) {
      const file = e.clipboardData.files[0];
      attachImage(file);
      e.preventDefault();
    }
  };

  // Handle drag & drop
  const handleDrop = (e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      attachImage(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const onFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      attachImage(e.target.files[0]);
    }
  };

  // ChatImage component moved to separate file for memoization

  return (
    <div className="h-full flex gap-4 overflow-hidden relative">
      {/* Sessions Sidebar */}
      <Card
        className={`
          fixed sm:static inset-y-0 left-0 z-40
          ${isCollapsed ? "w-4/5 sm:w-0" : "w-4/5 sm:w-80"}
          flex flex-col py-0 gap-0
          transition-all duration-300 ease-in-out
          ${isCollapsed ? "-translate-x-full sm:translate-x-0" : "translate-x-0"}
          ${isCollapsed ? "sm:min-w-0 sm:overflow-hidden" : ""}
        `}
      >
        <CardHeader className="flex items-center justify-between [.border-b]:pb-2 py-2">
          <CardTitle className="text-lg">Sessions</CardTitle>
          <Button
            size="icon"
            variant="outline"
            onClick={() => setIsCreateDialogOpen(true)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto p-0">
          {sessions.length === 0 && (
            <p className="text-muted-foreground px-4 py-2">No sessions yet</p>
          )}
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`flex items-center justify-between px-4 py-2 border-b hover:bg-accent cursor-pointer ${selectedSessionId === s.id ? "bg-accent" : ""}`}
              onClick={() => {
                setSelectedSessionId(s.id);
                if (window.innerWidth < 640) {
                  // Auto-collapse after choosing a session on mobile
                  setIsCollapsed(true);
                }
              }}
            >
              <div className="flex-1">
                <p className="font-medium truncate">{s.name || "Session"}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {new Date(s.created_at).toLocaleString()}
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteSession(s.id);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Mobile overlay to close sidebar when tapping outside */}
      {!isCollapsed && (
        <div
          className="fixed inset-y-0 left-[80%] right-0 z-30 sm:hidden"
          onClick={() => setIsCollapsed(true)}
        />
      )}

      {/* Chat Panel */}
      <Card className="flex-1 flex flex-col py-0 gap-0">
        <CardHeader className="flex items-center justify-between space-y-0 [.border-b]:pb-2 py-2">
          <CardTitle className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setIsCollapsed(!isCollapsed)}
              title="Toggle sessions"
            >
              <PanelLeft className="h-4 w-4" />
            </Button>
            {selectedSession ? selectedSession.name || "Chat" : "Select a session"}
          </CardTitle>
          <div className="flex items-center gap-2">
            <SmallFormSelector
              selectedForm={selectedForm}
              processingJobs={processingJobs}
              placeholder="Select form"
              onFormSelect={(value) => {
                onSelectForm(value);
              }}
            />
            {selectedForm && selectedForm.length > 0 && selectedSessionId && (
              <Button
                variant="outline"
                onClick={() => setIsFormModalOpen(true)}
                title="Open current form"
              >
                <FileText className="h-4 w-4 mr-2" />
                Current Form
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col overflow-hidden p-0">
          {/* Messages */}
          <div
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto px-6 py-4 space-y-4"
          >
            {selectedSession ? (
              <>
                {selectedSession.messages.map((m, idx) => (
                  <div
                    key={idx}
                    className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[75%] rounded-lg px-4 py-2 text-sm whitespace-pre-wrap ${m.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-none"
                        : "bg-muted text-muted-foreground rounded-bl-none"
                        }`}
                    >
                      {m.content && (
                        m.role === "assistant" ? (
                          <ReactMarkdown className="prose prose-sm dark:prose-invert max-w-none">
                            {m.content}
                          </ReactMarkdown>
                        ) : (
                          m.content
                        )
                      )}
                      {m.image_path && <ChatImage path={m.image_path} />}
                    </div>
                  </div>
                ))}

                {/* Typing indicator */}
                {isAssistantTyping && (
                  <div className="flex justify-start">
                    <div className="max-w-[75%] rounded-lg px-4 py-2 text-sm bg-muted text-muted-foreground rounded-bl-none flex items-center space-x-1">
                      <span className="block w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0s" }} />
                      <span className="block w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
                      <span className="block w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.4s" }} />
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">Choose a session to start chatting.</p>
            )}
            {/* dummy spacer for scroll height */}
            <div style={{ height: 1 }} />
          </div>

          {/* Input */}
          {selectedSession && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage();
              }}
              className="border-t px-4 py-3 flex items-end gap-2"
            >
              <div className="flex-1 flex flex-col gap-2">
                {imagePreviewUrl && (
                  <div className="relative w-24 h-24">
                    <ImagePreview
                      src={imagePreviewUrl}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={removeAttachedImage}
                      className="absolute top-1 right-1 bg-black/60 rounded-full p-1 text-white"
                    >
                      <XIcon className="h-3 w-3" />
                    </button>
                  </div>
                )}
                <div className="relative">
                  <Textarea
                    ref={textareaRef}
                    value={slashCommand.currentInput || userInput}
                    onChange={(e) => {
                      if (e.target.value.startsWith('/')) {
                        slashCommand.handleInputChange(e);
                      } else {
                        setUserInput(e.target.value);
                        slashCommand.setCurrentInput('');
                      }
                    }}
                    onKeyDown={(e) => {
                      if (slashCommand.showSuggestions) {
                        slashCommand.handleKeyDown(e);
                      } else {
                        handleChatKeyDown(e);
                      }
                    }}
                    onPaste={handlePaste}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    className="flex-1 resize-none min-h-10 max-h-32"
                    placeholder="Ask anything or / for commands"
                  />
                  <SuggestionsList
                    suggestions={slashCommand.suggestions}
                    visible={slashCommand.showSuggestions}
                    selectedIndex={slashCommand.selectedSuggestion}
                    onSelect={slashCommand.applySuggestion}
                  />
                </div>
              </div>
              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                onChange={onFileInputChange}
                hidden
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                title="Attach image"
              >
                <ImageIcon className="h-4 w-4" />
              </Button>
              <Button type="submit" disabled={!((slashCommand.currentInput || userInput).trim()) && !attachedImage}>
                <Send className="h-4 w-4 mr-1" /> Send
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Create Session Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Chat Session</DialogTitle>
            <DialogDescription>Give your session an optional name.</DialogDescription>
          </DialogHeader>
          <Input
            value={newSessionName}
            onChange={(e) => setNewSessionName(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                await createNewSession(newSessionName);
                setIsCreateDialogOpen(false);
                setNewSessionName("");
              }
            }}
            placeholder="Session name (optional)"
          />
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setIsCreateDialogOpen(false);
                setNewSessionName("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                await createNewSession(newSessionName);
                setIsCreateDialogOpen(false);
                setNewSessionName("");
              }}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Full screen form modal */}
      {isFormModalOpen && selectedForm && (
        <FullScreenFormModal
          formPath={selectedForm}
          onClose={() => setIsFormModalOpen(false)}
          onImageCaptured={(file) => {
            // reuse attachImage logic to set preview etc.
            attachImage(file);
            setIsFormModalOpen(false);
            // focus textarea for user convenience
            textareaRef.current?.focus();
          }}
        />
      )}
    </div>
  );
} 
