"""Serving the built web UI from the API process."""

from __future__ import annotations

import importlib

import pytest
from httpx import ASGITransport, AsyncClient


@pytest.fixture
def spa(tmp_path, monkeypatch):
    """app.main rebuilt against a static folder reached through a symlink,
    as in the Mac app, where PyInstaller links Contents/Frameworks/static to
    Contents/Resources/static."""
    real = tmp_path / "Resources" / "static"
    (real / "assets").mkdir(parents=True)
    (real / "index.html").write_text("<!doctype html><title>app</title>", encoding="utf-8")
    (real / "media-sw.js").write_text("self.addEventListener('fetch', () => {})", encoding="utf-8")
    (real / "assets" / "index-abc.js").write_text("console.log(1)", encoding="utf-8")
    frameworks = tmp_path / "Frameworks"
    frameworks.mkdir()
    (frameworks / "static").symlink_to(real, target_is_directory=True)

    import app.main as main_module
    import app.paths as paths_module

    monkeypatch.setattr(paths_module, "static_dir", lambda: frameworks / "static")
    importlib.reload(main_module)
    try:
        yield main_module.app
    finally:
        monkeypatch.undo()
        importlib.reload(main_module)


async def get(app, path):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        return await client.get(path)


async def test_root_files_are_served_through_a_symlinked_static_folder(spa):
    response = await get(spa, "/media-sw.js")
    assert response.status_code == 200
    assert "addEventListener" in response.text
    assert "javascript" in response.headers["content-type"]


async def test_the_page_is_revalidated_so_an_update_reaches_the_browser(spa):
    for path in ("/", "/projectors/3"):
        response = await get(spa, path)
        assert response.status_code == 200
        assert "<title>app</title>" in response.text
        assert response.headers.get("cache-control") == "no-cache"


async def test_static_files_stay_inside_the_static_folder(spa, tmp_path):
    (tmp_path / "secret.txt").write_text("secret", encoding="utf-8")
    response = await get(spa, "/../../secret.txt")
    assert "secret" not in response.text
    response = await get(spa, "/assets/index-abc.js")
    assert response.status_code == 200
