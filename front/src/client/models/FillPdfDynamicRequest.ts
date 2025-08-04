/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Request payload for auto-filling a PDF (interactive or flat).
 *
 * • *keys* – list of **available** context keys (read from the frontend)
 * which helps the LLM when the file is a flat PDF without structured
 * widgets.
 * • *pattern* – regex pattern string that matches the placeholder style used
 * in the flat PDF variant (ignored for interactive PDFs).
 */
export type FillPdfDynamicRequest = {
    keys: Array<string>;
    form_path: string;
    context_dir: string;
    pattern: string;
    provider?: ('openai' | 'groq' | 'google' | 'anythingllm' | 'local' | 'ollama' | null);
    output_path?: (string | null);
};

