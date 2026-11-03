import importlib.util
from pathlib import Path
import re
import shutil
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("build_site", ROOT / "scripts/build_site.py")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class BuildSiteTest(unittest.TestCase):
    def test_published_modules_use_js_and_matching_content_hashes(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            builder.build(ROOT, output)
            html = (output / "index.html").read_text()
            app_name = re.search(r'src="\./(app-[a-f0-9]+\.js)"', html)[1]
            css_name = re.search(r'href="\./(styles-[a-f0-9]+\.css)"', html)[1]
            app = (output / app_name).read_text()
            core_name = re.search(r"from '\./(core-[a-f0-9]+\.js)'", app)[1]
            self.assertEqual(app_name, builder.asset_name("app", app, "js"))
            self.assertEqual(core_name, builder.asset_name("core", (ROOT / "core.mjs").read_text(), "js"))
            self.assertEqual((output / css_name).read_bytes(), (ROOT / "styles.css").read_bytes())
            self.assertNotIn(".mjs", app)
            roadmap_name = re.search(r"from '\./(roadmap-[a-f0-9]+\.js)'", app)[1]
            roadmap = (output / roadmap_name).read_text()
            roadmap_core_name = re.search(r"from '\./(roadmap-core-[a-f0-9]+\.js)'", roadmap)[1]
            roadmap_core = (output / roadmap_core_name).read_text()
            self.assertEqual(roadmap_name, builder.asset_name("roadmap", roadmap, "js"))
            self.assertEqual(roadmap_core_name, builder.asset_name("roadmap-core", roadmap_core, "js"))
            self.assertIn(f"'./{core_name}'", roadmap_core)
            self.assertNotIn(".mjs", roadmap)
            self.assertNotIn(".mjs", roadmap_core)
            self.assertNotIn('src="./app.mjs"', html)
            self.assertFalse(list(output.glob("*.mjs")))
            for name in ["data.json", "throughput.json", "Lead Times - 2024-25.xlsx", "Throughput Daily.xlsx"]:
                self.assertEqual((output / name).read_bytes(), (ROOT / name).read_bytes())

    def test_core_changes_invalidate_both_core_and_app_urls(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in [
                "index.html", "app.mjs", "core.mjs", "roadmap.mjs", "roadmap-core.mjs", "styles.css",
                "data.json", "throughput.json", "Lead Times - 2024-25.xlsx", "Throughput Daily.xlsx",
            ]:
                shutil.copyfile(ROOT / name, root / name)
            output = root / "_site"
            builder.build(root, output)
            before = (output / "index.html").read_text()
            app_before = re.search(r'src="\./([^"]+)"', before)[1]
            original_app = (output / app_before).read_text()
            core = root / "core.mjs"
            core.write_text(core.read_text() + "\nexport const buildTest = true;\n")
            builder.build(root, output)
            after = (output / "index.html").read_text()
            app_after = re.search(r'src="\./([^"]+)"', after)[1]
            self.assertNotEqual(app_before, app_after)
            core_import = r"from '(\./core-[a-f0-9]+\.js)'"
            self.assertNotEqual(
                re.search(core_import, original_app)[1],
                re.search(core_import, (output / app_after).read_text())[1],
            )


if __name__ == "__main__":
    unittest.main()
