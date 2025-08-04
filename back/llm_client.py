import os
import logging
from .cancel_manager import is_cancelled
from typing import Optional, Literal
import time
from pydantic import BaseModel
import requests
import yaml
from dotenv import load_dotenv
from transformers import pipeline
from .filler_agent.prompts import GEMMA_SYSTEM_PROMPT
from .llm_priority_queue import get_llm_queue, Priority

load_dotenv()

# Try to import both clients
try:
    from openai import OpenAI
    import openai as _openai_module

    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False
    logging.warning("OpenAI package not available")

try:
    from groq import Groq

    GROQ_AVAILABLE = True
except ImportError:
    GROQ_AVAILABLE = False
    logging.warning("Groq package not available")

try:
    from ollama import Client

    OLLAMA_AVAILABLE = True
except ImportError:
    OLLAMA_AVAILABLE = False
    logging.warning("Ollama package not available")

# Try to import Google GenAI client
try:
    import google.generativeai as genai
    from google.generativeai.types import GenerationConfig

    GOOGLE_AVAILABLE = True
except ImportError:
    GOOGLE_AVAILABLE = False
    logging.warning("Google generativeai package not available")

_openai_client = None
_groq_client = None
_google_client = None
_max_retries = 5  # Increased retries for rate limits
_backoff_factor = 2.0
_pipe = None
_ollama_client = None

# Rate limiting configuration - can be adjusted for free tier users
GROQ_FREE_TIER_MODE = True  # Set to True for more aggressive rate limiting

_last_groq_request_time = 0
_groq_min_interval = (
    2.0 if GROQ_FREE_TIER_MODE else 0.2
)  # 2 seconds for free tier, 0.2 second for paid

# Default provider and model configurations
DEFAULT_PROVIDER = "ollama"  # Changed default to groq
DEFAULT_MODELS = {
    "openai": "gpt-4.1",
    "groq": "llama-3.3-70b-versatile",
    "google": "gemini-2.5-flash",
    "local": "gemma",
    "ollama": "gemma3n:e4b-it-q8_0",
    # "ollama": "qwen3:8b-q8_0",
}

# New: default OCR model name (pulled from Ollama library)
DEFAULT_OCR_MODEL = "benhaotang/Nanonets-OCR-s:latest"


def init_openai() -> Optional[OpenAI]:
    """Initialize OpenAI API client using the OPENAI_API_KEY environment variable."""
    if not OPENAI_AVAILABLE:
        logging.error("OpenAI package not installed")
        return None

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        logging.warning("OPENAI_API_KEY environment variable not set.")
        return None

    try:
        client = OpenAI(api_key=api_key)
        return client
    except Exception as e:
        logging.error(f"Failed to initialize OpenAI client: {e}")
        return None


def init_groq() -> Optional[Groq]:
    """Initialize Groq API client using the GROQ_API_KEY environment variable."""
    if not GROQ_AVAILABLE:
        logging.error("Groq package not installed")
        return None

    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        logging.warning("GROQ_API_KEY environment variable not set.")
        return None

    try:
        client = Groq(api_key=api_key)
        return client
    except Exception as e:
        logging.error(f"Failed to initialize Groq client: {e}")
        return None


# ---------------------------------------------------------------------------
# Google Gemini (genai) initialisation
# ---------------------------------------------------------------------------


def init_google():
    """Initialise Google Generative AI client using the GOOGLE_API_KEY env var."""
    if not GOOGLE_AVAILABLE:
        logging.error("Google generativeai package not installed")
        return None

    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        logging.warning("GOOGLE_API_KEY environment variable not set.")
        return None

    try:
        genai.configure(api_key=api_key)
        # Return the configured module itself; callers can instantiate models as needed
        return genai
    except Exception as e:
        logging.error(f"Failed to initialise Google genai client: {e}")
        return None


def init_ollama():
    """Initialize Ollama client using the native Ollama library."""
    if not OLLAMA_AVAILABLE:
        logging.error("Ollama package not installed")
        return None

    try:
        client = Client(host="http://localhost:11434")
        return client
    except Exception as e:
        logging.error(f"Failed to initialize Ollama client: {e}")
        return None


def init_pipe():
    global _pipe
    if _pipe is None:
        _pipe = pipeline("image-text-to-text", model="google/gemma-3n-e4b")
    return _pipe


# ----------------------------
# Image OCR via Ollama vision
# ----------------------------
import base64


