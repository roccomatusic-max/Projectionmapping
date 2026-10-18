"""Settings read from the environment and from .env files."""

from __future__ import annotations

import pytest

from app.config import Settings


@pytest.mark.parametrize(("value", "expected"), [
    ("", []),  # docker-compose passes an unset variable as empty
    ("ops@example.com", ["ops@example.com"]),
    ("a@example.com, b@example.com", ["a@example.com", "b@example.com"]),
    ('["a@example.com"]', ["a@example.com"]),
])
def test_alert_recipients_are_comma_separated(monkeypatch, value, expected):
    monkeypatch.setenv("ALERT_EMAIL_TO", value)
    assert Settings().alert_email_to == expected


def test_the_example_env_file_loads(tmp_path, monkeypatch):
    from pathlib import Path

    example = Path(__file__).resolve().parents[2] / ".env.example"
    (tmp_path / ".env").write_text(example.read_text(encoding="utf-8"), encoding="utf-8")
    monkeypatch.chdir(tmp_path)
    for name in ("CORS_ORIGINS", "ALERT_EMAIL_TO"):
        monkeypatch.delenv(name, raising=False)
    settings = Settings()
    assert settings.cors_origins == ["http://localhost:5173"]
    assert settings.alert_email_to == []
