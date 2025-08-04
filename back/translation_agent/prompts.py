from textwrap import dedent

TRANSLATION_PROMPT_TEMPLATE = dedent(
    """
    You are a professional translator.

    Translate the following Markdown document into {language}.  Preserve **all** Markdown
    structure, headings, links, images, code blocks, and inline formatting as-is – only
    translate the *natural language content* (paragraph text, list items, table cell
    contents, figure captions, etc.).  Do **not** translate text inside code blocks or
    URLs.  Do not introduce or remove any content.  The resulting document must remain a
    valid Markdown file that renders identically (apart from the language change).

    Output STRICTLY in JSON (no markdown, **no code fences**) containing exactly one
    key ``markdown`` whose value is the translated Markdown string. **Return the JSON
    object alone – absolutely no additional keys, explanations, or surrounding text.**

    ---------- BEGIN DOCUMENT ----------
    {markdown}
    ---------- END DOCUMENT ------------
"""
)

PARAGRAPH_TRANSLATION_PROMPT_TEMPLATE = dedent(
    """
    You are an expert human translator.

    Your task is to translate **one** paragraph from the source language into {language}.

    Context to preserve coherence:
    • The *previous translated paragraph* is provided – use it for consistency (but do NOT alter it).
    • The *next original paragraph* is provided so you can anticipate upcoming context.

    Translate ONLY the *current paragraph* that is wrapped between <<<CURR>>> markers.
    • Preserve ALL line breaks ("\n") exactly as they appear.
    • Preserve leading list markers / enumeration such as "1.", "2.", "-", "*", "•" **unchanged** to keep bullet-point and numbering structure intact.
    • Do NOT translate code, URLs, or markdown syntax.  Preserve placeholders like {{variable}} intact.

    Output STRICTLY in JSON with a single key ``text`` containing the translated paragraph.

    ---------- BEGIN CONTEXT ----------
    PREVIOUS_TRANSLATED_PARAGRAPH:
    {prev_translated}

    NEXT_ORIGINAL_PARAGRAPH:
    {next_original}
    ---------- END CONTEXT ------------

    <<<CURR>>>
    {current}
    <<<CURR>>>
"""
)