def ocr(
    image_path: str, *, model: str = DEFAULT_OCR_MODEL, prompt: str | None = None
) -> str:
    """Run OCR on *image_path* using the specified Ollama multimodal model.

    The function encodes the image as base-64 and sends it to the local
    ``ollama`` server using the ``/api/generate`` endpoint.  It expects a JSON
    response containing a ``response`` field with the recognised text.

    Parameters
    ----------
    image_path : str
        Path to the image file to be recognised.
    model : str, optional
        The Ollama model to use.  Defaults to
        ``benhaotang/Nanonets-OCR-s:latest``.
    prompt : str | None, optional
        Optional prompt to prepend.  If *None*, a default instruction is used
        that asks the model to return only the plain text it sees in the
        image.

    Returns
    -------
    str
        The extracted text, or an empty string on failure.
    """

    if prompt is None:
        prompt = "Extract and return the plain text you can read from this image. Do not add any additional commentary."

    try:
        with open(image_path, "rb") as f:
            image_data = f.read()
    except Exception as e:
        logging.error(f"Failed to read image {image_path}: {e}")
        return ""

    # Use native Ollama client if available
    if OLLAMA_AVAILABLE:
        try:
            client = Client(host="http://localhost:11434")
            response = client.generate(
                model=model,
                prompt=prompt,
                images=[image_data],
            )
            text = response.get("response", "")
            return text.strip()
        except Exception as e:
            logging.error(f"Ollama OCR request failed for {image_path}: {e}")
            return ""
    else:
        # Fallback to requests if Ollama library not available
        try:
            b64_img = base64.b64encode(image_data).decode("utf-8")
            payload = {
                "model": model,
                "prompt": prompt,
                "images": [b64_img],
                "stream": False,
            }
            resp = requests.post(
                "http://localhost:11434/api/generate", json=payload, timeout=120
            )
            resp.raise_for_status()
            data = resp.json()
            text = data.get("response", "")
            return text.strip()
        except Exception as e:
            logging.error(f"Ollama OCR request failed for {image_path}: {e}")
            return ""


def init_anythingllm():
    """Initialize the AnythingLLM client using the ANYTHINGLLM_API_KEY environment variable."""
    try:
        with open("./back/config.yaml", "r") as file:
            config = yaml.safe_load(file)
    except FileNotFoundError:
        raise FileNotFoundError(
            "config.yaml not found. Please create a config file with your API key and base URL."
        )

    api_key = config["api_key"]
    if not api_key:
        raise ValueError("Anything LLM API key not found in config.yaml.")

    base_url = config["model_server_base_url"]
    if not base_url:
        raise ValueError("Base URL not found in config.yaml.")

    workspace_slug = config["workspace_slug"]
    if not workspace_slug:
        raise ValueError("Workspace slug not found in config.yaml.")

    chat_url = f"{base_url}/workspace/{workspace_slug}/chat"

    headers = {
        "accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": "Bearer " + api_key,
    }

    return headers, chat_url


def test_openai():
    """Test OpenAI API connectivity with a simple chat completion call."""
    client = get_openai_client()
    if not client:
        raise RuntimeError("OpenAI client not available")

    try:
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": "Hello, world!"}],
            max_tokens=5,
        )
        text = response.choices[0].message.content.strip()
        logging.info(f"OpenAI API test successful: {text}")
        # print(f"OpenAI API test successful: {text}")  # Removed for production
    except Exception as e:
        logging.error("OpenAI API test failed: %s", e)
        raise


def test_groq():
    """Test Groq API connectivity with a simple chat completion call."""
    client = get_groq_client()
    if not client:
        raise RuntimeError("Groq client not available")

    try:
        response = client.chat.completions.create(
            model=DEFAULT_MODELS["groq"],
            messages=[{"role": "user", "content": "Hello, world!"}],
        )
        text = response.choices[0].message.content.strip()
        logging.info(f"Groq API test successful: {text}")
        print(f"Groq API test successful: {text}")
    except Exception as e:
        logging.error("Groq API test failed: %s", e)
        raise


def test_ollama():
    """Test Ollama API connectivity with a simple chat completion call."""
    client = get_ollama_client()
    if not client:
        raise RuntimeError("Ollama client not available")

    try:
        response = client.chat(
            model=DEFAULT_MODELS["ollama"],
            messages=[
                {
                    "role": "user",
                    "content": "Return JSON with a 'message' key whose value is 'Hello, world!'",
                }
            ],
            format="json",
        )
        text = response["message"]["content"].strip()
        logging.info(f"Ollama API test successful: {text}")
        print(f"Ollama API test successful: {text}")
    except Exception as e:
        logging.error("Ollama API test failed: %s", e)
        raise


def get_openai_client() -> Optional[OpenAI]:
    """Lazily initialize and return the OpenAI client."""
    global _openai_client
    if _openai_client is None:
        _openai_client = init_openai()
    return _openai_client


def get_groq_client() -> Optional[Groq]:
    """Lazily initialize and return the Groq client."""
    global _groq_client
    if _groq_client is None:
        _groq_client = init_groq()
    return _groq_client


