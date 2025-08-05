import ISO6391 from 'iso-639-1';

export const APP_NAME = "Easy Form"
export const BACKEND_URL = "http://localhost:8000"
// export const DEFAULT_PROVIDER = "openai";
// TODO: enable this before submission
export const DEFAULT_PROVIDER = "ollama";
export const LOCAL_PROVIDER = "ollama";
export const NO_TRANSLATION = "None"
export const LANGS = [NO_TRANSLATION, ...ISO6391.getAllNames()];
export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
};
