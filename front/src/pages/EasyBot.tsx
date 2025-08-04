import React from "react";
import { useFormFillerContext } from "@/contexts/FormFillerContext";
import Chat from "@/components/Chat";

export default function EasyBot() {
  const {
    contextDir,
    selectedForm,
    setSelectedForm,
    processingJobs,
    contextKeys,
    setContextKeys
  } = useFormFillerContext();
  return <Chat
    contextDir={contextDir}
    contextKeys={contextKeys}
    setContextKeys={setContextKeys}
    selectedForm={selectedForm}
    setSelectedForm={setSelectedForm}
    processingJobs={processingJobs}
  ></Chat>
}