def get_google_client():
    """Lazily initialise and return Google genai client."""
    global _google_client
    if _google_client is None:
        _google_client = init_google()
    return _google_client


def get_ollama_client():
    """Lazily initialize and return the Ollama client."""
    global _ollama_client
    if _ollama_client is None:
        _ollama_client = init_ollama()
    return _ollama_client


def get_pipe():
    global _pipe
    if _pipe is None:
        _pipe = init_pipe()
    return _pipe


def get_anythingllm_client():
    headers, chat_url = init_anythingllm()
    return headers, chat_url


def query_gpt(
    prompt: str,
    *,
    model: Optional[str] = None,
    provider: Optional[
        Literal["openai", "groq", "google", "anythingllm", "local", "ollama"]
    ] = None,
    cancel_id: str | None = None,
    response_format: Optional[type[BaseModel]] = None,
    priority: Priority = Priority.NORMAL,
) -> str:
    
    """Send a prompt to the LLM API and return the generated text, with retry on rate limits.

    Args:
        prompt: The text prompt to send
        model: Specific model to use (optional, will use default for provider)
        provider: Which provider to use ("openai", "groq", "google", etc. defaults to groq)
        priority: Priority level for the queue (defaults to NORMAL)

    Returns:
        Generated text response
    """
    # Always use the queue system for proper concurrency control
    queue = get_llm_queue()
    future = queue.submit(
        _query_gpt_internal,
        prompt,
        model,
        provider,
        cancel_id=cancel_id,
        response_format=response_format,
        priority=priority,
    )
    return future.result()


