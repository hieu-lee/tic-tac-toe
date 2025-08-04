# Prompt templates for context extraction

EXTRACTION_PROMPT_TEMPLATE = '''
Assume the text describes the same person who will later fill the form (the USER). Extract the following personal information from the text below and return as a JSON object.

IMPORTANT: You MUST provide a "reasoning_process" field that explains your extraction decisions step-by-step. Think carefully about each field and justify why you extracted specific values or left them empty.

Required JSON structure:
- reasoning_process: Your step-by-step reasoning for the extractions
- full_name
- first_name
- middle_names
- last_name
- phone_number
- email
- address
- date_of_birth

Text:
"""
{content}
"""

INSTRUCTIONS:
1. First, analyze the text carefully and identify any personal information present
2. For each field, explain in the reasoning_process why you extracted that specific value or why you left it empty
3. Be thorough and careful - explain any assumptions or inferences you make
4. Use empty strings for missing fields, ONLY add the fields that are present in the text if you are sure about the value
5. Return ONLY a valid JSON object. Do not include any markdown formatting, code blocks, or explanatory text - just the raw JSON object.'''


def extraction_retry_prompt(content: str) -> str:
    """Return a retry prompt for the personal-info extraction task."""
    base_prompt = EXTRACTION_PROMPT_TEMPLATE.format(content=content)
    return (
        "IMPORTANT: Your previous response could not be parsed as JSON. "
        "Please respond again following the guidelines EXACTLY.\n\n"  # noqa: E501
        f"{base_prompt}\n\n"
        "CRITICAL FORMATTING REQUIREMENTS:\n"
        "1. Respond with ONLY a JSON object – no additional text or code blocks.\n"
        "2. Use double quotes for all keys and string values.\n"
        "3. Ensure syntactically valid JSON: no trailing commas, matching braces.\n"
        "4. The reasoning_process field is MANDATORY - explain your extraction decisions.\n"
        "5. Omit any keys whose values are unknown – or use empty strings as instructed.\n"
        "6. Do NOT include markdown fences, headings, or explanations.\n\n"
        'Example of correct format: {"reasoning_process": "I found the full name John Doe in the first line...", "full_name": "John Doe", "phone_number": "123-456-7890", "email": "", ...}'
    )


def context_value_search_prompt(new_key: str, aggregated_corpus: str) -> str:
    return (
        "You are an assistant tasked with retrieving information from a user's personal document corpus.\n\n"
        f"REQUESTED KEY: {new_key}\n\n"
        f"CORPUS:\n{aggregated_corpus}\n\n"
        "INSTRUCTIONS:\n"
        "1. THINK CAREFULLY: Before responding, thoroughly analyze the corpus to find information that matches the requested key.\n"
        "2. Consider variations and related terms (e.g., 'birth_date' might appear as 'date of birth', 'DOB', 'birthday', etc.).\n"
        "3. Examine the corpus and determine the single most appropriate value for the requested key.\n"
        "4. If the information is clearly present, respond with ONLY that value.\n"
        "5. If the information is not present or you are uncertain, respond with the single word null (without quotes).\n"
        "6. Do NOT provide any additional text, explanation, or formatting."
    )
