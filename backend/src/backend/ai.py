from pathlib import Path

from dotenv import load_dotenv
from groq import Groq

# Repo-root .env, for local `uv run uvicorn` dev. In Docker, GROQ_API_KEY is
# already injected via `docker run --env-file .env` and this file doesn't
# exist in the image (see .dockerignore), so load_dotenv() is a harmless
# no-op there -- real environment variables always win either way.
_REPO_ROOT_ENV = Path(__file__).resolve().parents[3] / ".env"
load_dotenv(_REPO_ROOT_ENV, override=False)

MODEL = "openai/gpt-oss-120b"

_client: Groq | None = None


def get_client() -> Groq:
    global _client
    if _client is None:
        _client = Groq()
    return _client
