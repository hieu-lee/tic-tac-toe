import React from "react";
import BaseLayout from "@/layouts/BaseLayout";
import { Outlet, createRootRoute } from "@tanstack/react-router";
import { FormFillerProvider } from "@/contexts/FormFillerContext";

export const RootRoute = createRootRoute({
  component: Root,
});

function Root() {
  return (
    <FormFillerProvider>
      <BaseLayout>
        <Outlet />
      </BaseLayout>
    </FormFillerProvider>
  );
}