def _query_gpt_internal(
    prompt: str,
    model: Optional[str] = None,
    provider: Optional[
        Literal["openai", "groq", "google", "anythingllm", "local", "ollama"]
    ] = None,
    *,
    cancel_id: str | None = None,
    response_format: Optional[type[BaseModel]] = None,
) -> str:
    """Internal implementation of query_gpt without priority queue."""
    global _last_groq_request_time

    # Abort early if cancelled
    if cancel_id and is_cancelled(cancel_id):
        raise RuntimeError("LLM task cancelled")

    # Determine provider
    if provider is None:
        provider = DEFAULT_PROVIDER

    # Determine model
    if model is None:
        if provider in ["openai", "groq", "ollama", "google"]:
            model = DEFAULT_MODELS.get(provider)
            if not model:
                raise ValueError(
                    f"No default model configured for provider: {provider}"
                )

    # Get appropriate client
    if provider == "openai":
        client = get_openai_client()
        if not client:
            raise RuntimeError("OpenAI client not available")
    elif provider == "groq":
        client = get_groq_client()
        if not client:
            raise RuntimeError("Groq client not available")

        # Rate limiting for Groq free tier
        current_time = time.time()
        time_since_last = current_time - _last_groq_request_time
        if time_since_last < _groq_min_interval:
            sleep_time = _groq_min_interval - time_since_last
            logging.info(
                f"Rate limiting: waiting {sleep_time:.1f}s before Groq request"
            )
            time.sleep(sleep_time)
        _last_groq_request_time = time.time()
    elif provider == "anythingllm":
        headers, chat_url = get_anythingllm_client()
        if not headers or not chat_url:
            raise RuntimeError("AnythingLLM client not available")
    elif provider == "ollama":
        client = get_ollama_client()
        if not client:
            raise RuntimeError("Ollama client not available")

    elif provider == "google":
        client = get_google_client()
        if not client:
            raise RuntimeError("Google genai client not available")

    # Local provider does not require external client initialisation
    elif provider == "local":
        client = get_pipe()

    logging.debug(f"Sending prompt to {provider} {model}: {prompt[:100]}...")

    for retry in range(_max_retries):
        try:
            if provider in ["openai", "groq"]:
                # Build the kwargs for the chat completion call, including
                # an optional OpenAI-compatible ``response_format`` argument
                chat_kwargs = {
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                }
                if response_format is not None:
                    # OpenAI-compatible response_format expects an outer object specifying the type
                    # and, optionally, an inner JSON schema. See:
                    # https://platform.openai.com/docs/guides/text-generation/json-mode
                    chat_kwargs["response_format"] = response_format

                try:
                    response = client.chat.completions.parse(**chat_kwargs)
                except Exception as e:
                    # If we got an exception and response_format was set, try again without it
                    if "response_format" in chat_kwargs:
                        logging.warning(
                            f"{provider} API call failed with response_format: {e}. Retrying without response_format."
                        )
                        chat_kwargs.pop("response_format")
                        response = client.chat.completions.parse(**chat_kwargs)
                    else:
                        raise

                content = response.choices[0].message.content
                if content is None:
                    logging.warning(f"{provider} API returned None content")
                    return ""

                result = content.strip()
                logging.debug(f"{provider} API response: {result[:100]}...")
                return result
            elif provider == "ollama":
                # Use native Ollama client
                chat_kwargs = {
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "think": False,
                }
                if response_format is not None:
                    # Ollama supports "json" format
                    chat_kwargs["format"] = response_format.model_json_schema()

                try:
                    response = client.chat(**chat_kwargs)
                    content = response["message"]["content"]
                    if content is None:
                        logging.warning(f"{provider} API returned None content")
                        return ""

                    result = content.strip()
                    logging.debug(f"{provider} API response: {result[:100]}...")
                    return result
                except Exception as e:
                    logging.error(f"Ollama API call failed: {e}")
                    raise
            elif provider == "google":
                # Gemini call via google-genai SDK ---------------------------------
                generation_config = None
                if response_format is not None:
                    try:
                        generation_config = GenerationConfig(
                            response_mime_type="application/json",
                            response_schema=response_format,
                        )
                    except Exception as conv_err:
                        logging.warning(
                            f"Failed to convert response_format for Google provider: {conv_err}. Proceeding without schema enforcement."
                        )

                try:
                    # Instantiate the requested Gemini/Gemini Flash model and generate the response
                    model_instance = client.GenerativeModel(model)
                    resp = model_instance.generate_content(
                        prompt,
                        generation_config=generation_config,
                    )
                    result = resp.text.strip() if hasattr(resp, "text") else str(resp)
                    logging.debug(f"Google API response: {result[:100]}...")
                    return result
                except Exception as e:
                    logging.error(f"Google genai API call failed: {e}")
                    raise

            elif provider == "local":
                # Use the locally loaded Gemma model for text generation.
                try:
                    messages = [
                        {
                            "role": "system",
                            "content": [{"type": "text", "text": GEMMA_SYSTEM_PROMPT}],
                        },
                        {"role": "user", "content": [{"type": "text", "text": prompt}]},
                    ]
                    output = client(text=messages, max_new_tokens=512)
                    return output[0]["generated_text"][-1]["content"]
                except Exception as e:
                    logging.error(f"Local Gemma query failed: {e}")
                    raise

            elif provider == "anythingllm":
                data = {
                    "message": prompt,
                    "mode": "chat",
                    "sessionId": "example-session-id",
                    "attachments": [],
                }
                response = requests.post(chat_url, headers=headers, json=data)
                if response.status_code != 200:
                    logging.error(
                        f"AnythingLLM API call failed: {response.status_code} {response.text}"
                    )
                    return ""

                result = response.json().get("textResponse", "").strip()
                logging.debug(f"AnythingLLM API response: {result[:100]}...")
                return result

        except Exception as e:
            # Handle rate limiting for both providers
            is_rate_limit = False
            if provider == "openai" and OPENAI_AVAILABLE:
                # Compatible with both legacy and new OpenAI Python client versions
                if (
                    hasattr(_openai_module, "error")
                    and hasattr(_openai_module.error, "RateLimitError")
                    and isinstance(e, _openai_module.error.RateLimitError)
                ) or (
                    hasattr(_openai_module, "RateLimitError")
                    and isinstance(e, _openai_module.RateLimitError)
                ):
                    is_rate_limit = True
            elif provider == "groq":
                # Groq rate limiting detection - check for various rate limit indicators
                error_str = str(e).lower()
                if any(
                    indicator in error_str
                    for indicator in ["rate limit", "429", "too many requests", "quota"]
                ):
                    is_rate_limit = True
            elif provider == "google":
                # Google GenAI rate limiting detection - check for various rate limit indicators
                error_str = str(e).lower()
                if any(
                    indicator in error_str
                    for indicator in ["rate limit", "429", "too many requests", "quota"]
                ):
                    is_rate_limit = True

            if is_rate_limit:
                # Exponential backoff with longer delays for Groq
                if provider == "groq":
                    base_wait = (
                        10.0 if GROQ_FREE_TIER_MODE else 5.0
                    )  # Longer wait for free tier
                else:
                    base_wait = 2.0
                wait = base_wait * (_backoff_factor**retry)
                logging.warning(
                    f"Rate limit reached for {provider}, retrying in {wait:.1f} seconds (retry {retry+1}/{_max_retries})"
                )
                time.sleep(wait)

                # Update last request time for Groq
                if provider == "groq":
                    _last_groq_request_time = time.time()
                continue

            logging.error(f"{provider} API call failed: {e}")
            raise

    # If we exit loop without return, retries exhausted
    raise RuntimeError(f"Max retries exceeded for {provider} query_gpt")


# Backward compatibility functions
def get_client():
    """Backward compatibility function - returns the default provider client."""
    if DEFAULT_PROVIDER == "groq":
        return get_groq_client()
    else:
        return get_openai_client()
