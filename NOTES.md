# Backend

- [Entries](https://github.com/hieu-lee/we-got-this/blob/d54e8c9e10f3f4a8390ae5a4b8acc191ee1956ae/back/api.py#L29-L29)
  are **scoped so that it provide enough context
  for LLM to correctly fill the all placeholders in `lines`.**

- `POST /docx/fill and /pdf/fill` only works with all entries in the payload
- `POST /context/add` is actually an upsert operation

# Frontend

- Most docx viewer library convert docx to HTML first before viewing.
  This is because behind the scene DOCX files are actually compressed ZIP archives containing XML
  files, images, and other resources.
  - This is demonstrated in some of the most popular HTML doc viewer library ([mammoth.js](https://www.npmjs.com/package/mammoth), [docx-preview](https://www.npmjs.com/package/docx-preview#goal))
