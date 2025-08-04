/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CheckboxEntrySchema } from './CheckboxEntrySchema';
import type { FillEntrySchema } from './FillEntrySchema';
/**
 * Request payload for /docx/fill endpoint. All placeholder detection must have been done client-side.
 * We simply receive the pre-computed fill entries and checkbox entries along with paths.
 */
export type FillDocxRequest = {
    fill_entries: Array<FillEntrySchema>;
    checkbox_entries: Array<CheckboxEntrySchema>;
    form_path: string;
    output_path?: (string | null);
};

