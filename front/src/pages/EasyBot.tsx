import React from "react";
import { useFormFillerContext } from "@/contexts/FormFillerContext";
import Chat from "@/components/Chat";

export default function EasyBot() {
  const {
    contextDir,
    selectedForm,
    processingJobs,
    contextKeys,
    setContextKeys,
    onSelectForm
  } = useFormFillerContext();
  return <Chat
    contextDir={contextDir}
    contextKeys={contextKeys}
    setContextKeys={setContextKeys}
    selectedForm={selectedForm}
    processingJobs={processingJobs}
    onSelectForm={onSelectForm}
    disableIncompleteForms={false}
  />
}
