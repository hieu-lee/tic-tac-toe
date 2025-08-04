import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { useTranslation } from "react-i18next";
import "./localization/i18n";
import { updateAppLanguage } from "./helpers/language_helpers";
import { router } from "./routes/router";
import { RouterProvider } from "@tanstack/react-router";
import { BACKEND_URL } from "./const";
import { Toaster } from "@/components/ui/sonner";
import { OpenAPI } from "@/client/core/OpenAPI";
import { syncThemeWithLocal } from "@/helpers/theme_helpers";

export default function App() {
  const { i18n } = useTranslation();
  const [isHealthy, setIsHealthy] = useState(false);

  useEffect(() => {
    syncThemeWithLocal();
    updateAppLanguage(i18n);

    const checkHealth = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/health`);
        if (response.status === 200) {
          setIsHealthy(true);
        } else {
          throw new Error("Service not healthy");
        }
      } catch (error) {
        console.log("Health check failed, retrying...");
        setTimeout(checkHealth, 3000); // Retry after 1 second
      }
    };

    checkHealth();
  }, [i18n]);

  if (!isHealthy) {
    return <div>Loading...</div>; // Show a loading screen until the service is healthy
  }

  // OpenAPI config
  OpenAPI.BASE = BACKEND_URL;

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
