"""Build Pages assets with JavaScript MIME-safe, content-addressed filenames."""
import hashlib
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]


def asset_name(stem, content, extension):
    digest = hashlib.sha256(content.encode("utf-8")).hexdigest()[:16]
    return f"{stem}-{digest}.{extension}"


def build(root=ROOT, output=None):
    output = output if output is not None else root / "_site"
    output.mkdir(parents=True, exist_ok=True)
    core = (root / "core.mjs").read_text(encoding="utf-8")
    core_name = asset_name("core", core, "js")
    roadmap_core = (root / "roadmap-core.mjs").read_text(encoding="utf-8")
    if roadmap_core.count("'./core.mjs'") != 1:
        raise ValueError("Expected exactly one core module import in roadmap-core.mjs")
    roadmap_core = roadmap_core.replace("'./core.mjs'", f"'./{core_name}'")
    roadmap_core_name = asset_name("roadmap-core", roadmap_core, "js")
    roadmap = (root / "roadmap.mjs").read_text(encoding="utf-8")
    if roadmap.count("'./roadmap-core.mjs'") != 1:
        raise ValueError("Expected exactly one roadmap core import in roadmap.mjs")
    roadmap = roadmap.replace("'./roadmap-core.mjs'", f"'./{roadmap_core_name}'")
    roadmap_name = asset_name("roadmap", roadmap, "js")
    app = (root / "app.mjs").read_text(encoding="utf-8")
    if app.count("'./core.mjs'") != 1:
        raise ValueError("Expected exactly one core module import in app.mjs")
    app = app.replace("'./core.mjs'", f"'./{core_name}'")
    if app.count("'./roadmap.mjs'") != 1:
        raise ValueError("Expected exactly one roadmap module import in app.mjs")
    app = app.replace("'./roadmap.mjs'", f"'./{roadmap_name}'")
    app_name = asset_name("app", app, "js")
    styles = (root / "styles.css").read_text(encoding="utf-8")
    styles_name = asset_name("styles", styles, "css")
    html = (root / "index.html").read_text(encoding="utf-8")
    if html.count('src="./app.mjs"') != 1 or html.count('href="./styles.css"') != 1:
        raise ValueError("Expected application script and stylesheet references in index.html")
    html = html.replace('src="./app.mjs"', f'src="./{app_name}"')
    html = html.replace('href="./styles.css"', f'href="./{styles_name}"')
    for name, content in [
        ("index.html", html), (core_name, core), (app_name, app), (styles_name, styles),
        (roadmap_core_name, roadmap_core), (roadmap_name, roadmap),
    ]:
        (output / name).write_text(content, encoding="utf-8")
    for name in ["data.json", "throughput.json", "Lead Times - 2024-25.xlsx", "Throughput Daily.xlsx"]:
        shutil.copyfile(root / name, output / name)
    print(f"Built {output}: {app_name}, {core_name}, {styles_name}")


if __name__ == "__main__":
    build()
