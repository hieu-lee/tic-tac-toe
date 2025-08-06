import React, { useEffect, useState } from "react";
import DragWindowRegion from "@/components/DragWindowRegion";
import NavigationMenu from "@/components/template/NavigationMenu";
import { APP_NAME, BACKEND_URL } from "@/const";
import { syncThemeWithLocal } from "@/helpers/theme_helpers";

export default function BaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isHealthy, setIsHealthy] = useState(false);

  useEffect(() => {
    syncThemeWithLocal();

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
        setTimeout(checkHealth, 2000);
      }
    };

    checkHealth();
  }, []);

  return (
    <>
      <DragWindowRegion title={APP_NAME} />
      <NavigationMenu />
      {isHealthy ? (
        <>
          <main className="h-screen pb-20 p-2">{children}</main>
        </>
      ) : (
        <div className="flex items-center justify-center h-screen">
          <div className="text-6xl font-bold text-gray-400 animate-pulse">
            LOADING ...
          </div>
        </div>
      )}

    </>
  );
}
