import React from "react";
import DragWindowRegion from "@/components/DragWindowRegion";
import NavigationMenu from "@/components/template/NavigationMenu";
import { APP_NAME } from "@/const";

export default function BaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <DragWindowRegion title={APP_NAME} />
      <NavigationMenu />
      <main className="h-screen pb-20 p-2">{children}</main>
    </>
  );
}
