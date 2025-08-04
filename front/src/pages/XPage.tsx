import React from "react";
// import ToggleTheme from "@/components/ToggleTheme";
import InitialIcons from "@/components/template/InitialIcons";
import { DialogDemo } from "@/components/x/DialogDemo";
import { toast } from "sonner"
import { Button } from "@/components/ui/button";
import * as pdfjsLib from "pdfjs-dist";

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export default function XPage() {
  const [log, setLog] = React.useState<string>("");
  const [filePath, setFilePath] = React.useState<string | null>(null);
  const [dirPath, setDirPath] = React.useState<string | undefined>(undefined);
  const [pdfWidgets, setPdfWidgets] = React.useState<any[]>([]);

  const extractPdfWidgets = async (file: File) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      console.log(`PDF loaded: ${pdf.numPages} pages`);
      const allWidgets: any[] = [];
      let textFieldCount = 0;

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const annotations = await page.getAnnotations({ intent: "display" });

        const widgets = annotations.filter(
          annotation => annotation.subtype === "Widget");

        widgets.forEach(widget => {
          const widgetInfo = {
            page: pageNum,
            fieldName: widget.fieldName,
            fieldValue: widget.fieldValue || widget.buttonValue || '',
            fieldType: widget.fieldType,
            alternativeText: widget.alternativeText,
            rect: widget.rect,
            subtype: widget.subtype,
            options: widget.options,
            appearanceState: widget.appearanceState,
            checkBox: widget.checkBox,
            radioButton: widget.radioButton,
            multiLine: widget.multiLine,
            password: widget.password,
            combo: widget.combo,
            fileSelect: widget.fileSelect,
            multiSelect: widget.multiSelect,
            doNotScroll: widget.doNotScroll,
            comb: widget.comb,
            richText: widget.richText,
            hasOwnCanvas: widget.hasOwnCanvas,
            readOnly: widget.readOnly,
            required: widget.required,
            exportValue: widget.exportValue,
            defaultValue: widget.defaultValue
          };

          // Check if this is a text field
          const isTextField = widget.fieldType === 'Tx' ||
            (!widget.checkBox && !widget.radioButton && !widget.combo &&
              widget.subtype === 'Widget' && widget.fieldName);

          if (isTextField) {
            textFieldCount++;
            const fieldLabel = widget.alternativeText || widget.fieldName || 'No label';
            console.log(`📝 TEXT FIELD found on page ${pageNum}:`);
            console.log(`  Field Name: ${widget.fieldName}`);
            console.log(`  Field Label: ${fieldLabel}`);
            console.log(`  Field Value: ${widget.fieldValue || '(empty)'}`);
            console.log(`  Field Type: ${widget.fieldType}`);
            console.log(`  Multi-line: ${widget.multiLine}`);
            console.log(`  Password: ${widget.password}`);
            console.log('  ---');
          }

          console.log(`Widget found on page ${pageNum}:`, widgetInfo);
          allWidgets.push(widgetInfo);
        });
      }

      console.log(`Total widgets found: ${allWidgets.length}`);
      console.log(`📝 TEXT FIELDS SUMMARY: Found ${textFieldCount} text fields`);
      console.table(allWidgets);
      setPdfWidgets(allWidgets);
      setLog(`Found ${allWidgets.length} widgets (${textFieldCount} text fields) in PDF`);

    } catch (error) {
      console.error("Error extracting PDF widgets:", error);
      setLog(`Error: ${error}`);
    }
  };

  const handlePdfUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === "application/pdf") {
      extractPdfWidgets(file);
    } else {
      toast("Please select a PDF file");
    }
  };

  return (
    <div className="overflow-y-auto h-full">
      log: {log}
      <br />
      filePath: {filePath}
      <br />
      dirPath: {dirPath}
      <br />
      widgets found: {pdfWidgets.length}
      <div className="flex flex-1 flex-col items-center justify-center gap-2">
        <InitialIcons />
        <DialogDemo />
        {/* <ToggleTheme /> */}
        <div className="flex flex-col gap-2 mb-4">
          <label className="text-sm font-medium">Upload PDF to extract widgets:</label>
          <input
            type="file"
            accept=".pdf"
            onChange={handlePdfUpload}
            className="border rounded px-3 py-2"
          />
        </div>
        <Button onClick={
          async () => await window.xContext.helloWorld()
        }>
          Hello World
        </Button>
        <Button onClick={
          async () => await window.xContext.createFile("Hello World!")
        }>
          Create File
        </Button>
        <Button onClick={
          async () => {
            const stdout = await window.xContext.runBashScript()
            setLog(stdout);
          }
        }>
          Run Bash Script
        </Button>
        <Button onClick={
          async () => {
            const stdout = await window.xContext.runBin()
            setLog(stdout);
          }
        }>
          Run Python Binary
        </Button>
        <Button onClick={
          async () => {
            const path = await window.xContext.selectFile()
            setFilePath(path);
          }
        }>
          Get Absolute File Path
        </Button>
        <Button onClick={
          async () => {
            if (filePath !== null) {
              await window.xContext.openFile(filePath);
            }
          }
        }>
          Preview file
        </Button>
        <Button onClick={
          async () => {
            const dir = await window.xContext.selectDirectory()
            setDirPath(dir?.path);
            console.dir(dir);
          }
        }>
          Select Directory
        </Button>
        <Button onClick={
          async () => {
            toast("UIA")
          }
        }>
          Toast
        </Button>
      </div>
    </div>
  );
}
