import React, { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
// This doesn't work
// import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";
import logoLight from "@/assets/logos/framed_easyform_logo_light.png";
import logoDark from "@/assets/logos/framed_easyform_logo_dark.png";
import {
  NavigationMenu as NavigationMenuBase,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "../ui/navigation-menu";
import ToggleTheme from "@/components/ToggleTheme";
import { useFormFillerContext } from "@/contexts/FormFillerContext";

export default function NavigationMenu() {
  const { t } = useTranslation();
  const { currentStep, contextExtracted } = useFormFillerContext();
  const [isDark, setIsDark] = useState(document.documentElement.classList.contains('dark'));

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });
    
    return () => observer.disconnect();
  }, []);

  return (
    <div className="relative w-full px-2 font-mono text-muted-foreground flex items-center">
      <div className="flex items-center">
        <img 
          src={isDark ? logoDark : logoLight}
          alt="EasyForm Logo" 
          className="h-8 w-auto"
        />
      </div>
      {/* Centered navigation tabs */}
      <div className="absolute inset-0 flex items-center justify-center">
        <NavigationMenuBase>
          <NavigationMenuList className="gap-2">
            <NavigationMenuItem>
              <NavigationMenuLink asChild className={navigationMenuTriggerStyle()}>
                <Link to="/">{t("titleHomePage")}</Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem
              className={`transition-all duration-500 ease-out ${contextExtracted
                  ? 'opacity-100 translate-x-0 scale-100'
                  : 'opacity-0 translate-x-4 scale-95 pointer-events-none'
                }`}
              style={{
                transformOrigin: 'left center'
              }}
            >
              <NavigationMenuLink
                asChild
                className={`${navigationMenuTriggerStyle()} transition-all duration-300`}
              >
                <Link to="/bot">EasyBot</Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenuBase>
      </div>

      {/* Theme toggle positioned on the right */}
      <div className="ml-auto relative z-10">
        <ToggleTheme />
      </div>
    </div>
  );
}
