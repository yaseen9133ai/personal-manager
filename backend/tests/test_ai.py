import os

import pytest

from backend.ai import MODEL, get_client

requires_groq_key = pytest.mark.skipif(
    not os.environ.get("GROQ_API_KEY"), reason="GROQ_API_KEY not set"
)


@requires_groq_key
def test_groq_connectivity_two_plus_two() -> None:
    client = get_client()
    response = client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": "What is 2+2? Reply with just the number."}],
    )
    content = response.choices[0].message.content
    assert content is not None
    assert "4" in content
