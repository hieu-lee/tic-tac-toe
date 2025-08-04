
"use client"

import React, {
  useState,
  Dispatch,
  SetStateAction
} from "react"
import { Check, ChevronsUpDown } from "lucide-react"

import { cn } from "@/utils/tailwind"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

import { LANGS } from "@/const"

type LanguageComboboxProps = {
  lang: string;
  onLangSelect: Dispatch<SetStateAction<string>>;
}
export function LanguageCombobox(
  {
    lang,
    onLangSelect
  }: LanguageComboboxProps

) {
  const [open, setOpen] = useState<boolean>(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[200px] justify-between"
        >
          {lang
            ? LANGS.find((language) => language === lang)
            : "Select Language"}
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0">
        <Command>
          <CommandInput placeholder="Search language..." className="h-9" />
          <CommandList>
            <CommandEmpty>No Language found.</CommandEmpty>
            <CommandGroup>
              {LANGS.map((language) => (
                <CommandItem
                  key={language}
                  value={language}
                  onSelect={(currentValue) => {
                    onLangSelect(currentValue)
                    setOpen(false)
                  }}
                >
                  {language}
                  <Check
                    className={cn(
                      "ml-auto",
                      lang === language ? "opacity-100" : "opacity-0"
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
