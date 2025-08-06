import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { useTranslation } from "react-i18next";
import "./localization/i18n";
import { updateAppLanguage } from "./helpers/language_helpers";
import { router } from "./routes/router";
import { RouterProvider } from "@tanstack/react-router";
import { BACKEND_URL } from "./const";
import { Toaster } from "@/components/ui/sonner";
import { OpenAPI } from "@/client/core/OpenAPI";

export default function App() {
  // OpenAPI config
  OpenAPI.BASE = BACKEND_URL;

  const { i18n } = useTranslation();

  useEffect(() => {
    updateAppLanguage(i18n);
  }, [i18n]);

  return <>
    <RouterProvider router={router} />
    <Toaster
      duration={1500}
      closeButton={true}
    />
  </>;
}

const root = createRoot(document.getElementById("app")!);
root.render(
  <App />
);
