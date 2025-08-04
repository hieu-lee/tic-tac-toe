/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Request payload for filling an *interactive* PDF form (AcroForm text widgets).
 *
 * The backend will automatically map each text field to the best matching
 * context key and populate the field with the associated value.  If the PDF
 * does **not** contain any interactive widgets, the request will fail – use
 * ``FillPdfDynamicRequest`` instead for the generic (interactive *or* flat)
 * auto-fill endpoint.
 */
export type FillInteractivePdfRequest = {
    form_path: string;
    context_dir: string;
    provider?: ('openai' | 'groq' | 'google' | 'anythingllm' | 'local' | 'ollama' | null);
    output_path?: (string | null);
};

